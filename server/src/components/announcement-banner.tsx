"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";

type Ann = { id: string; text: string; kind: "info" | "warning" } | null;
const KEY = "afriheart:dismissed-announcement";

/** The team's banner (maintenance, known problems), at the top of every screen until dismissed. */
export function AnnouncementBanner() {
  const [a, setA] = useState<Ann>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let live = true;
    apiGet<{ announcement: Ann }>("/api/announcement").then(({ announcement: x }) => {
      if (!live || !x?.text) return;
      let dismissed: string | null = null;
      try { dismissed = localStorage.getItem(KEY); } catch { /* fine */ }
      setA(x);
      setHidden(dismissed === x.id);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!a || hidden) return null;
  return (
    <div role="status" className={`flex items-start gap-3 px-4 py-2 text-sm ${a.kind === "warning" ? "bg-warm-soft text-warm-ink" : "bg-notice text-notice-ink"}`} data-announcement>
      <p className="flex-1">{a.text} <Link href="/support" className="font-semibold underline">Help</Link></p>
      <button className="shrink-0 font-semibold underline" onClick={() => { setHidden(true); try { localStorage.setItem(KEY, a.id); } catch { /* fine */ } }}>Dismiss</button>
    </div>
  );
}
