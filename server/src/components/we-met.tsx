"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { IconHeart } from "./icons";

/** "Did you meet?": a private check-in after a planned date. The other person never sees the answers. */
export function WeMetCard({ chatId }: { chatId: string }) {
  const [ask, setAsk] = useState<{ about_id: string; name: string } | null>(null);
  const [step, setStep] = useState<"ask" | "more" | "thanks">("ask");
  const [again, setAgain] = useState<string | null>(null);
  const [pictured, setPictured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiGet<{ ask: { about_id: string; name: string } | null }>(`/api/chats/${chatId}/we-met`).then((r) => live && setAsk(r.ask), () => undefined);
    return () => { live = false; };
  }, [chatId]);

  if (!ask) return null;
  const name = ask.name.split(" ")[0];
  const send = async (body: Record<string, unknown>, next: "thanks" | null) => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/chats/${chatId}/we-met`, "POST", body);
      if (next) setStep(next);
      else setAsk(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="we-met-title" className="mx-2 mb-2 rounded-2xl border border-accent/30 bg-card p-3 text-sm shadow-sm lg:mx-[max(1rem,calc(50%-26rem))]" data-we-met>
      {error && <p role="alert" className="mb-2 rounded-lg bg-warm-soft px-3 py-2 text-warm-ink">{error}</p>}
      {step === "ask" && (
        <>
          <h2 id="we-met-title" className="flex items-center gap-1.5 font-semibold"><IconHeart size={16} className="text-accent" /> Did you meet {name}?</h2>
          <p className="mb-2 text-xs text-muted">Just between you and Afriheart: {name} won&apos;t see your answer.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" disabled={busy} onClick={() => setStep("more")}>Yes, we met</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => send({ met: false }, null)}>No</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => send({ met: null }, null)}>Not yet</button>
          </div>
        </>
      )}
      {step === "more" && (
        <form onSubmit={(e) => { e.preventDefault(); send({ met: true, again, as_pictured: pictured }, "thanks"); }}>
          <h2 id="we-met-title" className="mb-2 font-semibold">How did it go?</h2>
          <fieldset className="mb-2">
            <legend className="mb-1 text-xs font-semibold">Would you see {name} again?</legend>
            <div className="flex gap-1.5">
              {[["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]].map(([v, l]) => (
                <label key={v} className="chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="again" className="sr-only" checked={again === v} onChange={() => setAgain(v)} />{l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-semibold">Did {name} look like their photos?</legend>
            <div className="flex gap-1.5">
              {[[true, "Yes"], [false, "No"]].map(([v, l]) => (
                <label key={String(v)} className="chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="pictured" className="sr-only" checked={pictured === v} onChange={() => setPictured(v as boolean)} />{l as string}
                </label>
              ))}
            </div>
            {pictured === false && <p className="mt-1 text-xs text-muted">We&apos;ll ask the Afriheart team to check {name}&apos;s profile. They won&apos;t know it was you.</p>}
          </fieldset>
          <button className="btn btn-sm" disabled={busy || !again || pictured === null}>{busy ? "Sending…" : "Send privately"}</button>
        </form>
      )}
      {step === "thanks" && (
        <p role="status" className="flex items-center justify-between gap-2">
          <span>Thanks! This helps keep Afriheart real.</span>
          <button className="font-semibold text-accent underline" onClick={() => setAsk(null)}>Close</button>
        </p>
      )}
    </section>
  );
}
