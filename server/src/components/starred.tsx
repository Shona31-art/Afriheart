"use client";

import Link from "next/link";
import { useState } from "react";
import { apiSend, clock, dayLabel } from "@/lib/client";
import { payloadText } from "@/lib/chat-meta";
import { IconBack, IconStar } from "./icons";
import { useOpened } from "./sealed";

type Item = { id: string; chat_id: string; chat_title: string; cipher: string | null; sender_id: string | null; sender_name: string; created_at: string };

/** Starred messages from every chat, opened on this phone. */
export function Starred({ me, initial }: { me: string; initial: Item[] }) {
  const [items, setItems] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Link href="/" className="icon-btn -ml-3" aria-label="Back to chats"><IconBack /></Link>
        <h1 className="display text-2xl">Starred messages</h1>
      </div>
      {items.length === 0 && (
        <div className="card text-center">
          <IconStar size={32} className="mx-auto mb-2 text-muted" />
          <p className="font-semibold">No starred messages</p>
          <p className="text-sm text-muted">Press and hold a message, then tap Star, to find it here later.</p>
        </div>
      )}
      <ul className="flex flex-col gap-2" data-starred-list>
        {items.map((m) => <Row key={m.id} m={m} me={me} onUnstar={() => {
          setItems((x) => x.filter((y) => y.id !== m.id));
          apiSend(`/api/chats/${m.chat_id}/messages/${m.id}/star`, "DELETE").catch(() => undefined);
        }} />)}
      </ul>
    </div>
  );
}

function Row({ m, me, onUnstar }: { m: Item; me: string; onUnstar: () => void }) {
  const opened = useOpened(m.chat_id, me, m.cipher, m.sender_id);
  return (
    <li className="card flex flex-col gap-1">
      <span className="flex justify-between gap-2 text-xs text-muted">
        <span className="truncate"><span className="font-semibold">{m.sender_id === me ? "You" : m.sender_name}</span> · {m.chat_title}</span>
        <span className="shrink-0">{dayLabel(m.created_at)} {clock(m.created_at)}</span>
      </span>
      <span className="text-[15px]">{opened ? (opened.ok ? payloadText(opened.payload) : "Couldn't open this message on this phone.") : "Decrypting…"}</span>
      <span className="flex gap-4 text-sm">
        <Link href={`/chats/${m.chat_id}`} className="font-semibold text-accent underline">Open chat</Link>
        <button className="font-semibold underline" onClick={onUnstar}>Unstar</button>
      </span>
    </li>
  );
}
