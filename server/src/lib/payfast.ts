import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";

// Payfast (South Africa): one hosted checkout page for cards, Instant EFT, Capitec Pay, SnapScan,
// Zapper, Mobicred, store cards and more (whatever is switched on in the Payfast account).
// Afriheart sends people there with a signed form; Payfast tells the server the result with an
// "ITN" (instant transaction notification), which is checked four ways before anything is unlocked:
// the signature, that it came from Payfast's servers, the amount, and a confirmation from Payfast.

export interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string | null;
  sandbox: boolean;
}

export function payfastConfig(): PayfastConfig | null {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim();
  if (!merchantId || !merchantKey) return null;
  return { merchantId, merchantKey, passphrase: process.env.PAYFAST_PASSPHRASE?.trim() || null, sandbox: process.env.PAYFAST_SANDBOX === "yes" };
}

const host = (c: PayfastConfig) => (c.sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za");
export const processUrl = (c: PayfastConfig) => `https://${host(c)}/eng/process`;

// The order Payfast signs checkout fields in.
const ORDER = [
  "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url",
  "name_first", "name_last", "email_address", "cell_number",
  "m_payment_id", "amount", "item_name", "item_description",
  "custom_int1", "custom_int2", "custom_int3", "custom_int4", "custom_int5",
  "custom_str1", "custom_str2", "custom_str3", "custom_str4", "custom_str5",
  "email_confirmation", "confirmation_address", "payment_method",
  "subscription_type", "billing_date", "recurring_amount", "frequency", "cycles",
];

/** PHP's urlencode(): what Payfast's signatures are built with (spaces as +, uppercase escapes). */
export function phpUrlencode(v: string): string {
  return encodeURIComponent(v)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Signature for the checkout form: non-empty fields in Payfast's order, then the passphrase. */
export function checkoutSignature(fields: Record<string, string>, passphrase: string | null): string {
  const parts = ORDER.filter((k) => (fields[k] ?? "").trim() !== "").map((k) => `${k}=${phpUrlencode(fields[k].trim())}`);
  if (passphrase) parts.push(`passphrase=${phpUrlencode(passphrase)}`);
  return md5(parts.join("&"));
}

export function checkoutForm(c: PayfastConfig, f: {
  paymentId: string; amountCents: number; itemName: string; returnUrl: string; cancelUrl: string; notifyUrl: string; firstName?: string;
}): { action: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {
    merchant_id: c.merchantId,
    merchant_key: c.merchantKey,
    return_url: f.returnUrl,
    cancel_url: f.cancelUrl,
    notify_url: f.notifyUrl,
    ...(f.firstName ? { name_first: f.firstName.slice(0, 100) } : {}),
    m_payment_id: f.paymentId,
    amount: (f.amountCents / 100).toFixed(2),
    item_name: f.itemName.slice(0, 100),
  };
  fields.signature = checkoutSignature(fields, c.passphrase);
  return { action: processUrl(c), fields };
}

/** The fields of an ITN, in the order they were posted (the signature depends on the order). */
export function parseItn(rawBody: string): { pairs: [string, string][]; data: Record<string, string> } {
  const pairs: [string, string][] = [];
  for (const part of rawBody.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
    const v = decodeURIComponent((i < 0 ? "" : part.slice(i + 1)).replace(/\+/g, " "));
    pairs.push([k, v]);
  }
  return { pairs, data: Object.fromEntries(pairs) };
}

/** The ITN's own parameter string: everything before "signature", re-encoded. */
export function itnParamString(pairs: [string, string][]): string {
  const out: string[] = [];
  for (const [k, v] of pairs) {
    if (k === "signature") break;
    out.push(`${k}=${phpUrlencode(v)}`);
  }
  return out.join("&");
}

export function validItnSignature(pairs: [string, string][], passphrase: string | null): boolean {
  const given = pairs.find(([k]) => k === "signature")?.[1] ?? "";
  const base = itnParamString(pairs);
  const expected = md5(passphrase ? `${base}&passphrase=${phpUrlencode(passphrase)}` : base);
  const a = Buffer.from(given.toLowerCase()), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PAYFAST_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za", "w1w.payfast.co.za", "w1e.payfast.co.za"];
let hostIps: { at: number; ips: Set<string> } | null = null;

/** Whether the notification came from one of Payfast's servers (their published host names). */
export async function fromPayfast(ip: string): Promise<boolean> {
  if (!hostIps || Date.now() - hostIps.at > 10 * 60_000) {
    const ips = new Set<string>();
    for (const h of PAYFAST_HOSTS) {
      for (const a of await lookup(h, { all: true }).catch(() => [])) ips.add(a.address);
    }
    hostIps = { at: Date.now(), ips };
  }
  return hostIps.ips.has(ip.replace(/^::ffff:/, ""));
}

/** Asks Payfast to confirm the notification is real. */
export async function confirmWithPayfast(c: PayfastConfig, pairs: [string, string][]): Promise<boolean> {
  const res = await fetch(`https://${host(c)}/eng/query/validate`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: itnParamString(pairs),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res && res.ok && (await res.text()).trim() === "VALID";
}
