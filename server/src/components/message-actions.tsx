"use client";

import { useEffect, useState } from "react";
import { apiGet, clock, whenLong } from "@/lib/client";
import { mediaUrl, sendEncrypted, uploadEncrypted } from "@/lib/e2e-device";
import type { Payload } from "@/lib/e2e-crypto";
import { Avatar } from "./avatar";
import { IconCopy, IconEdit, IconForward, IconHeart, IconInfo, IconReply, IconStar, IconTrash } from "./icons";
import { EmojiPicker } from "./expression-panel";
import { useStickers, type StickerRef } from "@/lib/expressions";
import type { ChatSummary } from "./chat-list";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** The bottom sheet for one message: react, reply, copy, forward, star, edit, info, delete. */
export function MessageSheet({ mine, canEdit, canDeleteForAll, starred, payload, myReaction, onReact, onReply, onCopy, onForward, onStar, onEdit, onInfo, onDeleteMe, onDeleteAll, onReport, onClose, chatId }: {
  mine: boolean; canEdit: boolean; canDeleteForAll: boolean; starred: boolean; payload: Payload | null; myReaction: string | null;
  onReact: (emoji: string) => void; onReply: () => void; onCopy: () => void; onForward: () => void; onStar: () => void; onEdit: () => void;
  onInfo: () => void; onDeleteMe: () => void; onDeleteAll: () => void; onReport?: () => void; onClose: () => void; chatId: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [anyEmoji, setAnyEmoji] = useState(false);
  const stickers = useStickers();
  const sticker: StickerRef | null = payload?.t === "sticker"
    ? payload.pack && payload.id ? { kind: "pack", pack: payload.pack, id: payload.id, label: payload.label ?? "" }
      : payload.path && payload.key && payload.iv ? { kind: "own", path: payload.path, key: payload.key, iv: payload.iv, mime: payload.mime ?? "image/webp", chatId } : null
    : null;
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const canForward = !!payload && payload.t !== "couple" && !(payload.t === "image" && payload.once);
  const canCopy = !!payload && (payload.t === "text" || (payload.t === "image" && !!payload.caption) || payload.t === "location" || payload.t === "contact");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const item = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] active:bg-line/50 hover:bg-line/30";
  return (
    <div role="dialog" aria-modal="true" aria-label="Message options" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} data-message-sheet>
      <div className="w-full max-w-xl rounded-t-3xl bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        {anyEmoji ? (
          <div className="flex h-[min(24rem,60dvh)] flex-col">
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="font-semibold">React with any emoji</p>
              <button className="min-h-11 px-2 text-sm font-semibold underline" onClick={() => setAnyEmoji(false)}>Back</button>
            </div>
            <EmojiPicker compact onPick={onReact} />
          </div>
        ) : confirmDelete ? (
          <div className="flex flex-col gap-1 p-2">
            <p className="mb-2 font-semibold">Delete message?</p>
            {mine && canDeleteForAll && <button className={`${item} text-danger`} onClick={onDeleteAll}>Delete for everyone</button>}
            <button className={`${item} text-danger`} onClick={onDeleteMe}>Delete for me</button>
            <button className={item} onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex justify-between gap-1 rounded-full bg-paper px-2 py-1" role="group" aria-label="React">
              {(myReaction && !QUICK_REACTIONS.includes(myReaction) ? [...QUICK_REACTIONS.slice(0, 5), myReaction] : QUICK_REACTIONS).map((e) => (
                <button key={e} className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl ${myReaction === e ? "bg-accent-soft ring-2 ring-accent" : ""}`}
                  aria-label={`React ${e}`} aria-pressed={myReaction === e} onClick={() => onReact(myReaction === e ? "" : e)}>{e}</button>
              ))}
              <button className="flex h-11 w-11 items-center justify-center rounded-full bg-line/50 text-xl" aria-label="More reactions" onClick={() => setAnyEmoji(true)}>+</button>
            </div>
            <ul className="flex flex-col">
              <li><button className={item} onClick={onReply}><IconReply /> Reply</button></li>
              {canCopy && <li><button className={item} onClick={onCopy}><IconCopy /> Copy</button></li>}
              {canForward && <li><button className={item} onClick={onForward}><IconForward /> Forward</button></li>}
              <li><button className={item} onClick={onStar}><IconStar /> {starred ? "Unstar" : "Star"}</button></li>
              {sticker && (
                <li><button className={item} onClick={() => { const on = stickers.toggleFav(sticker); setSavedNote(on ? "Added to your favourite stickers" : "Removed from favourites"); }}>
                  <IconHeart /> {stickers.isFav(sticker) ? "Remove from favourite stickers" : "Add to favourite stickers"}
                </button></li>
              )}
              {savedNote && <li role="status" className="px-3 py-1 text-sm text-accent">{savedNote}</li>}
              {canEdit && <li><button className={item} onClick={onEdit}><IconEdit /> Edit</button></li>}
              {mine && <li><button className={item} onClick={onInfo}><IconInfo /> Info</button></li>}
              <li><button className={`${item} text-danger`} onClick={() => setConfirmDelete(true)}><IconTrash /> Delete</button></li>
              {!mine && onReport && <li><button className={`${item} text-danger`} onClick={onReport}>Report</button></li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Forward to one or more chats: the phone re-encrypts it for each chat (files are re-uploaded). */
export function ForwardSheet({ personId, payload, onClose, onDone }: { personId: string; payload: Payload; onClose: () => void; onDone: (n: number) => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiGet<ChatSummary[]>("/api/chats").then(setChats).catch(() => setError("Couldn't load your chats.")); }, []);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      for (const to of picked) {
        let next: Payload = { ...payload, fwd: true } as Payload;
        delete (next as { re?: unknown }).re;
        delete (next as { mentions?: unknown }).mentions;
        let media: string | undefined;
        if ("path" in next && next.path && "key" in next && next.key && "iv" in next && next.iv && "mime" in next && next.mime) {
          const blob = await (await fetch(await mediaUrl(next.path, next.key, next.iv, next.mime))).blob();
          const up = await uploadEncrypted(to, blob);
          next = { ...next, ...up } as Payload;
          media = up.path;
        }
        await sendEncrypted(to, personId, next, media ? { media } : {});
      }
      onDone(picked.length);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fwd-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <h2 id="fwd-title" className="display mb-2 text-xl">Forward to…</h2>
        {error && <p role="alert" className="mb-2 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
        <ul className="-mx-1 flex-1 overflow-y-auto">
          {!chats && <li className="p-3 text-sm text-muted">Loading chats…</li>}
          {chats?.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-14 items-center gap-3 rounded-xl px-1 has-[:checked]:bg-accent-soft">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id].slice(0, 5) : p.filter((x) => x !== c.id)))} />
                <Avatar name={c.title} seed={c.id} group={c.kind === "group"} size={40} />
                <span className="truncate font-semibold">{c.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="my-2 text-xs text-muted">Up to 5 chats at a time. Forwarded messages are labelled “Forwarded”.</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!picked.length || busy} onClick={send}>{busy ? "Sending…" : picked.length ? `Send to ${picked.length}` : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

type Info = { sent_at: string; people: { id: string; name: string; status: "sent" | "delivered" | "read"; opened: boolean }[] };

/** Who has a message I sent, and who has read it. */
export function InfoSheet({ chatId, messageId, onClose }: { chatId: string; messageId: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiGet<Info>(`/api/chats/${chatId}/messages/${messageId}/info`).then(setInfo, (e) => setError((e as Error).message)); }, [chatId, messageId]);
  const label = { read: "Read", delivered: "Delivered", sent: "Sent (not delivered yet)" };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="info-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-xl rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <h2 id="info-title" className="display mb-1 text-xl">Message info</h2>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {info && (
          <>
            <p className="mb-3 text-sm text-muted">Sent {whenLong(info.sent_at)}, {clock(info.sent_at)}</p>
            <ul className="flex flex-col" data-message-info>
              {info.people.map((p) => (
                <li key={p.id} className="flex items-center justify-between border-b border-line/70 py-2 last:border-0">
                  <span>{p.name}</span>
                  <span className={`text-sm ${p.status === "read" ? "font-semibold text-accent" : "text-muted"}`}>{label[p.status]}{p.opened ? " · Opened" : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="btn btn-ghost mt-3 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Copies text, with a fallback for older phones. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

