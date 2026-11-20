"use client";

import { photoSrc, useDataLight } from "@/lib/data-light";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/dating";
import { apiGet, apiSend } from "@/lib/client";
import { IconCalendar, IconClose, IconEdit, IconHeart, IconMore, IconPin, IconShield, IconSparkle } from "./icons";
import { ReportSheet } from "./report-sheet";
import { Gentle } from "./sealed";
import { VoicePlayer } from "./voice-player";
import { hurtful } from "@/lib/kind-words";
import { MAX_COMMENT } from "@/lib/prompts";
import { DoubleDiscover } from "./double";
import { MIN_COMMON } from "@/lib/compatibility";

type Action = "like" | "pass" | "date";

/**
 * One person at a time. Pass, like, or say yes to their date idea. Swipe left
 * or right, use the buttons, or the arrow keys.
 */
export function Discover({ paused, answered, initialMode = "solo" }: { paused: boolean; answered: number; initialMode?: "solo" | "double" }) {
  const { on: light } = useDataLight();
  const [mode, setMode] = useState(initialMode);
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [match, setMatch] = useState<{ chat_id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(0);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reload, setReload] = useState(0);
  const [liking, setLiking] = useState<{ target: string; label: string; preview: string; photo?: string } | null>(null);

  useEffect(() => {
    let live = true;
    apiGet<Card[]>("/api/dating/discover")
      .then((c) => { if (live) { setCards(c); setError(null); } })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [reload]);

  const current = cards?.[0];

  const answer = useCallback(async (action: Action, extra: { target?: string; comment?: string } = {}) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<{ match: { chat_id: string; name: string } | null }>("/api/dating/swipe", "POST", { to: current.id, action, ...extra });
      setLiking(null);
      setCards((c) => {
        const rest = c?.slice(1) ?? [];
        if (rest.length < 3) setReload((n) => n + 1);
        return rest;
      });
      setPhoto(0);
      setMenu(false);
      if (r.match) setMatch(r.match);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setDrag(0);
    }
  }, [current, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (match || reporting || liking || (e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowLeft") answer("pass");
      if (e.key === "ArrowRight") answer("like");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, match, reporting, liking]);

  return (
    <main className="flex flex-1 flex-col px-3 pb-24 pt-4">
      <header className="mb-3 flex items-center justify-between px-1">
        <h1 className="display text-3xl">Discover</h1>
        <div className="flex items-center gap-1">
          <Link href="/dating/likes" className="btn btn-ghost btn-sm" data-likes-link><IconHeart size={16} /> Likes you</Link>
          <Link href="/dating/safety" className="icon-btn text-muted" aria-label="Dating safety"><IconShield /></Link>
          <Link href="/dating/profile" className="icon-btn text-muted" aria-label="Edit your dating profile"><IconEdit /></Link>
        </div>
      </header>

      <div role="tablist" aria-label="How to meet people" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {([["solo", "Solo"], ["double", "Double date"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${mode === id ? "bg-card text-ink shadow-sm" : "text-muted"}`}>{label}</button>
        ))}
      </div>
      {mode === "double" ? <DoubleDiscover /> : <>
      {paused && (
        <p className="mb-3 rounded-xl bg-notice px-4 py-2 text-sm text-notice-ink">Your profile is paused, so new people can&apos;t see you. <Link href="/dating/profile" className="font-semibold underline">Unpause</Link></p>
      )}
      {answered < MIN_COMMON && (
        <Link href="/dating/questions" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2.5 text-sm">
          <span><strong>See your match %.</strong> Answer a few quick questions{answered ? ` (${answered} of ${MIN_COMMON} done)` : ""} and your best matches show up first.</span>
          <span className="shrink-0 font-semibold text-accent">Start</span>
        </Link>
      )}
      {error && <p role="alert" className="mb-3 rounded-xl bg-warm-soft px-4 py-2 text-sm text-warm-ink">{error} <button className="font-semibold underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>}

      {!cards && !error && <div className="flex-1 animate-pulse rounded-3xl bg-line/60" aria-busy="true" aria-label="Loading people" />}

      {cards && !current && (
        <div className="card flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <IconHeart size={40} className="text-accent" />
          <p className="display text-2xl">You&apos;ve seen everyone for now</p>
          <p className="max-w-xs text-sm text-muted">New people join every day. You can also widen the ages or who you&apos;d like to meet.</p>
          <div className="flex gap-2">
            <Link href="/dating/profile" className="btn btn-ghost btn-sm">Change preferences</Link>
            <button className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>Check again</button>
          </div>
        </div>
      )}

      {current && (
        <article aria-label={`${current.name}, ${current.age}`} className="relative flex flex-1 flex-col overflow-hidden rounded-[30px] bg-card shadow-[var(--shadow-lift)] ring-1 ring-[color:var(--hair)]"
          style={{ transform: `translateX(${drag}px) rotate(${drag / 25}deg)`, transition: dragging ? "none" : "transform .2s" }}
          onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("button,a")) { start.current = e.clientX; setDragging(true); } }}
          onPointerMove={(e) => { if (start.current !== null) setDrag(e.clientX - start.current); }}
          onPointerUp={() => {
            const d = drag;
            start.current = null;
            setDragging(false);
            if (d > 110) answer("like");
            else if (d < -110) answer("pass");
            else setDrag(0);
          }}
          onPointerCancel={() => { start.current = null; setDragging(false); setDrag(0); }}>
          <div className="relative min-h-[34dvh] flex-1 bg-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(current.photos[photo], light)} alt={`Photo ${photo + 1} of ${current.photos.length} of ${current.name}`}
              className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
            {current.photos.length > 1 && (
              <>
                <div className="absolute inset-x-3 top-2 flex gap-1" aria-hidden>
                  {current.photos.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i === photo ? "bg-white" : "bg-white/40"}`} />)}
                </div>
                <button className="absolute inset-y-0 left-0 w-1/3" aria-label="Previous photo" onClick={() => setPhoto((p) => Math.max(0, p - 1))} />
                <button className="absolute inset-y-0 right-0 w-1/3" aria-label="Next photo" onClick={() => setPhoto((p) => Math.min(current.photos.length - 1, p + 1))} />
              </>
            )}
            <span className="gilt-frame" aria-hidden />
            {drag > 40 && <span className="display absolute left-6 top-10 rotate-[-8deg] rounded-full border border-white/80 bg-black/35 px-5 py-1 text-3xl italic text-white backdrop-blur-sm">Like</span>}
            {drag < -40 && <span className="display absolute right-6 top-10 rotate-[8deg] rounded-full border border-white/80 bg-black/35 px-5 py-1 text-3xl italic text-white backdrop-blur-sm">Pass</span>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06110f]/90 via-[#06110f]/45 to-transparent px-6 pb-5 pt-24 text-white">
              <p className="display flex items-baseline gap-2.5 text-[2.6rem] leading-none">
                <span>{current.name}</span><span className="text-[1.9rem] font-normal text-white/85">{current.age}</span>
                {current.verified && <span className="flex items-center" title="Photo verified"><IconShield size={22} className="text-[#7fd1ff]" aria-hidden /><span className="sr-only">, photo verified</span></span>}
              </p>
              {(current.area || current.distance) && (
                <p className="mt-2 flex items-center gap-1.5 text-sm tracking-[.01em] text-white/90" data-distance={current.distance ?? ""}>
                  <IconPin size={16} /> {[current.area, current.distance].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {current.daily_pick && (
              <span className="absolute bottom-24 left-5 flex items-center gap-1.5 rounded-full bg-[#f6efe1] px-3.5 py-1.5 text-xs font-semibold text-[#5c431c] shadow" data-daily-pick>
                <IconSparkle size={14} /> Today&apos;s most compatible
              </span>
            )}
            <button onClick={() => setLiking({ target: `photo:${current.photos[photo]}`, label: "photo", preview: `Photo ${photo + 1}`, photo: current.photos[photo] })}
              className="icon-btn absolute bottom-24 right-4 bg-white/95 text-[#0e3b34] shadow-lg" aria-label={`Like this photo of ${current.name}`}>
              <IconHeart size={22} />
            </button>
            {current.compat.score !== null && (
              <span className="absolute left-5 top-6 flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-md" data-match-score={current.compat.score}>
                <IconHeart size={16} /> {current.compat.score}% match
              </span>
            )}
            <button onClick={() => setMenu((m) => !m)} className="icon-btn absolute right-4 top-5 bg-black/40 text-white ring-1 ring-white/25 backdrop-blur-md" aria-label={`More options for ${current.name}`} aria-expanded={menu}><IconMore /></button>
            {menu && (
              <div className="absolute right-2 top-16 z-10 flex flex-col rounded-xl bg-card text-sm shadow-lg">
                <button className="min-h-11 px-4 text-left" onClick={() => { setMenu(false); setReporting(true); }}>Report or block {current.name}</button>
              </div>
            )}
          </div>
          <div className="flex max-h-[24dvh] shrink-0 flex-col gap-2.5 overflow-y-auto px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" data-card-details tabIndex={0} role="region" aria-label={`About ${current.name}`}>
            {current.liked_you && (
              <div className="rounded-2xl bg-warm-soft px-3 py-2 text-sm text-warm-ink" data-liked-you>
                <p className="flex items-center gap-1.5 font-semibold"><IconHeart size={14} fill="currentColor" /> {current.name} liked {current.liked_you.label}</p>
                {current.liked_you.comment && <Gentle text={current.liked_you.comment}><p className="mt-0.5">&ldquo;{current.liked_you.comment}&rdquo;</p></Gentle>}
              </div>
            )}
            <div className="rounded-2xl bg-gold-soft px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-ink"><IconSparkle size={14} /> Date idea</p>
              <p className="display mt-0.5 text-[1.2rem] leading-snug">{current.date_idea}</p>
            </div>
            {current.compat.shared.length > 0 && (
              <p className="text-sm"><span className="font-semibold">You both</span> {current.compat.shared.slice(0, 2).join(" and ")}.</p>
            )}
            {current.prompts.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-2xl border border-line px-3 py-2" data-prompt={p.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted">{p.text}</p>
                  <p className="display text-lg leading-snug">{p.answer}</p>
                </div>
                <button className="icon-btn -mr-2 shrink-0 text-accent" aria-label={`Like ${current.name}'s answer to ${p.text}`}
                  onClick={() => setLiking({ target: `prompt:${p.id}`, label: "answer", preview: `${p.text}: ${p.answer}` })}><IconHeart size={20} /></button>
              </div>
            ))}
            {current.voice && (
              <div className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2" data-voice-prompt>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold text-muted">Voice prompt: {current.voice.prompt}</p>
                  <VoicePlayer src={`/api/dating/photos/${current.voice.path}`} ms={current.voice.ms} />
                </div>
                <button className="icon-btn -mr-2 shrink-0 text-accent" aria-label={`Like ${current.name}'s voice prompt`}
                  onClick={() => setLiking({ target: "voice", label: "voice prompt", preview: `Voice prompt: ${current.voice!.prompt}` })}><IconHeart size={20} /></button>
              </div>
            )}
            {current.bio && <p className="line-clamp-3 text-sm text-muted">{current.bio}</p>}
            {!!current.vouches?.length && (
              <div className="flex flex-col gap-1.5" data-vouches>
                <p className="text-xs font-semibold text-muted">What friends say</p>
                {current.vouches.map((v, i) => (
                  <blockquote key={i} className="rounded-2xl bg-line/40 px-3 py-2 text-sm">
                    <p>&ldquo;{v.text}&rdquo;</p>
                    <footer className="mt-0.5 text-xs text-muted">{v.friend}, {v.relation.toLowerCase()}</footer>
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        </article>
      )}

      {current && (
        <div className="mt-3 flex items-center justify-center gap-5">
          <button onClick={() => answer("pass")} disabled={busy} aria-label={`Pass on ${current.name}`}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-card text-muted shadow-[var(--shadow)]"><IconClose size={28} /></button>
          <button onClick={() => answer("date")} disabled={busy} aria-label={`Yes to the date with ${current.name}: ${current.date_idea}`}
            className="flex h-14 min-w-14 items-center justify-center gap-2 rounded-full border border-gold/60 bg-card px-5 text-sm font-semibold text-ink shadow-[var(--shadow)]"><IconCalendar size={20} /> Yes to the date</button>
          <button onClick={() => answer("like")} disabled={busy} aria-label={`Like ${current.name}`}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow-lift)]"><IconHeart size={28} fill="currentColor" /></button>
        </div>
      )}

      </>}
      {liking && current && <LikeSheet name={current.name} like={liking} busy={busy} onClose={() => setLiking(null)} onSend={(comment) => answer("like", { target: liking.target, comment })} />}

      {reporting && current && (
        <ReportSheet personId={current.id} name={current.name} onClose={() => setReporting(false)}
          onDone={() => { setReporting(false); setCards((c) => c?.slice(1) ?? []); }} />
      )}

      {match && (
        <div role="dialog" aria-modal="true" aria-labelledby="match-title" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(120%_80%_at_50%_0%,#174c43_0%,#0b2723_55%,#06110f_100%)] px-8 text-center text-white">
          <span aria-hidden className="pointer-events-none absolute inset-4 rounded-[28px] border border-[#d6b77e]/60" />
          <IconHeart size={56} />
          <h2 id="match-title" className="display text-5xl italic">It&apos;s a match</h2>
          <p className="text-white/90">You and {match.name} like each other. Your chat is private and end-to-end encrypted, and your phone numbers stay hidden.</p>
          <button className="btn w-full max-w-xs bg-white text-brand" autoFocus onClick={() => router.push(`/chats/${match.chat_id}`)}>Send {match.name} a message</button>
          <button className="min-h-11 font-semibold underline" onClick={() => setMatch(null)}>Keep looking</button>
        </div>
      )}
    </main>
  );
}

/** Like one photo or answer, with an optional comment, like Hinge. */
function LikeSheet({ name, like, busy, onClose, onSend }: {
  name: string; like: { label: string; preview: string; photo?: string }; busy: boolean; onClose: () => void; onSend: (comment: string) => void;
}) {
  const { on: light } = useDataLight();
  const [comment, setComment] = useState("");
  const [warned, setWarned] = useState(false);
  const hurt = hurtful(comment);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="like-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <form className="w-full max-w-md rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (hurt && !warned) { setWarned(true); return; } onSend(comment.trim()); }}>
        <h2 id="like-title" className="display mb-2 text-2xl">Like {name}&apos;s {like.label}</h2>
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-line/50 p-2 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {like.photo && <img src={photoSrc(like.photo, light)} alt="" className="h-16 w-12 rounded-lg object-cover" />}
          <span className="line-clamp-3">{like.preview}</span>
        </div>
        <label htmlFor="like-comment" className="text-sm font-semibold">Add a comment <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="like-comment" className="field mt-1 min-h-20 w-full" maxLength={MAX_COMMENT} value={comment} autoFocus
          onChange={(e) => { setComment(e.target.value); setWarned(false); }} placeholder={`Say why it caught your eye. A comment makes ${name} more likely to like you back.`} />
        <p className="mt-1 text-xs text-muted">Comments are sent before you match, so they aren&apos;t end-to-end encrypted.</p>
        {warned && hurt && <p role="alert" className="mt-2 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink"><strong>Are you sure?</strong> This might come across as hurtful. Tap Send like again to send it anyway.</p>}
        <div className="mt-4 flex gap-2">
          <button className="btn flex-1" disabled={busy}><IconHeart size={18} /> {busy ? "Sending…" : "Send like"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
