"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlanCard } from "@/lib/chat";
import { whenLong } from "@/lib/client";
import { IconCalendar } from "./icons";

const STATE: Record<string, [string, string]> = {
  shaping: ["Draft", "status-prepared"], deciding: ["Voting", "status-prepared"], locked: ["It's on", "status-done"],
  done: ["Happened", "status-done"], dropped: ["Called off", "status-failed"],
};

/** A plan, live inside the chat: vote, In/Maybe/Out, lock, check in — without leaving the conversation. */
/** dateWith: set in a dating match's chat, so the person can tell a friend where they'll be. */
export function PlanCardView({ card, onAct, dateWith }: { card: PlanCard; onAct: (body: Record<string, string>) => void; dateWith?: string }) {
  const [deadline, setDeadline] = useState(() => defaultDeadline(card));
  const [label, cls] = STATE[card.state] ?? ["", ""];
  const voting = card.state === "deciding";
  const top = [...card.options].sort((a, b) => b.votes - a.votes || a.starts_at.localeCompare(b.starts_at))[0];

  return (
    <article className="mx-auto w-full max-w-[92%] overflow-hidden rounded-2xl border border-line bg-card shadow-sm" aria-label={`Plan: ${card.title}`}>
      <div className="bg-brand px-4 py-2 text-white">
        <div className="flex items-center justify-between text-xs font-semibold tracking-[.01em]">
          <span className="flex items-center gap-1.5"><IconCalendar size={14} /> Plan</span>
          <span className={`status ${cls}`}>{label}</span>
        </div>
        <p className="display mt-0.5 text-lg leading-tight">{card.title}</p>
        <p className="text-xs text-white/80">{card.is_organiser ? "You're organising" : `${card.organiser} is organising`}</p>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3 text-sm">
        {card.state === "shaping" && !card.is_organiser && <p className="text-muted">{card.organiser} is choosing the options. You&apos;ll vote here soon.</p>}

        {(voting || (card.state === "shaping" && card.is_organiser)) && card.options.map((o) => (
          <div key={o.id} className={`rounded-xl border px-3 py-2 ${o.mine ? "border-accent bg-accent-soft/50" : "border-line"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{o.what}</p>
                <p className="text-xs text-muted">{whenLong(o.starts_at)} · {o.where}{o.cost != null ? ` · ${o.cost === 0 ? "Free" : `~R${o.cost} pp`}` : ""}</p>
                {voting && <p className="mt-0.5 text-xs font-semibold text-accent">{o.votes === 0 ? "No votes yet" : `${o.votes} ${o.votes === 1 ? "vote" : "votes"}`}{o.id === top?.id && o.votes > 0 ? " · top choice" : ""}</p>}
              </div>
              {voting && (
                <button onClick={() => onAct({ intent: "vote", option_id: o.id })} aria-pressed={o.mine}
                  aria-label={`Works for me: ${o.what}`}
                  className={`chip min-h-11 shrink-0 ${o.mine ? "chip-on" : ""}`}>{o.mine ? "✓ Works for me" : "Works for me"}</button>
              )}
            </div>
          </div>
        ))}

        {card.state === "shaping" && card.is_organiser && (
          <div className="flex flex-col gap-2 rounded-xl bg-paper p-2">
            <label className="text-xs text-muted" htmlFor={`dl-${card.id}`}>Voting closes</label>
            <input id={`dl-${card.id}`} type="datetime-local" className="field py-2 text-sm" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn btn-sm flex-1" onClick={() => onAct({ intent: "send-poll", deadline })}>Open voting in this chat</button>
              <Link href={`/p/${card.slug}`} className="btn btn-ghost btn-sm">Edit</Link>
            </div>
          </div>
        )}

        {voting && (
          <>
            <div className="flex gap-1.5">
              {(["in", "maybe", "out"] as const).map((r) => (
                <button key={r} disabled={card.is_organiser && r !== "in"} onClick={() => onAct({ intent: "respond", response: r })} aria-pressed={card.my_response === r}
                  className={`chip min-h-11 flex-1 justify-center ${card.my_response === r ? "chip-on" : ""} disabled:opacity-50`}>
                  {r === "in" ? "I'm in" : r === "maybe" ? "Maybe" : "Can't"} · {card.counts[r]}
                </button>
              ))}
            </div>
            {card.deadline && <p className="text-xs text-muted">Voting closes {whenLong(card.deadline)}. The top choice is confirmed then, if at least 2 people are in.</p>}
            {card.is_organiser && (
              <div className="flex flex-wrap gap-2">
                {card.counts.maybe > 0 && <button className="btn btn-warm btn-sm" onClick={() => onAct({ intent: "nudge" })}>Ask the maybes</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => onAct({ intent: "lock" })}>Confirm top choice now</button>
              </div>
            )}
          </>
        )}

        {card.locked && (card.state === "locked" || card.state === "done") && (
          <div className="rounded-xl bg-accent-soft/60 px-3 py-2">
            <p className="font-semibold">{card.locked.what}</p>
            <p className="text-xs">{whenLong(card.locked.starts_at)} · {card.locked.where}</p>
            <p className="mt-1 text-xs text-muted">{card.counts.in} going{card.checked_in ? ` · ${card.checked_in} checked in` : ""}</p>
          </div>
        )}
        {card.state === "locked" && (
          <div className="flex flex-wrap gap-2">
            {card.can_check_in && <button className="btn btn-sm" onClick={() => onAct({ intent: "checkin" })}>I&apos;m here: check in</button>}
            {card.checked_in_me && <span className="chip chip-on">You checked in</span>}
            {card.my_response === "in" && <a className="btn btn-ghost btn-sm" href={`/p/${card.slug}/ics`}>Add to calendar</a>}
            {dateWith && card.locked && (
              <a className="btn btn-sm" target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`Heads up: I'm meeting ${dateWith} (from Afriheart) for "${card.locked.what}" at ${card.locked.where} on ${whenLong(card.locked.starts_at)}. I'll message you when I'm home safe.`)}`}>
                Share date details with a friend
              </a>
            )}
            <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${card.locked?.what} ${card.locked?.where}`)}`}>Directions</a>
          </div>
        )}
        {card.state === "done" && card.checked_in_me && (
          <div className="flex items-center gap-2">
            <span>Do it again?</span>
            <button className="chip" onClick={() => onAct({ intent: "again", again: "yes" })}>👍 Again</button>
            {card.is_organiser && <Link className="text-xs font-semibold text-accent underline" href={`/p/${card.slug}`}>Make it a Circle</Link>}
          </div>
        )}
        <Link href={`/p/${card.slug}`} className="text-right text-xs font-semibold text-accent">Open plan →</Link>
      </div>
    </article>
  );
}

function defaultDeadline(card: PlanCard): string {
  const tz = process.env.NEXT_PUBLIC_CITY_TZ || "Africa/Johannesburg";
  const iso = card.deadline && Date.parse(card.deadline) > Date.now() ? card.deadline : new Date(Date.now() + 86400000).toISOString();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
