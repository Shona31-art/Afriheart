import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, getPerson } from "./domain";
import { stamp } from "./chat";
import { checkoutForm, confirmWithPayfast, fromPayfast, parseItn, payfastConfig, validItnSignature } from "./payfast";
import type { Payment } from "./types";

// Afriheart+: a pass you pay for once (a week, a month or three months). No debit orders and nothing
// renews by itself, so it works with every local way to pay: card, Instant EFT, Capitec Pay,
// SnapScan, Zapper and more. Safety, chats, calls and matching stay free for everyone.

export type PassId = Payment["pass"];
export const PASSES: Record<PassId, { days: number; cents: number; label: string; note?: string; offerOnly?: boolean }> = {
  week: { days: 7, cents: 1900, label: "1 week" },
  month: { days: 30, cents: 5900, label: "1 month", note: "Most popular" },
  quarter: { days: 90, cents: 14900, label: "3 months", note: "Save 16%" },
  // Only offered for 48 hours after the free trial ends, once per person.
  intro: { days: 30, cents: 2900, label: "First month", note: "Welcome offer", offerOnly: true },
};

export const TRIAL_DAYS = 7;
export const OFFER_HOURS = 48;

const phoneHash = (phone: string) => createHash("sha256").update(`afriheart-trial:${phone}`).digest("hex");

/**
 * The free week of Afriheart+: once per phone number (so a new account on the same number
 * doesn't get another). No card needed, and nothing is charged when it ends.
 * Returns false if this number has had its trial already.
 */
export const trialsOn = () => process.env.PLUS_TRIAL !== "off";

export async function startTrial(personId: string): Promise<boolean> {
  if (!trialsOn()) return false;
  const person = await getPerson(personId);
  if (!person || person.is_guest || !person.phone) return false;
  const store = getStore();
  const id = phoneHash(person.phone);
  if (await store.get("trial_claims", id)) return false;
  const current = await store.get("memberships", personId);
  if (current?.trial_until) return false;
  const at = stamp();
  try {
    await store.insert("trial_claims", { id, created_at: at });
  } catch {
    return false; // claimed at the same moment by another request
  }
  const from = current && current.plus_until > at ? new Date(current.plus_until) : new Date();
  const until = new Date(from.getTime() + TRIAL_DAYS * 86400_000).toISOString();
  if (current) await store.update("memberships", personId, { plus_until: until, trial_until: until, updated_at: at });
  else await store.insert("memberships", { id: personId, person_id: personId, plus_until: until, trial_until: until, updated_at: at });
  return true;
}

export interface TrialState {
  /** This number hasn't had its free week yet. */
  can_start: boolean;
  /** On the free week now: when it ends. */
  trial_until: string | null;
  /** The cheaper first month, while it lasts: when the offer ends. */
  offer_until: string | null;
}

export async function trialState(personId: string): Promise<TrialState> {
  const person = await getPerson(personId);
  const store = getStore();
  const m = await store.get("memberships", personId);
  const now = new Date().toISOString();
  const claimed = !person?.phone || !!(await store.get("trial_claims", phoneHash(person.phone)));
  const trialUntil = m?.trial_until ?? null;
  let offer: string | null = null;
  if (trialUntil && trialUntil <= now) {
    const end = new Date(Date.parse(trialUntil) + OFFER_HOURS * 3600_000).toISOString();
    const paid = (await store.list("payments", { person_id: personId })).some((p) => p.status === "complete");
    if (end > now && !paid && !(m && m.plus_until > now)) offer = end;
  }
  return {
    can_start: trialsOn() && !claimed && !trialUntil && !person?.is_guest,
    trial_until: trialUntil && trialUntil > now ? trialUntil : null,
    offer_until: offer,
  };
}

export const PLUS_PERKS = [
  "See who already likes you, and match instantly",
  "Flirty and Future us Talking cards (unlocked for both of you)",
  "Support a dating app made in Africa",
];

export type Provider = "payfast" | "test";
/** Payfast when it's set up; a pretend checkout for local testing only; otherwise nothing. */
export function paymentProvider(): Provider | null {
  if (payfastConfig()) return "payfast";
  // Only with the explicit, scary-sounding switch (like the test sign-in codes): never by accident.
  if (process.env.ALLOW_TEST_PAYMENTS === "yes-insecure") return "test";
  return null;
}

export async function plusUntil(personId: string): Promise<string | null> {
  const m = await getStore().get("memberships", personId);
  return m && m.plus_until > new Date().toISOString() ? m.plus_until : null;
}

export const hasPlus = async (personId: string) => !!(await plusUntil(personId));

/** Starts paying for a pass: records it as pending and returns the form that takes the phone to the checkout. */
export async function startCheckout(personId: string, pass: string, origin: string): Promise<{ id: string; action: string; fields: Record<string, string> }> {
  const plan = PASSES[pass as PassId];
  if (!plan) throw new DomainError("Choose a pass.");
  if (plan.offerOnly && !(await trialState(personId)).offer_until) throw new DomainError("This offer has ended. Choose one of the other passes.");
  const provider = paymentProvider();
  if (!provider) throw new DomainError("Payments aren't switched on yet. Try again soon.", 503);
  const person = await getPerson(personId);
  const store = getStore();
  // Don't pile up unpaid checkouts: at most 5 started in the last hour.
  const hour = new Date(Date.now() - 3600_000).toISOString();
  if ((await store.list("payments", { person_id: personId })).filter((p) => p.status === "pending" && p.created_at > hour).length >= 5) {
    throw new DomainError("You've started a few payments already. Finish one, or try again in an hour.", 429);
  }
  const id = randomUUID();
  await store.insert("payments", { id, person_id: personId, pass: pass as PassId, amount_cents: plan.cents, status: "pending", provider, provider_ref: null, method: null, created_at: stamp(), paid_at: null });
  if (provider === "test") return { id, action: `/plus/test-checkout`, fields: { id } };
  const form = checkoutForm(payfastConfig()!, {
    paymentId: id, amountCents: plan.cents, itemName: `Afriheart+ ${plan.label}`,
    returnUrl: `${origin}/plus?paid=${id}`, cancelUrl: `${origin}/plus?cancelled=1`, notifyUrl: `${origin}/api/plus/payfast`,
    firstName: person?.name.split(" ")[0],
  });
  return { id, ...form };
}

/** Marks a payment paid and adds the pass's days (on top of any time left). Safe to call twice. */
export async function completePayment(id: string, ref: string | null, method: string | null): Promise<Payment | null> {
  const store = getStore();
  const p = await store.get("payments", id);
  if (!p || p.status === "complete") return p;
  const at = stamp();
  await store.update("payments", id, { status: "complete", provider_ref: ref, method, paid_at: at });
  const current = await store.get("memberships", p.person_id);
  const from = current && current.plus_until > at ? new Date(current.plus_until) : new Date();
  const until = new Date(from.getTime() + PASSES[p.pass].days * 86400_000).toISOString();
  if (current) await store.update("memberships", p.person_id, { plus_until: until, updated_at: at });
  else await store.insert("memberships", { id: p.person_id, person_id: p.person_id, plus_until: until, updated_at: at });
  return { ...p, status: "complete" };
}

export async function failPayment(id: string, status: "failed" | "cancelled") {
  const store = getStore();
  const p = await store.get("payments", id);
  if (p?.status === "pending") await store.update("payments", id, { status });
}

/** The phone checks this after coming back from the checkout. */
export async function paymentFor(personId: string, id: string) {
  const p = await getStore().get("payments", id);
  if (!p || p.person_id !== personId) throw new DomainError("Payment not found.", 404);
  return { status: p.status, pass: p.pass, plus_until: await plusUntil(personId) };
}

/** The pretend checkout, for testing on a computer without real money. */
export async function testCheckout(personId: string, id: string, outcome: "pay" | "cancel") {
  if (paymentProvider() !== "test") throw new DomainError("Not available.", 404);
  const p = await getStore().get("payments", id);
  if (!p || p.person_id !== personId) throw new DomainError("Payment not found.", 404);
  if (outcome === "pay") await completePayment(id, `test-${id.slice(0, 8)}`, "test");
  else await failPayment(id, "cancelled");
}

const METHODS: Record<string, string> = { cc: "Card", dc: "Debit card", ef: "Instant EFT", eft: "Instant EFT", cp: "Capitec Pay", ss: "SnapScan", zp: "Zapper", mp: "Masterpass", mc: "Mobicred", sc: "SCode", mt: "MoreTyme", rc: "Store card", ap: "Apple Pay", gp: "Google Pay", sp: "Samsung Pay" };

/** Payfast's notification. Returns what happened (for the logs); Payfast only needs a 200. */
export async function handlePayfastItn(rawBody: string, ip: string): Promise<string> {
  const c = payfastConfig();
  if (!c) return "payfast not configured";
  const { pairs, data } = parseItn(rawBody);
  if (!validItnSignature(pairs, c.passphrase)) return "bad signature";
  if (!(await fromPayfast(ip))) return `not from payfast (${ip})`;
  if (data.merchant_id !== c.merchantId) return "wrong merchant";
  const p = await getStore().get("payments", data.m_payment_id ?? "");
  if (!p) return "unknown payment";
  if (Math.abs(Number(data.amount_gross) * 100 - p.amount_cents) > 1) return "amount mismatch";
  if (!(await confirmWithPayfast(c, pairs))) return "payfast did not confirm";
  const status = data.payment_status;
  if (status === "COMPLETE") {
    await completePayment(p.id, data.pf_payment_id ?? null, METHODS[data.payment_method ?? ""] ?? data.payment_method ?? null);
    return "complete";
  }
  if (status === "CANCELLED") { await failPayment(p.id, "cancelled"); return "cancelled"; }
  if (status === "FAILED") { await failPayment(p.id, "failed"); return "failed"; }
  return `status ${status}`;
}
