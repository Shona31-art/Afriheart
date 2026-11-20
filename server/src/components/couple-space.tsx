"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { openMessage, sealForChat } from "@/lib/e2e-device";
import { useLive } from "@/lib/live";
import type { CoupleView } from "@/lib/couple";
import { IconBack, IconCards, IconLock, IconSparkle } from "./icons";

const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Reads an end-to-end encrypted Couple space answer on this phone. */
function useAnswer(chatId: string, meId: string, cipher: string | null, from: string): string | null | "unreadable" {
  const [text, setText] = useState<string | null | "unreadable">(null);
  useEffect(() => {
    let live = true;
    if (!cipher) { queueMicrotask(() => live && setText(null)); return () => { live = false; }; }
    openMessage(chatId, meId, cipher, from).then((o) => {
      if (!live) return;
      setText(o.ok && o.payload.t === "couple" ? o.payload.answer : "unreadable");
    });
    return () => { live = false; };
  }, [chatId, meId, cipher, from]);
  return text;
}

/**
 * Couple space: today's question (both answer, then both see), how long you've been together,
 * your next date and anniversary, and quick ways into Alphabet date ideas and Talking cards.
 */
export function CoupleSpace({ chatId, meId, initial }: { chatId: string; meId: string; initial: CoupleView }) {
  const [v, setV] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(initial.together_since);
  const [editSince, setEditSince] = useState(false);
  const refresh = useCallback(() => apiGet<CoupleView>(`/api/chats/${chatId}/couple`).then(setV, () => undefined), [chatId]);
  useLive((n) => { if (n.chat === chatId || n.resync) refresh(); });

  const mine = useAnswer(chatId, meId, v.mine, meId);
  const theirs = useAnswer(chatId, meId, v.theirs, v.partner.id);
  const partner = v.partner.name.split(" ")[0];

  async function answer() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const cipher = await sealForChat(chatId, meId, { t: "couple", question: v.question, answer: draft.trim().slice(0, 500) });
      await apiSend(`/api/chats/${chatId}/couple`, "POST", { action: "answer", cipher, date: v.today });
      setEditing(false);
      setDraft("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSince() {
    setError(null);
    try {
      await apiSend(`/api/chats/${chatId}/couple`, "POST", { action: "since", date: since });
      setEditSince(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const answered = !!v.mine && !editing;

  return (
    <main className="page flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Link href={`/chats/${chatId}`} className="icon-btn -ml-3" aria-label="Back to chat"><IconBack /></Link>
        <div className="min-w-0">
          <h1 className="display text-2xl leading-tight">Couple space</h1>
          <p className="truncate text-sm text-muted">You and {v.partner.name}</p>
        </div>
      </div>

      <section aria-label="Question of the day" className="rounded-3xl bg-brand p-4 text-white" data-question-of-the-day>
        <p className="text-sm font-medium opacity-90">Question of the day{v.streak > 1 ? ` · ${v.streak}-day streak` : ""}</p>
        <p className="display mt-1.5 text-2xl leading-snug">{v.question}</p>
        <div className="mt-3 flex flex-col gap-2">
          {answered ? (
            <div className="rounded-2xl bg-white/15 px-3 py-2">
              <p className="text-xs font-semibold opacity-90">You said</p>
              <p data-my-answer>{mine === "unreadable" ? "Answered on another phone" : mine ?? "…"}</p>
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="couple-answer">Your answer</label>
              <textarea id="couple-answer" className="min-h-20 rounded-2xl bg-white px-3 py-2 text-ink placeholder:text-muted" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500}
                placeholder={`Your answer. ${partner} sees it once they've answered too.`} />
              <button className="btn !border-white !bg-white !text-[#0b2f2b]" disabled={busy || !draft.trim()} onClick={answer}>{busy ? "Sending…" : "Answer"}</button>
            </>
          )}
          {v.theirs ? (
            <div className="rounded-2xl bg-white px-3 py-2 text-ink">
              <p className="text-xs font-semibold text-muted">{partner} said</p>
              <p data-their-answer>{theirs === "unreadable" ? "Couldn't open this on this phone" : theirs ?? "…"}</p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm opacity-95">
              <IconLock size={14} />
              {v.partner_answered ? `${partner} has answered. Answer to see what they said.` : answered ? `Waiting for ${partner} to answer.` : `Answers stay hidden until you've both answered.`}
            </p>
          )}
          {answered && !v.theirs && <button className="self-start text-sm font-semibold underline" onClick={() => { setEditing(true); setDraft(mine && mine !== "unreadable" ? mine : ""); }}>Change my answer</button>}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <section aria-label="Together" className="card flex flex-col">
          <p className="text-sm font-semibold text-muted">Together</p>
          <p className="display text-3xl" data-days-together>{v.days_together}</p>
          <p className="text-sm text-muted">{v.days_together === 1 ? "day" : "days"} since {longDate(v.together_since)}</p>
          {editSince ? (
            <div className="mt-2 flex flex-col gap-1">
              <label className="text-xs font-semibold" htmlFor="since">We got together on</label>
              <input id="since" type="date" className="field" value={since} max={v.today} onChange={(e) => setSince(e.target.value)} />
              <button className="btn btn-sm" onClick={saveSince}>Save</button>
            </div>
          ) : (
            <button className="mt-1 min-h-11 self-start text-sm font-semibold text-accent underline" onClick={() => setEditSince(true)}>Change date</button>
          )}
        </section>
        <section aria-label="Next anniversary" className="card flex flex-col">
          <p className="text-sm font-semibold text-muted">Anniversary</p>
          <p className="display text-3xl">{v.next_anniversary.in_days}</p>
          <p className="text-sm text-muted">{v.next_anniversary.in_days === 1 ? "day" : "days"} until your {v.next_anniversary.years === 1 ? "first" : `${v.next_anniversary.years}-year`} anniversary, {longDate(v.next_anniversary.date)}</p>
        </section>
      </div>

      <section aria-label="Next date" className="card flex items-center justify-between gap-3">
        {v.next_date ? (
          <>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted">Next date</p>
              <p className="truncate font-semibold">{v.next_date.title}</p>
              <p className="text-sm text-muted">{v.next_date.in_days <= 0 ? "Today!" : v.next_date.in_days === 1 ? "Tomorrow" : `In ${plural(v.next_date.in_days, "day")}`}</p>
            </div>
            <Link href={`/p/${v.next_date.slug}`} className="btn btn-ghost btn-sm shrink-0">See plan</Link>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold text-muted">Next date</p>
              <p className="text-sm">Nothing planned yet. Pick a day together.</p>
            </div>
            <Link href={`/chats/${chatId}`} className="btn btn-sm shrink-0"><IconSparkle size={16} /> Plan in chat</Link>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/chats/${chatId}/az`} className="card flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted">Alphabet date ideas</span>
          <span className="display text-2xl">{v.az_done}/26</span>
          <span className="text-sm text-muted">letters done</span>
        </Link>
        <Link href={`/chats/${chatId}/cards`} className="card flex flex-col gap-1">
          <IconCards size={22} className="text-accent" />
          <span className="font-semibold">Talking cards</span>
          <span className="text-sm text-muted">Questions to play together</span>
        </Link>
      </div>
    </main>
  );
}
