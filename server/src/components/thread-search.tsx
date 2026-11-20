"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, clock, dayLabel } from "@/lib/client";
import { openMessage } from "@/lib/e2e-device";
import { payloadText } from "@/lib/chat-meta";
import type { Payload } from "@/lib/e2e-crypto";
import { IconBack } from "./icons";

export interface HistoryItem { id: string; cipher: string; sender_id: string | null; sender_name: string | null; created_at: string; meta: string | null; target_id: string | null }
export interface OpenedItem { id: string; sender_id: string | null; sender_name: string | null; created_at: string; payload: Payload; text: string }

/** Loads the whole chat and opens it on this phone (search, media, export: the server can't read it). */
export function useHistory(chatId: string, me: string) {
  const [items, setItems] = useState<OpenedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiGet<HistoryItem[]>(`/api/chats/${chatId}/history`).then(async (list) => {
      const opened = await Promise.all(list.map(async (m) => ({ m, o: await openMessage(chatId, me, m.cipher, m.sender_id) })));
      const edits = new Map<string, string>();
      const senders = new Map(list.map((m) => [m.id, m.sender_id]));
      for (const { m, o } of opened) if (m.meta === "edit" && o.ok && o.payload.t === "edit" && m.target_id && senders.get(m.target_id) === m.sender_id) edits.set(m.target_id, o.payload.text);
      const out: OpenedItem[] = [];
      for (const { m, o } of opened) {
        if (m.meta || !o.ok || o.payload.t === "couple") continue;
        const text = edits.get(m.id) ?? payloadText(o.payload);
        out.push({ id: m.id, sender_id: m.sender_id, sender_name: m.sender_name, created_at: m.created_at, payload: o.payload, text });
      }
      if (live) setItems(out);
    }).catch(() => live && setError("Couldn't load the chat. Check your connection."));
    return () => { live = false; };
  }, [chatId, me]);
  return { items, error };
}

export function ThreadSearch({ chatId, me, onClose, onJump }: { chatId: string; me: string; onClose: () => void; onJump: (id: string) => void }) {
  const { items, error } = useHistory(chatId, me);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!items || needle.length < 2) return [];
    return items.filter((m) => m.text.toLowerCase().includes(needle)).reverse().slice(0, 100);
  }, [items, q]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Search this chat" className="fixed inset-0 z-50 mx-auto flex max-w-xl flex-col bg-paper lg:left-[380px] lg:mx-0 lg:max-w-none">
      <div className="flex items-center gap-1 border-b border-line bg-card px-1 py-1.5 pt-[max(.375rem,env(safe-area-inset-top))]">
        <button className="icon-btn" onClick={onClose} aria-label="Close search"><IconBack /></button>
        <input autoFocus type="search" className="field flex-1 py-2" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!items && !error && <p className="text-sm text-muted">Opening messages on this phone…</p>}
        {items && q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted">No messages with “{q.trim()}”.</p>}
        {items && q.trim().length < 2 && <p className="text-sm text-muted">Messages are searched on this phone. Afriheart can&apos;t read them.</p>}
        <ul className="flex flex-col" data-search-results>
          {results.map((m) => (
            <li key={m.id}>
              <button className="w-full border-b border-line/70 py-2 text-left" onClick={() => onJump(m.id)}>
                <span className="flex justify-between text-xs text-muted"><span className="font-semibold">{m.sender_id === me ? "You" : m.sender_name}</span><span>{dayLabel(m.created_at)} {clock(m.created_at)}</span></span>
                <span className="line-clamp-2 block text-[15px]"><Highlight text={m.text} q={q.trim()} /></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-accent-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
