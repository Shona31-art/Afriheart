import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import type { SmsOutbox } from "./types";

// Afriheart's own SMS gateway: the "Afriheart Codes" Android app on a phone with a
// SIM checks in every few seconds, collects queued sign-in texts and sends them
// from its SIM. No SMS company and no third-party server in between.
//
// Turned on by SMS_GATEWAY_TOKEN (32+ characters), which the phone app sends as
// "Authorization: Bearer <token>". Texts are kept only until they're sent: the
// body (which holds the code) is wiped once the phone reports back.

const RETRY_AFTER_MS = 90 * 1000; // re-offer a text if the phone took it but never reported back
const MAX_ATTEMPTS = 3;
const EXPIRE_AFTER_MS = 10 * 60 * 1000; // same as a sign-in code: no point sending it later
const BATCH = 10;
const KEEP_MS = 24 * 3600 * 1000;

export type GatewayUpdate = { id: string; status: "SENT" | "DELIVERED" | "FAILED" | "PENDING"; reason?: string };
export type GatewayMessage = { id: string; to: string; content: string };

export function gatewayToken(): string | null {
  const t = (process.env.SMS_GATEWAY_TOKEN ?? "").trim();
  return t.length >= 32 ? t : null;
}

/** Constant-time check of the phone's "Authorization: Bearer …" header. */
export function gatewayAuthorized(header: string | null): boolean {
  const token = gatewayToken();
  if (!token || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7).trim()).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

export async function queueSms(phone: string, body: string): Promise<void> {
  await getStore().insert("sms_outbox", {
    id: randomUUID(), phone, body, status: "queued", attempts: 0, reason: null,
    created_at: new Date().toISOString(), claimed_at: null, sent_at: null,
  });
}

/** One check-in from the phone: record what it sent, then hand it the next texts. */
export async function exchange(updates: GatewayUpdate[], now = Date.now()): Promise<GatewayMessage[]> {
  const store = getStore();
  const iso = new Date(now).toISOString();

  for (const u of updates.slice(0, 50)) {
    if (typeof u?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(u.id)) continue;
    const row = await store.get("sms_outbox", u.id);
    if (!row || row.status === "sent" || row.status === "failed") continue;
    if (u.status === "SENT" || u.status === "DELIVERED") {
      await store.update("sms_outbox", row.id, { status: "sent", sent_at: iso, body: "" });
    } else if (u.status === "FAILED") {
      const reason = String(u.reason ?? "failed").slice(0, 200);
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      await store.update("sms_outbox", row.id, giveUp ? { status: "failed", reason, body: "" } : { status: "queued", reason });
    }
  }

  const open = [...(await store.list("sms_outbox", { status: "queued" })), ...(await store.list("sms_outbox", { status: "sending" }))]
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: GatewayMessage[] = [];
  for (const row of open) {
    const age = now - Date.parse(row.created_at);
    if (age > EXPIRE_AFTER_MS) {
      await store.update("sms_outbox", row.id, { status: "failed", reason: row.reason ?? "expired", body: "" });
      continue;
    }
    const stale = row.status === "sending" && row.claimed_at && now - Date.parse(row.claimed_at) > RETRY_AFTER_MS;
    if (row.status === "sending" && !stale) continue;
    if (row.attempts >= MAX_ATTEMPTS) {
      await store.update("sms_outbox", row.id, { status: "failed", reason: row.reason ?? "no answer from the phone", body: "" });
      continue;
    }
    if (out.length >= BATCH) continue;
    await store.update("sms_outbox", row.id, { status: "sending", claimed_at: iso, attempts: row.attempts + 1 });
    out.push({ id: row.id, to: `+${row.phone}`, content: row.body });
  }

  // Tidy up now and then: finished texts are kept a day (without their content) for troubleshooting.
  if (Math.random() < 0.05) for (const status of ["sent", "failed"] as const) {
    for (const row of await store.list("sms_outbox", { status })) {
      if (now - Date.parse(row.created_at) > KEEP_MS) await store.remove("sms_outbox", row.id);
    }
  }
  return out;
}

export type { SmsOutbox };
