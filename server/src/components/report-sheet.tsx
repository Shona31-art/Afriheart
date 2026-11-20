"use client";

import { useState } from "react";
import { apiSend } from "@/lib/client";

const REASONS = [
  ["fake", "Fake profile or not who they say"],
  ["scam", "Asking for money or a scam"],
  ["harassment", "Harassment or threats"],
  ["underage", "Might be under 18"],
  ["inappropriate", "Inappropriate photos or messages"],
  ["safety", "Something happened on a date"],
  ["other", "Something else"],
] as const;

/** Report (which also blocks) or just block someone. The Afriheart team reviews every report. */
export function ReportSheet({ personId, name, onClose, onDone, initialDetails = "", initialReason = "" }: { personId: string; name: string; onClose: () => void; onDone: () => void; initialDetails?: string; initialReason?: string }) {
  const [reason, setReason] = useState<string>(initialReason);
  const [details, setDetails] = useState(initialDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-xl rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <h2 id="report-title" className="display mb-1 text-2xl">Report {name}</h2>
        <p className="mb-3 text-sm text-muted">{name} won&apos;t know who reported them. Reporting also blocks them, so you won&apos;t see each other again.</p>
        {error && <p role="alert" className="mb-3 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
        <fieldset className="mb-3 flex flex-col gap-1">
          <legend className="sr-only">Reason</legend>
          {REASONS.map(([v, l]) => (
            <label key={v} className="flex min-h-11 items-center gap-3 rounded-lg px-2 has-[:checked]:bg-accent-soft">
              <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="h-5 w-5 accent-[var(--accent)]" /> {l}
            </label>
          ))}
        </fieldset>
        <label className="mb-4 flex flex-col gap-1 text-sm">
          <span className="font-semibold">What happened? (optional)</span>
          <textarea className="field min-h-20" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
          {initialDetails && <span className="text-xs text-muted">This includes the message, so the team can see what was said. Messages are otherwise end-to-end encrypted; you can edit or remove it.</span>}
        </label>
        <p className="mb-4 text-xs text-muted">If you&apos;re in danger, call 10111 (SAPS) or 112 from a mobile.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!reason || busy} onClick={() => run(() => apiSend("/api/dating/report", "POST", { person_id: personId, reason, details }))}>Report and block</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => apiSend("/api/dating/block", "POST", { person_id: personId }))}>Just block</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
