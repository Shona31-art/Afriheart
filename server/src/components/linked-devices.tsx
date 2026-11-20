"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend, listTime } from "@/lib/client";
import { forgetThisDevice, myDevice } from "@/lib/e2e-device";
import { signOut } from "@/app/actions";

interface Device { id: string; label: string; created_at: string }

/** The phones and browsers that can read this person's messages, with a way to log any of them out. */
export function LinkedDevices({ personId }: { personId: string }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([apiGet<Device[]>("/api/devices"), myDevice(personId).catch(() => null)])
      .then(([list, me]) => { if (live) { setDevices(list); setMine(me?.deviceId ?? null); } })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [personId, version]);

  async function logOut(d: Device) {
    if (!confirm(`Log out "${d.label}"? It will stop receiving your messages.`)) return;
    try {
      await apiSend(`/api/devices/${d.id}`, "DELETE");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card flex flex-col gap-2 text-sm">
      <p className="text-muted">Your messages are encrypted for each of these. Log out any you don&apos;t recognise or no longer use.</p>
      {error && <p role="alert" className="rounded-lg bg-warm-soft px-3 py-2 text-warm-ink">{error}</p>}
      {!devices && !error && <p className="text-muted">Loading…</p>}
      <ul className="flex flex-col">
        {devices?.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line/70 py-2 last:border-0" data-device={d.id}>
            <span>
              <span className="block font-semibold">{d.label}{d.id === mine ? " (this one)" : ""}</span>
              <span className="block text-xs text-muted">Linked {listTime(d.created_at)}</span>
            </span>
            {d.id !== mine && (
              <button className="min-h-11 px-2 font-semibold text-danger underline" onClick={() => logOut(d)} aria-label={`Log out ${d.label}`}>Log out</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Signing out also removes this phone's keys, so nothing left on it can read new messages. */
export function SignOutButton({ personId }: { personId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-ghost mt-2 self-start" disabled={busy} onClick={async () => {
      if (!confirm("Sign out of Afriheart on this phone? Messages already on it can't be read here again.")) return;
      setBusy(true);
      await forgetThisDevice(personId).catch(() => undefined);
      await signOut();
    }}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
