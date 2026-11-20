"use client";

import { useState } from "react";
import { apiSend } from "@/lib/client";
import { forgetThisDevice } from "@/lib/e2e-device";

/** Delete the account, after typing DELETE. Also signs out every other phone. */
export function DeleteAccount({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState<string | null>(null);

  return (
    <div className="card flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">Signed in on another phone you don&apos;t have any more?</p>
        <button className="btn btn-ghost btn-sm" onClick={async () => {
          setOthers(null);
          try { await apiSend("/api/account/sessions", "DELETE"); setOthers("Signed out everywhere else."); } catch (e) { setOthers((e as Error).message); }
        }}>Sign out everywhere else</button>
      </div>
      {others && <p role="status" className="text-accent">{others}</p>}
      <hr className="border-line" />
      {!open ? (
        <button className="btn btn-ghost btn-sm self-start text-danger" onClick={() => setOpen(true)}>Delete my account</button>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await apiSend("/api/account", "DELETE", { confirm: typed.trim() });
            await forgetThisDevice(personId).catch(() => undefined);
            // A full load on purpose: nothing from the deleted account stays in memory.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/signin");
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}>
          <p className="font-semibold text-danger">This can&apos;t be undone.</p>
          <p className="text-muted">Your profile, photos, answers, matches, everything you&apos;ve sent in chats, and your album photos and stories are deleted. People you chatted with will see &ldquo;Deleted account&rdquo;. Reports about safety are kept, without your profile.</p>
          {error && <p role="alert" className="rounded-lg bg-warm-soft px-3 py-2 text-warm-ink">{error}</p>}
          <label className="flex flex-col gap-1 font-semibold">Type DELETE to confirm
            <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-sm bg-danger" disabled={busy || typed.trim() !== "DELETE"}>{busy ? "Deleting…" : "Delete my account"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
