import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import { DomainError, normalizePhone } from "./domain";

// Sign-in codes sent to the person's phone. A code is 6 digits, lasts 10
// minutes, allows 5 tries, and only a hash of it is stored. Requests are
// rate-limited per number and per network address.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 45 * 1000;
const PER_PHONE_PER_HOUR = 5;
const PER_IP_PER_HOUR = 20;

export type OtpProvider = "make" | "twilio" | "bulksms" | "textbee" | "test";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ characters) in production.");
  return "dev-only-secret-change-me-dev-only-secret";
}

const hash = (phone: string, code: string) => createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");

/** Which sender is configured. "test" shows the code on screen and is refused in production unless explicitly allowed. */
export function otpProvider(): OtpProvider | null {
  const chosen = process.env.OTP_PROVIDER as OtpProvider | undefined;
  if (chosen === "test") {
    const allowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_OTP === "yes-insecure";
    return allowed ? "test" : null;
  }
  if (chosen) return chosen;
  if (process.env.MAKE_WEBHOOK_URL) return "make";
  if (process.env.TWILIO_ACCOUNT_SID) return "twilio";
  if (process.env.BULKSMS_TOKEN_ID) return "bulksms";
  // Your own Android phone (textbee). Checked last, so adding a paid sender later takes over automatically.
  if (process.env.TEXTBEE_API_KEY) return "textbee";
  return process.env.NODE_ENV === "production" ? null : "test";
}

function message(code: string) {
  return `${code} is your Afriheart code. It expires in 10 minutes. Don't share it with anyone.`;
}

async function deliver(provider: OtpProvider, phone: string, code: string): Promise<void> {
  const to = `+${phone}`;
  const timeout = AbortSignal.timeout(10000);
  if (provider === "test") return;
  if (provider === "make") {
    // Same Make.com scenario style as Grace: the scenario sends it by WhatsApp or SMS.
    const res = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.MAKE_WEBHOOK_SECRET ? { "x-notify-secret": process.env.MAKE_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify({ type: "verification_code", phone: to, code, text: message(code) }),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`Make webhook ${res.status}`);
    return;
  }
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({ To: to, Body: message(code) });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) body.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    else body.set("From", process.env.TWILIO_FROM ?? "");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body, signal: timeout,
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (provider === "bulksms") {
    // BulkSMS (South African provider): https://www.bulksms.com/developer/json/v1/
    const auth = Buffer.from(`${process.env.BULKSMS_TOKEN_ID}:${process.env.BULKSMS_TOKEN_SECRET}`).toString("base64");
    const res = await fetch("https://api.bulksms.com/v1/messages", {
      method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ to, body: message(code) }), signal: timeout,
    });
    if (!res.ok) throw new Error(`BulkSMS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (provider === "textbee") {
    // textbee: an Android phone sends the SMS from its own SIM. https://textbee.dev
    const deviceId = process.env.TEXTBEE_DEVICE_ID?.trim();
    const res = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
      method: "POST", headers: { "x-api-key": process.env.TEXTBEE_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ recipients: [to], message: message(code), ...(deviceId ? { deviceId } : {}) }), signal: timeout,
    });
    if (!res.ok) throw new Error(`textbee ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Sends a code. Returns the code itself only for the "test" provider (shown on screen in development). */
export async function requestCode(rawPhone: string, ip: string): Promise<{ phone: string; testCode: string | null }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new DomainError("That phone number doesn't look right. Try 082 123 4567.");
  const provider = otpProvider();
  if (!provider) throw new DomainError("Sign-in codes aren't set up on this server yet. Ask the Afriheart team.");
  const store = getStore();
  const now = Date.now();
  const hourAgo = new Date(now - 3600000).toISOString();
  const recent = (await store.list("phone_codes", { phone })).filter((c) => c.created_at > hourAgo);
  const last = recent.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (last && now - Date.parse(last.created_at) < RESEND_AFTER_MS) {
    throw new DomainError("A code was just sent. Wait a moment before asking for another.");
  }
  if (recent.length >= PER_PHONE_PER_HOUR) throw new DomainError("Too many codes for this number. Try again in an hour.");
  const fromIp = (await store.list("phone_codes", { ip })).filter((c) => c.created_at > hourAgo);
  if (fromIp.length >= PER_IP_PER_HOUR) throw new DomainError("Too many sign-in attempts from this network. Try again later.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Older codes for this number stop working once a new one is sent.
  for (const c of recent.filter((c) => !c.consumed)) await store.update("phone_codes", c.id, { consumed: true });
  await store.insert("phone_codes", {
    id: randomUUID(), phone, code_hash: hash(phone, code), ip, attempts: 0, consumed: false,
    expires_at: new Date(now + CODE_TTL_MS).toISOString(), created_at: new Date(now).toISOString(),
  });
  try {
    await deliver(provider, phone, code);
  } catch (e) {
    console.error("[otp] sending failed:", (e as Error).message);
    throw new DomainError("We couldn't send the code. Check the number and try again.");
  }
  return { phone, testCode: provider === "test" ? code : null };
}

/** Checks a code. Throws a friendly error for wrong, expired or used-up codes. */
export async function verifyCode(rawPhone: string, code: string): Promise<string> {
  const phone = normalizePhone(rawPhone);
  const clean = code.replace(/\D/g, "");
  if (!phone || clean.length !== 6) throw new DomainError("Enter the 6-digit code.");
  const store = getStore();
  const live = (await store.list("phone_codes", { phone }))
    .filter((c) => !c.consumed)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!live || Date.parse(live.expires_at) < Date.now()) throw new DomainError("That code has expired. Ask for a new one.");
  if (live.attempts >= MAX_ATTEMPTS) throw new DomainError("Too many wrong tries. Ask for a new code.");
  const ok = timingSafeEqual(Buffer.from(hash(phone, clean)), Buffer.from(live.code_hash));
  if (!ok) {
    await store.update("phone_codes", live.id, { attempts: live.attempts + 1, consumed: live.attempts + 1 >= MAX_ATTEMPTS });
    throw new DomainError(live.attempts + 1 >= MAX_ATTEMPTS ? "Too many wrong tries. Ask for a new code." : "That code isn't right. Check it and try again.");
  }
  await store.update("phone_codes", live.id, { consumed: true });
  return phone;
}
