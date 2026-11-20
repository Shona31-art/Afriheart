"use client";

import { useState } from "react";
import { apiSend } from "@/lib/client";
import type { QueueItem, ReportItem } from "@/lib/team";
import { IconShield } from "./icons";

const REASON_LABELS: Record<string, string> = {
  not_matching: "Doesn't match the photos", pose: "Pose not done", unclear: "Too dark or blurry", face_hidden: "Face hidden", other: "Other",
};
const REPORT_LABELS: Record<string, string> = {
  fake: "Fake profile", scam: "Scam or asking for money", harassment: "Harassment or threats", underage: "Might be under 18",
  inappropriate: "Inappropriate photos or messages", safety: "Something happened on a date", other: "Something else",
};

/** The Afriheart team's queue: selfies to verify and reports to review. */
export function TeamQueue({ initialSelfies, initialReports, met }: { initialSelfies: QueueItem[]; initialReports: ReportItem[]; met?: { answered: number; met: number; again: number; not_as_pictured: number } }) {
  const [tab, setTab] = useState<"selfies" | "reports">("selfies");
  const [selfies, setSelfies] = useState(initialSelfies);
  const [reports, setReports] = useState(initialReports);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run<T>(id: string, fn: () => Promise<T>, done: (v: T) => void) {
    setBusy(id);
    setError(null);
    try { done(await fn()); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <main className="page">
      <h1 className="display mb-1 text-3xl">Team</h1>
      <p className="mb-4 text-sm text-muted">Only people on the Afriheart team can see this page. <a href="/admin" className="font-semibold text-accent underline">Back to the admin area</a></p>
      {met && (
        <p className="card mb-4 text-sm" data-we-met-stats>
          <strong>We met:</strong> {met.met} dates confirmed out of {met.answered} answers{met.met ? `, ${met.again} would meet again` : ""}{met.not_as_pictured ? `, ${met.not_as_pictured} said someone didn't look like their photos` : ""}.
        </p>
      )}
      <div role="tablist" aria-label="Queues" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {([["selfies", `Selfies (${selfies.length})`], ["reports", `Reports (${reports.length})`]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${tab === id ? "bg-card text-ink shadow-sm" : "text-muted"}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">{error}</p>}

      {tab === "selfies" && (
        <section id="panel-selfies" role="tabpanel" aria-labelledby="tab-selfies" className="flex flex-col gap-4">
          {selfies.length === 0 && <p className="card text-sm text-muted">No selfies waiting. Nice.</p>}
          {selfies.map((v) => (
            <article key={v.id} aria-label={`Selfie from ${v.name}`} className="card flex flex-col gap-3" data-verification={v.id}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{v.name}, {v.age}</h2>
                <span className="text-xs text-muted">{new Date(v.submitted_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p className="text-sm">Pose asked for: <strong>{v.gesture}</strong></p>
              <div className="flex gap-2 overflow-x-auto">
                <figure className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/team/selfies/${v.selfie}`} alt={`Selfie from ${v.name}`} className="h-40 w-40 rounded-xl object-cover ring-2 ring-accent" />
                  <figcaption className="mt-1 text-xs font-semibold">Selfie</figcaption>
                </figure>
                {v.photos.map((p, i) => (
                  <figure key={p} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/dating/photos/${p}`} alt={`${v.name}'s profile photo ${i + 1}`} className="h-40 w-32 rounded-xl object-cover" />
                    <figcaption className="mt-1 text-xs text-muted">Photo {i + 1}</figcaption>
                  </figure>
                ))}
              </div>
              <Decision busy={busy === v.id} onApprove={() => run(v.id, () => apiSend<QueueItem[]>("/api/team/verifications", "POST", { id: v.id, decision: "approve" }), setSelfies)}
                onReject={(reason) => run(v.id, () => apiSend<QueueItem[]>("/api/team/verifications", "POST", { id: v.id, decision: "reject", reason }), setSelfies)} />
            </article>
          ))}
          <p className="text-xs text-muted">Selfies are deleted as soon as you approve or reject them.</p>
        </section>
      )}

      {tab === "reports" && (
        <section id="panel-reports" role="tabpanel" aria-labelledby="tab-reports" className="flex flex-col gap-4">
          {reports.length === 0 && <p className="card text-sm text-muted">No open reports.</p>}
          {reports.map((r) => (
            <article key={r.id} aria-label={`Report about ${r.reported?.name ?? "someone"}`} className="card flex flex-col gap-2" data-report={r.id}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{REPORT_LABELS[r.reason] ?? r.reason}</h2>
                <span className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              {r.reason === "underage" || r.reason === "safety" ? <p className="status status-failed self-start">Urgent</p> : null}
              <p className="text-sm">About <strong>{r.reported?.name ?? "a deleted account"}</strong>{r.reported?.verified && <span className="ml-1 inline-flex items-center gap-0.5 text-accent"><IconShield size={14} /> verified</span>}, reported by {r.reporter}.{r.reported && r.reported.reports > 1 ? ` ${r.reported.reports} reports in total.` : ""}</p>
              {r.details && <blockquote className="rounded-lg bg-line/50 px-3 py-2 text-sm">{r.details}</blockquote>}
              {r.reported && r.reported.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {r.reported.photos.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={`/api/dating/photos/${p}`} alt={`${r.reported!.name}'s photo ${i + 1}`} className="h-28 w-24 shrink-0 rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm bg-danger" disabled={busy === r.id || !r.reported || r.reported.removed}
                  onClick={() => confirm(`Remove ${r.reported?.name} from dating? They won't be shown to anyone, and their other open reports close.`) && run(r.id, () => apiSend<ReportItem[]>("/api/team/reports", "POST", { id: r.id, action: "remove" }), setReports)}>
                  {r.reported?.removed ? "Already removed" : "Remove from dating"}
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => run(r.id, () => apiSend<ReportItem[]>("/api/team/reports", "POST", { id: r.id, action: "no_action" }), setReports)}>No action needed</button>
              </div>
            </article>
          ))}
          <p className="text-xs text-muted">Reporting already blocked them for the person who reported. Underage and safety reports are shown first.</p>
        </section>
      )}
    </main>
  );
}

function Decision({ busy, onApprove, onReject }: { busy: boolean; onApprove: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("not_matching");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <button className="btn btn-sm" disabled={busy} onClick={onApprove}>Approve</button>
      <label className="flex flex-col gap-1 text-xs font-semibold">Reason
        <select className="field min-h-11 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onReject(reason)}>Reject</button>
    </div>
  );
}
