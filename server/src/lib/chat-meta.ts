"use client";

import { useEffect, useState } from "react";
import { openMessage } from "./e2e-device";
import type { Payload } from "./e2e-crypto";

// Reactions, edits and poll votes travel as small encrypted messages about another
// message. The phone opens them and folds them into the messages they're about.

export interface MetaMsg { id: string; sender_id: string | null; cipher: string | null; meta?: string | null; target_id?: string | null; created_at: string }

export interface MetaState {
  /** target id -> who reacted with what (latest per person; "" = removed). */
  reactions: Map<string, Map<string, string>>;
  /** target id -> the latest edited text (only edits by the original sender count). */
  edits: Map<string, string>;
  /** poll id -> who chose which options (latest per person). */
  votes: Map<string, Map<string, number[]>>;
}

export const EMPTY_META: MetaState = { reactions: new Map(), edits: new Map(), votes: new Map() };

export function useMetas(chatId: string, personId: string, messages: MetaMsg[]): MetaState {
  const [state, setState] = useState<MetaState>(EMPTY_META);
  // A stable key: only re-open when the set of helper messages changes.
  const metas = messages.filter((m) => m.meta && m.target_id && m.cipher);
  const key = metas.map((m) => m.id).join(",");
  const senders = new Map(messages.map((m) => [m.id, m.sender_id]));
  const senderKey = metas.map((m) => `${m.target_id}:${senders.get(m.target_id!) ?? ""}`).join(",");
  useEffect(() => {
    let live = true;
    const list = metas.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    Promise.all(list.map((m) => openMessage(chatId, personId, m.cipher!, m.sender_id).then((o) => ({ m, o })))).then((all) => {
      if (!live) return;
      const next: MetaState = { reactions: new Map(), edits: new Map(), votes: new Map() };
      for (const { m, o } of all) {
        if (!o.ok || !m.sender_id || !m.target_id) continue;
        const p = o.payload as Payload;
        if (m.meta === "react" && p.t === "react") {
          const map = next.reactions.get(m.target_id) ?? new Map<string, string>();
          if (p.emoji) map.set(m.sender_id, p.emoji.slice(0, 8)); else map.delete(m.sender_id);
          next.reactions.set(m.target_id, map);
        } else if (m.meta === "edit" && p.t === "edit") {
          // The server checks this too; the phone checks again because only the sender may edit.
          if (senders.get(m.target_id) === m.sender_id) next.edits.set(m.target_id, p.text);
        } else if (m.meta === "vote" && p.t === "vote") {
          const map = next.votes.get(m.target_id) ?? new Map<string, number[]>();
          if (p.options.length) map.set(m.sender_id, p.options.filter((n) => Number.isInteger(n))); else map.delete(m.sender_id);
          next.votes.set(m.target_id, map);
        }
      }
      setState(next);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, personId, key, senderKey]);
  return state;
}

/** One line of text for a message (previews, replies, search, export). */
export function payloadText(p: Payload): string {
  switch (p.t) {
    case "text": return p.text;
    case "image": return p.once ? "📷 Photo (view once)" : `📷 ${p.caption || "Photo"}`;
    case "voice": return `🎤 Voice note (${Math.max(1, Math.round(p.ms / 1000))} s)`;
    case "file": return p.mime.startsWith("video/") ? `🎬 ${p.caption || "Video"}` : `📄 ${p.name}`;
    case "location": return `📍 ${p.label || "Location"}`;
    case "contact": return `👤 ${p.name}`;
    case "poll": return `📊 ${p.q}`;
    case "sticker": return p.label ? `Sticker: ${p.label}` : "Sticker";
    case "gif": return "GIF";
    case "story": return `📖 ${p.letter} is for ${p.activity}`;
    case "card": return `Talking cards: ${p.question}`;
    case "couple": return "Couple space answer";
    case "status": return p.text || p.caption || "Status";
    default: return "";
  }
}

/** Reactions grouped for display: [emoji, count, includesMe]. */
export function groupReactions(map: Map<string, string> | undefined, me: string): [string, number, boolean][] {
  if (!map) return [];
  const out = new Map<string, [number, boolean]>();
  for (const [who, e] of map) {
    const cur = out.get(e) ?? [0, false];
    out.set(e, [cur[0] + 1, cur[1] || who === me]);
  }
  return [...out.entries()].map(([e, [n, mine]]) => [e, n, mine] as [string, number, boolean]).sort((a, b) => b[1] - a[1]);
}

/** Last seen, like WhatsApp: "online", "last seen today at 14:02", "last seen yesterday at …", or a date. */
export function lastSeenText(p: { online: boolean; last_seen: string | null } | null, now = new Date()): string | null {
  if (!p) return null;
  if (p.online) return "online";
  if (!p.last_seen) return null;
  const d = new Date(p.last_seen);
  const time = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => x.toDateString();
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day(d) === day(now)) return `last seen today at ${time}`;
  if (day(d) === day(y)) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} at ${time}`;
}
