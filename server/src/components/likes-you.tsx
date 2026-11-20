"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client";
import { photoSrc, useDataLight } from "@/lib/data-light";
import type { Card } from "@/lib/dating";
import { IconBack, IconCheck, IconClose, IconHeart } from "./icons";

/** People who already like you. With Afriheart+ you see who, and liking back matches you straight away. */
export function LikesYou({ initial }: { initial: { count: number; plus: boolean; cards: Card[] } }) {
  const router = useRouter();
  const { on: light } = useDataLight();
  const [cards, setCards] = useState(initial.cards);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(c: Card, action: "like" | "pass") {
    setBusy(c.id);
    setError(null);
    try {
      const r = await apiSend<{ match: { chat_id: string } | null }>("/api/dating/swipe", "POST", { to: c.id, action });
      if (r.match) return router.push(`/chats/${r.match.chat_id}`);
      setCards((cs) => cs.filter((x) => x.id !== c.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Link href="/discover" className="icon-btn -ml-3" aria-label="Back to Discover"><IconBack /></Link>
        <h1 className="display text-3xl">Likes you</h1>
      </div>

      {initial.count === 0 && (
        <div className="card text-center">
          <IconHeart size={36} className="mx-auto text-accent" />
          <p className="display mt-2 text-xl">No new likes yet</p>
          <p className="text-sm text-muted">A clear photo, a date idea you&apos;d really go on, and a friend&apos;s vouch all help.</p>
        </div>
      )}

      {!initial.plus && initial.count > 0 && (
        <div className="card flex flex-col items-center gap-3 text-center" data-likes-locked>
          <div className="flex -space-x-3" aria-hidden>
            {Array.from({ length: Math.min(initial.count, 4) }, (_, i) => (
              <span key={i} className="h-16 w-12 rounded-xl border-2 border-card bg-gradient-to-br from-brand/50 to-accent/60 blur-[2px]" />
            ))}
          </div>
          <p className="display text-2xl">{initial.count} {initial.count === 1 ? "person likes" : "people like"} you</p>
          <p className="max-w-xs text-sm text-muted">See who, and match with them straight away, with Afriheart+. Or keep swiping: they&apos;ll show up in Discover too.</p>
          <div className="flex gap-2">
            <Link href="/plus" className="btn">See who with Afriheart+</Link>
            <Link href="/discover" className="btn btn-ghost">Keep swiping</Link>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {initial.plus && (
        <ul className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm" data-like-card>
              <div className="relative aspect-[3/4] bg-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.photos[0] && <img src={photoSrc(c.photos[0], light)} alt={`${c.name}, ${c.age}`} className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 text-white">
                  <p className="font-semibold leading-tight">{c.name}, {c.age}</p>
                  {c.liked_you && <p className="text-xs opacity-95">Liked {c.liked_you.label}</p>}
                </div>
              </div>
              {c.liked_you?.comment && <p className="px-2 pt-2 text-sm">&ldquo;{c.liked_you.comment}&rdquo;</p>}
              <div className="flex gap-1 p-2">
                <button className="btn btn-ghost btn-sm flex-1" disabled={busy === c.id} onClick={() => answer(c, "pass")} aria-label={`Pass on ${c.name}`}><IconClose size={18} /></button>
                <button className="btn btn-sm flex-1" disabled={busy === c.id} onClick={() => answer(c, "like")} aria-label={`Match with ${c.name}`}><IconCheck size={18} /> Match</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {initial.plus && initial.count > 0 && cards.length === 0 && <p className="text-center text-sm text-muted">That&apos;s everyone for now.</p>}
    </div>
  );
}
