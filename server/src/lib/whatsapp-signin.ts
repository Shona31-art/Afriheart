import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import { DomainError, normalizePhone } from "./domain";
import type { WaSignin } from "./types";

// Free sign-in by WhatsApp: instead of Afriheart texting a code, the person sends a
// short WhatsApp message ("Afriheart code 482913") to Afriheart's WhatsApp number.
// Meta tells us (webhook) which number it came from; if it matches the number they
// typed, that's proof the number is theirs. Afriheart never replies, so Meta charges
// nothing, and an ordinary WhatsApp message costs the person nothing.
//
// Switched on by WHATSAPP_NUMBER (Afriheart's WhatsApp Business number),
// WHATSAPP_VERIFY_TOKEN (any phrase, also typed into Meta's webhook settings) and
// WHATSAPP_APP_SECRET (Meta app → Settings → Basic → App secret; checks that a
// webhook really came from Meta).

const TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 20 * 1000;
const PER_PHONE_PER_HOUR = 6;
const PER_IP_PER_HOUR = 20;

export type WaStatus = WaSignin["status"];

export function whatsappConfig(): { number: string; verifyToken: string; appSecret: string } | null {
  const number = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET ?? "").trim();
  if (number.length < 10 || !verifyToken || !appSecret) return null;
  return { number, verifyToken, appSecret };
}

export const whatsappSignInOn = () => whatsappConfig() !== null;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function messageFor(code: string) {
  return `Afriheart code ${code}. I'm signing in to Afriheart myself.`;
}

/** The wa.me link that opens WhatsApp with the message already typed. */
export function whatsappLink(code: string): string {
  const cfg = whatsappConfig();
  if (!cfg) throw new DomainError("WhatsApp sign-in isn't set up yet.");
  return `https://wa.me/${cfg.number}?text=${encodeURIComponent(messageFor(code))}`;
}

/** Step 1: make a code for this number. The browser keeps a secret (cookie) so only it can finish. */
export async function startWhatsAppSignIn(rawPhone: string, ip: string): Promise<{ id: string; phone: string; code: string; browserSecret: string }> {
  if (!whatsappSignInOn()) throw new DomainError("WhatsApp sign-in isn't set up yet.");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new DomainError("That phone number doesn't look right. Try 082 123 4567.");
  const store = getStore();
  const now = Date.now();
  const hourAgo = new Date(now - 3600000).toISOString();
  const recent = (await store.list("wa_signins", { phone })).filter((r) => r.created_at > hourAgo);
  const last = recent.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (last && now - Date.parse(last.created_at) < RESEND_AFTER_MS) throw new DomainError("Wait a moment before trying again.");
  if (recent.length >= PER_PHONE_PER_HOUR) throw new DomainError("Too many tries for this number. Try again in an hour.");
  if ((await store.list("wa_signins", { ip })).filter((r) => r.created_at > hourAgo).length >= PER_IP_PER_HOUR) {
    throw new DomainError("Too many sign-in attempts from this network. Try again later.");
  }
  // Earlier tries for this number stop working.
  for (const r of recent.filter((r) => r.status === "pending")) await store.update("wa_signins", r.id, { status: "expired" });

  // A code no one else is waiting on right now, so an incoming message matches exactly one sign-in.
  const pending = new Set((await store.list("wa_signins", { status: "pending" })).map((r) => r.code));
  let code = "";
  for (let i = 0; i < 20 && (!code || pending.has(code)); i++) code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const browserSecret = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await store.insert("wa_signins", {
    id, phone, code, browser_hash: sha(browserSecret), ip, status: "pending", hint: null,
    created_at: new Date(now).toISOString(), expires_at: new Date(now + TTL_MS).toISOString(), confirmed_at: null,
  });
  return { id, phone, code, browserSecret };
}

async function ownRow(id: string, browserSecret: string | undefined): Promise<WaSignin | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !browserSecret) return null;
  const row = await getStore().get("wa_signins", id);
  if (!row) return null;
  const a = Buffer.from(row.browser_hash);
  const b = Buffer.from(sha(browserSecret));
  return a.length === b.length && timingSafeEqual(a, b) ? row : null;
}

/** For the waiting screen: has the message arrived yet? */
export async function whatsappStatus(id: string, browserSecret: string | undefined): Promise<{ status: WaStatus; hint: string | null } | null> {
  const row = await ownRow(id, browserSecret);
  if (!row) return null;
  if (row.status === "pending" && Date.parse(row.expires_at) < Date.now()) return { status: "expired", hint: null };
  return { status: row.status, hint: row.hint };
}

/** Step 2: the message arrived from the right number. Returns the verified phone (once). */
export async function finishWhatsAppSignIn(id: string, browserSecret: string | undefined): Promise<string> {
  const row = await ownRow(id, browserSecret);
  if (!row) throw new DomainError("This sign-in has expired. Start again.");
  if (row.status === "used") throw new DomainError("You're already signed in with this. Start again if you signed out.");
  if (row.status !== "confirmed") throw new DomainError("We haven't received your WhatsApp message yet.");
  if (Date.now() - Date.parse(row.confirmed_at ?? row.created_at) > TTL_MS) throw new DomainError("This sign-in has expired. Start again.");
  await getStore().update("wa_signins", row.id, { status: "used" });
  return row.phone;
}

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export function validMetaSignature(rawBody: string, header: string | null): boolean {
  const cfg = whatsappConfig();
  if (!cfg || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", cfg.appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type IncomingMessage = { from?: string; type?: string; text?: { body?: string }; user_id?: string };
type WebhookBody = { entry?: { changes?: { value?: { messages?: IncomingMessage[]; contacts?: { wa_id?: string }[] } }[] }[] };

/** Handles Meta's webhook: matches each incoming "Afriheart code 123456" to a waiting sign-in. */
export async function handleWhatsAppWebhook(body: WebhookBody, now = Date.now()): Promise<number> {
  const store = getStore();
  let matched = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const msg of value.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue;
        const code = /(?:afriheart|afri)[^0-9]{0,20}(\d{6})/i.exec(msg.text.body)?.[1] ?? /\b(\d{6})\b/.exec(msg.text.body)?.[1];
        if (!code) continue;
        const row = (await store.list("wa_signins", { status: "pending" })).find((r) => r.code === code);
        if (!row) continue;
        matched++;
        if (Date.parse(row.expires_at) < now) {
          await store.update("wa_signins", row.id, { status: "expired" });
          continue;
        }
        // With WhatsApp usernames, Meta may hide the number: "from" is then an ID, not digits.
        const sender = [msg.from, ...(value.contacts ?? []).map((c) => c.wa_id)].find((v) => v && /^\d{10,15}$/.test(v));
        if (!sender) {
          await store.update("wa_signins", row.id, { status: "hidden" });
        } else if (normalizePhone(sender) !== row.phone) {
          await store.update("wa_signins", row.id, { status: "mismatch", hint: sender.slice(-4) });
        } else {
          await store.update("wa_signins", row.id, { status: "confirmed", confirmed_at: new Date(now).toISOString() });
        }
      }
    }
  }
  // Tidy up now and then: finished sign-ins aren't needed after a day.
  if (Math.random() < 0.05) {
    for (const r of await store.list("wa_signins")) {
      if (now - Date.parse(r.created_at) > 24 * 3600 * 1000) await store.remove("wa_signins", r.id);
    }
  }
  return matched;
}
