"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { IconBack } from "./icons";

type Pass = { id: string; label: string; cents: number; note: string | null; days: number };
export type Trial = { can_start: boolean; trial_until: string | null; offer_until: string | null; founding: boolean; founding_left: number | null; trial_days: number };

/** 30 → "1 month", 90 → "3 months", 7 → "7 days" */
const span = (days: number) => (days % 30 === 0 ? (days === 30 ? "1 month" : `${days / 30} months`) : `${days} days`);
const rand = (cents: number) => `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const whenShort = (iso: string) => new Date(iso).toLocaleString("en-ZA", { weekday: "long", hour: "2-digit", minute: "2-digit" });

/** Ways to pay on the secure checkout (whatever the Afriheart Payfast account has switched on). */
const METHODS = ["Card", "Instant EFT", "Capitec Pay", "SnapScan", "Zapper", "Apple Pay & Google Pay"];

export function PlusCheckout({ until, passes, perks, available, testMode, paidId, cancelled, trial: initialTrial, from, locked }: {
  until: string | null; passes: Pass[]; perks: string[]; available: boolean; testMode: boolean; paidId: string | null; cancelled: boolean; trial: Trial; from?: string | null; locked?: boolean;
}) {
  const router = useRouter();
  const [trial, setTrial] = useState(initialTrial);
  const [pass, setPass] = useState(initialTrial.offer_until ? "intro" : "month");
  const shown = passes.filter((p) => p.id !== "intro" || trial.offer_until);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plusUntil, setPlusUntil] = useState(until);
  const [checking, setChecking] = useState<"checking" | "paid" | "slow" | "failed" | null>(paidId ? "checking" : null);

  // Back from the checkout: the payment confirmation can take a few seconds to arrive.
  useEffect(() => {
    if (!paidId) return;
    let stop = false, tries = 0;
    const check = async () => {
      if (stop) return;
      try {
        const r = await apiGet<{ status: string; plus_until: string | null }>(`/api/plus/payments/${paidId}`);
        if (r.status === "complete") { setChecking("paid"); setPlusUntil(r.plus_until); router.refresh(); return; }
        if (r.status === "failed" || r.status === "cancelled") { setChecking("failed"); return; }
      } catch { /* keep trying */ }
      if (++tries >= 20) return setChecking("slow");
      setTimeout(check, 1500);
    };
    check();
    return () => { stop = true; };
  }, [paidId, router]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<{ id: string; action: string; fields: Record<string, string> }>("/api/plus/checkout", "POST", { pass });
      if (r.action.startsWith("/")) return router.push(`${r.action}?id=${encodeURIComponent(r.fields.id)}`);
      // Payfast's secure page: a signed form, posted the normal way so the bank apps can open.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = r.action;
      for (const [k, v] of Object.entries(r.fields)) {
        const input = document.createElement("input");
        input.type = "hidden"; input.name = k; input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function startTrial() {
    setBusy(true);
    setError(null);
    try {
      const t = await apiSend<Trial>("/api/plus/trial", "POST");
      setTrial(t);
      setPlusUntil(t.trial_until);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = shown.find((p) => p.id === pass) ?? shown[0];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <Link href="/you" className="icon-btn -ml-3" aria-label="Back to You"><IconBack /></Link>
        <h1 className="display text-3xl">Membership</h1>
      </div>

      {checking === "checking" && <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">Confirming your payment…</p>}
      {checking === "paid" && <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">Payment received, thank you! Your membership is on.</p>}
      {checking === "slow" && <p role="status" className="rounded-xl bg-notice px-4 py-3 text-sm text-notice-ink">Your bank is taking a while to confirm. Your membership switches on by itself as soon as it does; you can leave this page.</p>}
      {checking === "failed" && <p role="alert" className="rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">That payment didn&apos;t go through, and you weren&apos;t charged. Try again, or pick another way to pay.</p>}
      {cancelled && !checking && <p role="status" className="rounded-xl bg-line/50 px-4 py-3 text-sm">Payment cancelled. Nothing was charged.</p>}

      {locked && !plusUntil && (
        <div role="status" className="card border-brand bg-accent-soft" data-locked>
          <p className="font-semibold">Your free trial has ended</p>
          <p className="text-sm text-muted">Choose a membership to keep matching, chatting and planning dates. Your matches and chats are waiting. Reporting, blocking, support and your account stay open either way.</p>
        </div>
      )}

      {from && !plusUntil && (from === "boost" || from === "undo") && (
        <p role="status" className="rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink" data-from>
          {from === "boost" ? "Boost puts you first in front of people near you for 30 minutes. It comes with a membership." : "Undo brings back someone you passed on by mistake. It comes with a membership."}
        </p>
      )}

      {trial.offer_until && !plusUntil && (
        <div className="card border-brand bg-accent-soft" data-intro-offer>
          <p className="font-semibold">Your free {trial.founding ? "month" : "week"} has ended. Keep Afriheart for R29 for your first month</p>
          <p className="text-sm text-muted">Instead of R59. This welcome offer ends {whenShort(trial.offer_until)} and is only for you, once.</p>
        </div>
      )}

      {plusUntil ? (
        <div className="card" data-plus-active>
          <p className="font-semibold">{trial.trial_until ? (trial.founding ? "You're a founding member: your free month is on" : "Your free week is on") : "You're a member"}</p>
          <p className="text-sm text-muted">
            {trial.trial_until
              ? `Free until ${longDate(trial.trial_until)}. Nothing is charged when it ends: no card needed, no debit order.`
              : `Until ${longDate(plusUntil)}. Buying another pass adds its days on top.`}
          </p>
        </div>
      ) : trial.can_start && (
        <div className="card flex flex-col gap-2" data-trial-start>
          {trial.founding ? (
            <>
              <p className="font-semibold" data-founding>Founding member offer: your first {span(trial.trial_days) === "1 month" ? "month" : span(trial.trial_days)} of Afriheart free</p>
              <p className="text-sm text-muted">
                For the first people to join Afriheart. {trial.founding_left !== null && <strong>Only {trial.founding_left.toLocaleString("en-ZA")} spots left.</strong>} No card needed, and nothing is charged when it ends.
              </p>
              <button className="btn" onClick={startTrial} disabled={busy}>{busy ? "Starting…" : "Claim my founding spot"}</button>
            </>
          ) : (
            <>
              <p className="font-semibold">Try Afriheart free for 7 days</p>
              <p className="text-sm text-muted">No card needed, and nothing is charged when the week ends. One free week per phone number.</p>
              <button className="btn" onClick={startTrial} disabled={busy}>{busy ? "Starting…" : "Start my free week"}</button>
            </>
          )}
        </div>
      )}

      <section aria-label="What you get" className="card flex flex-col gap-2">
        <p className="text-sm text-muted">Your membership includes everything. Reporting, blocking, support and your account are always free, member or not.</p>
        <ul className="flex flex-col gap-1.5">
          {perks.map((p) => <li key={p} className="flex gap-2 text-[15px]"><span aria-hidden className="text-brand">♥</span>{p}</li>)}
        </ul>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Choose your membership</legend>
        {shown.map((p) => (
          <label key={p.id} className="card flex min-h-14 cursor-pointer items-center gap-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            <input type="radio" name="pass" value={p.id} checked={pass === p.id} onChange={() => setPass(p.id)} className="h-5 w-5 accent-[color:var(--accent)]" />
            <span className="flex-1">
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-xs text-muted">{rand(Math.round(p.cents / (p.days / 7)))} a week{p.note ? ` · ${p.note}` : ""}</span>
            </span>
            <span className="text-xl font-semibold tabular-nums tracking-tight">{rand(p.cents)}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <button className="btn" onClick={pay} disabled={busy || !available}>{busy ? "Opening checkout…" : `Pay ${rand(chosen.cents)}`}</button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!available && <p className="text-sm text-muted">Payments open soon.</p>}
        <p className="text-xs text-muted">
          One payment, no debit order: it never renews by itself. Pay on Payfast&apos;s secure page with {METHODS.slice(0, -1).join(", ")} or {METHODS.at(-1)}. Afriheart never sees your card or bank details.
          {testMode && " (Test mode: no real money.)"}
        </p>
      </div>
    </div>
  );
}
