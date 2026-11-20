"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { shareLink } from "@/lib/share";
import type { VouchView } from "@/lib/vouch";

/** On the You tab: ask friends to vouch, and choose which vouches show on your profile. */
export function VouchManager({ firstName }: { firstName: string }) {
  const [list, setList] = useState<VouchView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => apiGet<VouchView[]>("/api/vouches").then(setList, () => setList([]));
  useEffect(() => { load(); }, []);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await apiSend<{ token: string }>("/api/vouch/invite", "POST");
      const url = `${location.origin}/vouch/${token}`;
      const how = await shareLink({ title: "Vouch for me on Afriheart", text: `Hey! I'm on Afriheart. Would you write a few kind words about me for my profile? 🙏`, url });
      setNote(how === "copied" ? "Link copied. Paste it to a friend on WhatsApp." : how === "shared" ? "Sent! You'll see their vouch here first." : `Send this link to a friend: ${url}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "shown" | "hidden") {
    setError(null);
    try {
      await apiSend(`/api/vouches/${id}`, "POST", { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const waiting = list?.filter((v) => v.status === "pending") ?? [];
  return (
    <div className="card flex flex-col gap-3" data-vouch-manager>
      <p className="text-sm text-muted">A few words from friends make people trust you faster. Up to three show on your dating profile, and only the ones you approve.</p>
      {waiting.length > 0 && <p className="text-sm font-semibold text-accent" role="status">{waiting.length} new vouch{waiting.length === 1 ? "" : "es"} to look at</p>}
      {list?.map((v) => (
        <div key={v.id} className={`rounded-2xl border px-3 py-2 ${v.status === "pending" ? "border-accent/50 bg-accent-soft/50" : "border-line"}`} data-vouch={v.status}>
          <p className="text-[15px]">&ldquo;{v.text}&rdquo;</p>
          <p className="text-xs text-muted">{v.friend}, {v.relation.toLowerCase()} · {v.status === "shown" ? "On your profile" : v.status === "hidden" ? "Hidden" : "Waiting for you"}</p>
          <div className="mt-1 flex gap-3">
            {v.status !== "shown" && <button className="min-h-11 text-sm font-semibold text-accent underline" onClick={() => decide(v.id, "shown")}>Show on my profile</button>}
            {v.status !== "hidden" && <button className="min-h-11 text-sm font-semibold underline" onClick={() => decide(v.id, "hidden")}>{v.status === "shown" ? "Hide" : "Don't show"}</button>}
          </div>
        </div>
      ))}
      {list?.length === 0 && <p className="text-sm">No vouches yet. Ask a friend who knows the real {firstName}.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {note && <p role="status" className="break-words text-sm">{note}</p>}
      <button className="btn btn-sm self-start" disabled={busy} onClick={ask}>Ask a friend to vouch</button>
    </div>
  );
}
