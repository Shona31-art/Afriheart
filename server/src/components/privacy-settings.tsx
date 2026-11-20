"use client";

import Link from "next/link";
import { useState } from "react";
import { apiSend } from "@/lib/client";
import { IconStar } from "./icons";

/** Last seen and read receipts, like WhatsApp: hiding yours also hides everyone else's from you. */
export function PrivacySettings({ initial }: { initial: { hide_last_seen: boolean; read_receipts_off: boolean } }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  async function set(patch: Partial<typeof v>) {
    const before = v;
    setV({ ...v, ...patch });
    setError(null);
    try {
      setV(await apiSend<typeof v>("/api/privacy", "POST", patch));
    } catch (e) {
      setV(before);
      setError((e as Error).message);
    }
  }
  return (
    <div className="card flex flex-col gap-3" data-privacy>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">Show when I&apos;m online and last seen</span>
          <span className="block text-sm text-muted">If you turn this off, you won&apos;t see other people&apos;s either.</span>
        </span>
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--accent)]" checked={!v.hide_last_seen} onChange={(e) => set({ hide_last_seen: !e.target.checked })} />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">Read receipts</span>
          <span className="block text-sm text-muted">Blue ticks in one-to-one chats. If you turn this off, you won&apos;t see other people&apos;s either. Groups always show them.</span>
        </span>
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--accent)]" checked={!v.read_receipts_off} onChange={(e) => set({ read_receipts_off: !e.target.checked })} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Link href="/starred" className="flex min-h-11 items-center gap-2 font-semibold text-accent"><IconStar size={18} /> Starred messages</Link>
    </div>
  );
}
