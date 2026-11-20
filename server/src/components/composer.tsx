"use client";

import { dataLightOn, LIGHT_VOICE_BITRATE } from "@/lib/data-light";
import { useEffect, useRef, useState } from "react";
import { apiSend, mmss } from "@/lib/client";
import { mediaUrl, sendEncrypted, uploadEncrypted } from "@/lib/e2e-device";
import { hurtful } from "@/lib/kind-words";
import Link from "next/link";
import { IconCalendar, IconCamera, IconCards, IconCheck, IconClip, IconClose, IconFile, IconImage, IconMic, IconOnce, IconPin, IconPoll, IconRetry, IconSend, IconSmile, IconSparkle, IconTrash, IconUser } from "./icons";
import { ExpressionPanel, photoToSticker, type GifResult } from "./expression-panel";
import { useStickers, type StickerRef } from "@/lib/expressions";
import { VoicePlayer, waveformOf } from "./voice-player";
import type { Extras, Quote } from "@/lib/e2e-crypto";

const MAX_FILE = 12 * 1024 * 1024;
type Member = { id: string; name: string };

/** Text, photos, voice notes, files, polls and "✨ make a plan" — the bottom of a chat. */
export function Composer({ chatId, personId, onSent, onError, direct = false, members = [], replyTo = null, onCancelReply, editing = null, onCancelEdit }: {
  chatId: string; personId: string; onSent: () => Promise<unknown>; onError: (e: string) => void; direct?: boolean;
  /** Others in a group, for @mentions. */
  members?: Member[];
  replyTo?: Quote | null; onCancelReply?: () => void;
  editing?: { id: string; text: string } | null; onCancelEdit?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [panel, setPanel] = useState<null | "poll" | "contact" | "location">(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [once, setOnce] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  // A photo or voice note that couldn't be sent: kept so it can be retried, never silently lost.
  const [failed, setFailed] = useState<{ label: string; retry: () => Promise<unknown> } | null>(null);
  const rec = useRecorder();
  const [warn, setWarn] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [expr, setExpr] = useState(false);
  const [review, setReview] = useState<{ blob: Blob; ms: number; url: string; wave?: number[] } | null>(null);
  const stickers = useStickers();
  const stickerRef = useRef<HTMLInputElement>(null);

  // Editing a message: its text goes into the box (set while rendering, when a new edit starts).
  const editingId = editing?.id ?? null;
  const [editFor, setEditFor] = useState<string | null>(null);
  if (editingId !== editFor) {
    setEditFor(editingId);
    if (editing) setText(editing.text);
  }
  useEffect(() => { if (editingId || replyTo) inputRef.current?.focus(); }, [editingId, replyTo]);

  /** Runs a send. Returns false (and reports why) if it didn't go through. */
  async function run(fn: () => Promise<unknown>, label?: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      setFailed(null);
      await onSent().catch(() => undefined);
      return true;
    } catch (e) {
      onError((e as Error).message);
      if (label) setFailed({ label, retry: fn });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Reply and @mentions travel inside the encrypted message. */
  const extras = (): Extras => ({ ...(replyTo ? { re: replyTo } : {}) });

  function typed(v: string) {
    setText(v);
    // "typing…" for the others: at most every 3 seconds, and never while editing.
    if (v.trim() && !editing && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      apiSend(`/api/chats/${chatId}/typing`, "POST").catch(() => undefined);
    }
  }

  // @mentions in groups: suggest people as you type "@Na…".
  const mentionQuery = members.length ? /(?:^|\s)@([\p{L}]{0,20})$/u.exec(text)?.[1] ?? null : null;
  const suggestions = mentionQuery !== null ? members.filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5) : [];
  function pickMention(m: Member) {
    const first = m.name.split(" ")[0];
    setText((t) => t.replace(/@([\p{L}]{0,20})$/u, `@${first} `));
    setMentioned((x) => [...new Set([...x, m.id])]);
    inputRef.current?.focus();
  }

  async function sendText(anyway = false) {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      setText("");
      const ok = await run(() => sendEncrypted(chatId, personId, { t: "edit", text: body }, { meta: "edit", target: editing.id }));
      if (!ok) setText(body);
      return;
    }
    // "Are you sure?": checked on this phone only, before encrypting.
    if (!anyway && hurtful(body)) {
      setWarn(body);
      return;
    }
    setWarn(null);
    setText("");
    // "@afri …" (or the older "@common …") goes to the assistant (which has to read it); everything else is end-to-end encrypted.
    const ask = /^@(?:afriheart|afri|common)\b[\s,:]*(.*)$/i.exec(body);
    const mentions = mentioned.filter((id) => body.includes(`@${members.find((m) => m.id === id)?.name.split(" ")[0]}`));
    const ok = ask
      ? await run(() => apiSend(`/api/chats/${chatId}/plan`, "POST", { spark: ask[1] }))
      : await run(() => sendEncrypted(chatId, personId, { t: "text", text: body, ...extras(), ...(mentions.length ? { mentions } : {}) }));
    if (ok) setMentioned([]);
    else setText((current) => current || body); // keep what they typed so they can resend
  }

  async function sendPhoto() {
    if (!photo) return;
    const { blob, url } = photo;
    const text = caption.trim();
    const viewOnce = once;
    URL.revokeObjectURL(url);
    setPhoto(null);
    setCaption("");
    setOnce(false);
    const ex = extras();
    await run(async () => {
      const up = await uploadEncrypted(chatId, blob);
      await sendEncrypted(chatId, personId, { t: "image", ...up, mime: "image/jpeg", ...(text && !viewOnce ? { caption: text } : {}), ...(viewOnce ? { once: true } : {}), ...ex }, { media: up.path });
    }, "Photo not sent");
  }

  async function sendFile(file: File) {
    if (file.size > MAX_FILE) return onError(`That file is too big. Files can be up to ${MAX_FILE / 1024 / 1024} MB.`);
    const ex = extras();
    await run(async () => {
      const up = await uploadEncrypted(chatId, file);
      await sendEncrypted(chatId, personId, { t: "file", ...up, mime: file.type || "application/octet-stream", name: file.name.slice(0, 120) || "File", size: file.size, ...ex }, { media: up.path });
    }, `${file.type.startsWith("video/") ? "Video" : "File"} not sent`);
  }

  async function sendVoice(result: { blob: Blob; ms: number }) {
    const mime = result.blob.type.split(";")[0] || "audio/webm";
    const ex = extras();
    const wave = await waveformOf(result.blob);
    await run(async () => {
      const up = await uploadEncrypted(chatId, result.blob);
      await sendEncrypted(chatId, personId, { t: "voice", ...up, mime, ms: Math.round(result.ms), ...(wave ? { wave } : {}), ...ex }, { media: up.path });
    }, "Voice note not sent");
  }

  /** send: straight away. review: stop and listen first. Otherwise: throw it away. */
  async function finishVoice(how: "send" | "review" | "cancel") {
    const result = await rec.stop();
    if (how === "cancel" || !result || result.ms < 700) return;
    if (how === "review") {
      setReview({ ...result, url: URL.createObjectURL(result.blob), wave: await waveformOf(result.blob) });
      return;
    }
    await sendVoice(result);
  }

  async function sendSticker(st: StickerRef) {
    setExpr(false);
    stickers.used(st);
    const ex = extras();
    if (st.kind === "pack") {
      await run(() => sendEncrypted(chatId, personId, { t: "sticker", pack: st.pack, id: st.id, label: st.label, ...ex }), "Sticker not sent");
      return;
    }
    // Your own sticker: re-encrypted for this chat (each chat has its own files).
    await run(async () => {
      const blob = await (await fetch(await mediaUrl(st.path, st.key, st.iv, st.mime))).blob();
      const up = st.chatId === chatId ? { path: st.path, key: st.key, iv: st.iv } : await uploadEncrypted(chatId, blob);
      await sendEncrypted(chatId, personId, { t: "sticker", ...up, mime: st.mime, ...ex }, st.chatId === chatId ? {} : { media: up.path });
    }, "Sticker not sent");
  }

  async function makeSticker(file: File | undefined) {
    if (!file) return;
    setExpr(false);
    const ex = extras();
    await run(async () => {
      const blob = await photoToSticker(file);
      const up = await uploadEncrypted(chatId, blob);
      const ref: StickerRef = { kind: "own", ...up, mime: blob.type || "image/webp", chatId };
      await sendEncrypted(chatId, personId, { t: "sticker", ...up, mime: ref.mime, ...ex }, { media: up.path });
      stickers.used(ref);
      stickers.toggleFav(ref);
    }, "Sticker not sent");
  }

  async function sendGif(g: GifResult) {
    setExpr(false);
    const ex = extras();
    await run(async () => {
      const res = await fetch(g.full);
      if (!res.ok) throw new Error("Couldn't get that GIF. Try another.");
      const blob = await res.blob();
      const up = await uploadEncrypted(chatId, blob);
      await sendEncrypted(chatId, personId, { t: "gif", ...up, mime: blob.type || g.mime, w: g.w, h: g.h, ...(g.title ? { title: g.title.slice(0, 80) } : {}), ...ex }, { media: up.path });
    }, "GIF not sent");
  }

  function openAttach(label: string) {
    if (label === "Gallery") fileRef.current?.click();
    else if (label === "Camera") cameraRef.current?.click();
    else if (label === "Document") docRef.current?.click();
    else if (label === "Location") setPanel("location");
    else if (label === "Contact") setPanel("contact");
    else if (label === "Poll") setPanel("poll");
    else if (label === "Event") setPlanning(true);
  }

  /** Emoji go in where the cursor is. */
  function insertEmoji(e: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { if (el) { const p = start + e.length; el.setSelectionRange(p, p); } });
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.type.startsWith("video/")) return sendFile(file);
    try {
      const blob = await shrink(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      onError("Couldn't open that photo.");
    }
  }

  if (photo) {
    return (
      <div className="border-t border-line bg-card p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="Photo to send" className="mx-auto mb-2 max-h-64 rounded-xl" />
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); setOnce(false); }}>Cancel</button>
          <input className="field py-2" placeholder={once ? "View-once photos have no caption" : "Add a caption…"} disabled={once} value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
          <button className={`icon-btn shrink-0 rounded-full border ${once ? "border-accent bg-accent text-accent-ink" : "border-line"}`} onClick={() => setOnce((x) => !x)}
            aria-pressed={once} aria-label="View once" title="View once: they can open it one time"><IconOnce size={22} /></button>
          <button className="btn h-11 w-11 shrink-0 rounded-full p-0" onClick={sendPhoto} disabled={busy} aria-label="Send photo"><IconSend size={20} /></button>
        </div>
        {once && <p className="mt-2 text-xs text-muted">View once: they can open it one time, then it&apos;s deleted. Afriheart can&apos;t stop screenshots.</p>}
      </div>
    );
  }

  if (review) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-card px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" data-voice-review>
        <button className="icon-btn shrink-0 text-danger" onClick={() => { URL.revokeObjectURL(review.url); setReview(null); }} aria-label="Delete voice note"><IconTrash /></button>
        <div className="min-w-0 flex-1 rounded-2xl bg-paper px-2"><VoicePlayer src={review.url} ms={review.ms} wave={review.wave} /></div>
        <button className="btn h-11 w-11 shrink-0 rounded-full p-0" disabled={busy} onClick={async () => { const r = review; setReview(null); await sendVoice(r); URL.revokeObjectURL(r.url); }} aria-label="Send voice note"><IconSend size={20} /></button>
      </div>
    );
  }

  if (rec.recording) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-card px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" data-recording>
        <button className="icon-btn shrink-0 text-muted" onClick={() => finishVoice("cancel")} aria-label="Cancel voice note"><IconTrash /></button>
        <span className="flex flex-1 items-center gap-2 text-sm font-semibold text-danger" aria-live="off">
          <span className={`h-2.5 w-2.5 rounded-full bg-[#d93b3b] ${rec.paused ? "" : "animate-pulse"}`} /> {rec.paused ? "Paused" : "Recording"} {mmss(rec.ms)}
        </span>
        <button className="icon-btn shrink-0 rounded-full border border-line" onClick={() => (rec.paused ? rec.resume() : rec.pause())} aria-label={rec.paused ? "Carry on recording" : "Pause recording"}>
          {rec.paused ? <IconMic size={20} /> : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>}
        </button>
        <button className="icon-btn shrink-0 rounded-full border border-line" onClick={() => finishVoice("review")} aria-label="Stop and listen"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor" /></svg></button>
        <button className="btn h-11 w-11 shrink-0 rounded-full p-0" onClick={() => finishVoice("send")} aria-label="Send voice note"><IconSend size={20} /></button>
      </div>
    );
  }

  const chip = "chip min-h-11";
  return (
    <section aria-label="Write a message" className="border-t border-line bg-paper px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:px-[max(1rem,calc(50%-26rem))]">
      {failed && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm-ink">
          <span>{failed.label}.</span>
          <span className="flex gap-3">
            <button className="flex items-center gap-1 font-semibold" disabled={busy} onClick={() => run(failed.retry, failed.label)}><IconRetry size={16} /> Try again</button>
            <button className="underline" onClick={() => setFailed(null)}>Discard</button>
          </span>
        </div>
      )}
      {warn && warn === text.trim() && (
        <div role="alert" className="mb-2 flex flex-col gap-1 rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm-ink">
          <span><strong>Are you sure?</strong> This might come across as hurtful. People are more likely to reply to kind messages.</span>
          <span className="flex gap-4">
            <button className="min-h-11 font-semibold underline" onClick={() => setWarn(null)}>Edit message</button>
            <button className="min-h-11 font-semibold underline" disabled={busy} onClick={() => sendText(true)}>Send anyway</button>
          </span>
        </div>
      )}
      {(replyTo || editing) && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-card px-3 py-2" data-composer-context>
          <span className="min-w-0 flex-1 border-l-4 border-accent pl-2">
            <span className="block text-xs font-bold text-accent">{editing ? "Edit message" : `Replying to ${replyTo!.name}`}</span>
            <span className="line-clamp-2 block text-sm text-muted">{editing ? editing.text : replyTo!.text}</span>
          </span>
          <button className="icon-btn -my-1 shrink-0" onClick={() => { if (editing) { setText(""); onCancelEdit?.(); } else onCancelReply?.(); }} aria-label={editing ? "Cancel edit" : "Cancel reply"}><IconClose size={18} /></button>
        </div>
      )}
      {suggestions.length > 0 && (
        <ul className="mb-2 flex flex-col rounded-xl bg-card py-1 shadow" aria-label="Mention someone">
          {suggestions.map((m) => <li key={m.id}><button className="min-h-11 w-full px-3 text-left" onClick={() => pickMention(m)}>@{m.name}</button></li>)}
        </ul>
      )}
      {attach && (
        <div className="mb-2 grid grid-cols-4 gap-x-2 gap-y-3 rounded-2xl border border-line bg-card px-2 py-4 shadow-sm" data-attach-menu>
          {([
            ["Gallery", <IconImage key="i" size={24} />, "#3d6fd8", true],
            ["Camera", <IconCamera key="i" size={24} />, "#d93b6a", true],
            ["Location", <IconPin key="i" size={24} />, "#1f8f5f", true],
            ["Contact", <IconUser key="i" size={24} />, "#2a86c9", true],
            ["Document", <IconFile key="i" size={24} />, "#7a52c7", true],
            ["Poll", <IconPoll key="i" size={24} />, "#c98a12", true],
            ["Event", <IconCalendar key="i" size={24} />, "#d9573b", true],
            ["Talking cards", <IconCards key="i" size={24} />, "#0e5a52", false],
          ] as const).map(([label, icon, colour, isButton]) => isButton ? (
            <button key={label} type="button" className="flex flex-col items-center gap-1 text-xs" onClick={() => { setAttach(false); openAttach(label); }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line" style={{ color: colour }}>{icon}</span>{label}
            </button>
          ) : (
            <Link key={label} href={`/chats/${chatId}/cards`} className="flex flex-col items-center gap-1 text-center text-xs">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line" style={{ color: colour }}>{icon}</span>{label}
            </Link>
          ))}
          {direct && (
            <Link href={`/chats/${chatId}/us`} className="flex flex-col items-center gap-1 text-center text-xs">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line text-xl text-brand" aria-hidden>♥</span>Couple space
            </Link>
          )}
        </div>
      )}
      {expr && <ExpressionPanel onEmoji={insertEmoji} onSticker={sendSticker} onGif={sendGif} onMakeSticker={() => stickerRef.current?.click()} />}
      {panel === "poll" && <PollForm busy={busy} onCancel={() => setPanel(null)} onSend={async (q, options, multi) => {
        setPanel(null);
        const ex = extras();
        await run(() => sendEncrypted(chatId, personId, { t: "poll", q, options, multi, ...ex }), "Poll not sent");
      }} />}
      {panel === "contact" && <ContactForm busy={busy} onCancel={() => setPanel(null)} onSend={async (name, phone) => {
        setPanel(null);
        const ex = extras();
        await run(() => sendEncrypted(chatId, personId, { t: "contact", name, phone, ...ex }), "Contact not sent");
      }} />}
      {panel === "location" && <LocationForm busy={busy} onCancel={() => setPanel(null)} onError={onError} onSend={async (lat, lng, label) => {
        setPanel(null);
        const ex = extras();
        await run(() => sendEncrypted(chatId, personId, { t: "location", lat, lng, ...(label ? { label } : {}), ...ex }), "Location not sent");
      }} />}
      {planning && (
        <form className="mb-2 flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-3" onSubmit={async (e) => {
          e.preventDefault();
          const spark = String(new FormData(e.currentTarget).get("spark") ?? "");
          setPlanning(false);
          await run(() => apiSend(`/api/chats/${chatId}/plan`, "POST", { spark }));
        }}>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-accent" htmlFor="spark"><IconSparkle size={18} /> What do you want to make happen?</label>
          <input id="spark" name="spark" className="field" required minLength={3} maxLength={300} autoFocus placeholder="Braai at mine on Saturday" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlanning(false)}>Cancel</button>
            <button className="btn btn-sm" disabled={busy}>{busy ? "Thinking…" : "Suggest options"}</button>
          </div>
        </form>
      )}
      <div className="flex items-end gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-3xl border border-line bg-card">
          <button type="button" className="icon-btn shrink-0 text-muted" onClick={() => { setExpr((x) => !x); setAttach(false); }} aria-label="Emoji, stickers and GIFs" aria-expanded={expr}><IconSmile /></button>
          <textarea ref={inputRef} rows={1} value={text} onChange={(e) => typed(e.target.value)} placeholder={editing ? "Edit message" : "Message"}
            onFocus={() => setExpr(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                sendText();
              }
              if (e.key === "Escape" && (editing || replyTo)) { if (editing) { setText(""); onCancelEdit?.(); } else onCancelReply?.(); }
            }}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-muted" aria-label="Message" />
          <button type="button" className="icon-btn shrink-0 text-muted" onClick={() => { setAttach((a) => !a); setExpr(false); }} aria-label="Photo, plan, cards and more" aria-expanded={attach}><IconClip /></button>
          {!text.trim() && <button type="button" className="icon-btn shrink-0 text-muted" onClick={() => cameraRef.current?.click()} aria-label="Take a photo"><IconCamera /></button>}
        </div>
        {text.trim() ? (
          <button className="btn h-11 w-11 shrink-0 rounded-full p-0" onClick={() => sendText()} disabled={busy} aria-label={editing ? "Save edit" : "Send"}>{editing ? <IconCheck size={20} /> : <IconSend size={20} />}</button>
        ) : (
          <button className="btn h-11 w-11 shrink-0 rounded-full p-0" onClick={() => rec.start().catch((e) => onError((e as Error).message))} aria-label="Record voice note"><IconMic size={20} /></button>
        )}
      </div>
      <input ref={stickerRef} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1} data-sticker-input onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; makeSticker(f); }} />
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" aria-hidden tabIndex={-1} data-photo-input onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickPhoto(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickPhoto(f); }} />
      <input ref={docRef} type="file" className="hidden" aria-hidden tabIndex={-1} data-doc-input onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendFile(f); }} />
    </section>
  );
}

function PollForm({ busy, onCancel, onSend }: { busy: boolean; onCancel: () => void; onSend: (q: string, options: string[], multi: boolean) => void }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  return (
    <form className="mb-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3" data-poll-form onSubmit={(e) => { e.preventDefault(); onSend(q.trim(), filled, multi); }}>
      <label className="text-sm font-semibold" htmlFor="poll-q">Poll question</label>
      <input id="poll-q" className="field" required maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where should we braai?" autoFocus />
      {options.map((o, i) => (
        <input key={i} className="field" maxLength={100} value={o} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`}
          onChange={(e) => setOptions((list) => {
            const next = list.map((x, j) => (j === i ? e.target.value : x));
            // A new empty option appears as you fill the last one (up to 12).
            if (i === next.length - 1 && e.target.value && next.length < 12) next.push("");
            return next;
          })} />
      ))}
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Allow more than one answer</label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm" disabled={busy || !q.trim() || filled.length < 2}>Send poll</button>
      </div>
    </form>
  );
}

function ContactForm({ busy, onCancel, onSend }: { busy: boolean; onCancel: () => void; onSend: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Android Chrome can open the phone's own contacts (nothing else is shared).
  const picker = typeof navigator !== "undefined" && "contacts" in navigator && "select" in ((navigator as unknown as { contacts: object }).contacts);
  async function pick() {
    try {
      const [c] = await (navigator as unknown as { contacts: { select: (p: string[], o: object) => Promise<{ name?: string[]; tel?: string[] }[]> } }).contacts.select(["name", "tel"], { multiple: false });
      if (c) { setName(c.name?.[0] ?? ""); setPhone(c.tel?.[0] ?? ""); }
    } catch { /* cancelled */ }
  }
  return (
    <form className="mb-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3" data-contact-form onSubmit={(e) => {
      e.preventDefault();
      // Stored like Afriheart's own numbers: 27… for South African numbers starting with 0.
      const digits = phone.replace(/\D/g, "");
      onSend(name.trim(), digits.startsWith("0") ? `27${digits.slice(1)}` : digits);
    }}>
      <p className="text-sm font-semibold">Share a contact</p>
      {picker && <button type="button" className="btn btn-ghost btn-sm self-start" onClick={pick}>Choose from my contacts</button>}
      <input className="field" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Contact name" />
      <input className="field" required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number, e.g. 082 123 4567" aria-label="Contact number" />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm" disabled={busy || !name.trim() || phone.replace(/\D/g, "").length < 9}>Send contact</button>
      </div>
    </form>
  );
}

function LocationForm({ busy, onCancel, onSend, onError }: { busy: boolean; onCancel: () => void; onSend: (lat: number, lng: number, label: string) => void; onError: (e: string) => void }) {
  const [label, setLabel] = useState("");
  const [finding, setFinding] = useState(false);
  function go() {
    if (!navigator.geolocation) return onError("This phone can't share its location.");
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setFinding(false); onSend(Math.round(pos.coords.latitude * 1e5) / 1e5, Math.round(pos.coords.longitude * 1e5) / 1e5, label.trim()); },
      () => { setFinding(false); onError("Allow location to share where you are."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3" data-location-form>
      <p className="text-sm font-semibold">Send your current location</p>
      <p className="text-xs text-muted">It&apos;s sent once, end-to-end encrypted. Afriheart doesn&apos;t keep or track it.</p>
      <input className="field" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this place (optional), e.g. Gate 3" aria-label="Place name" />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm" disabled={busy || finding} onClick={go}>{finding ? "Finding you…" : "Send location"}</button>
      </div>
    </div>
  );
}

/** Photos are resized on the phone before upload: max 1600 px, or 1024 px in data-light mode. */
export async function shrink(file: File): Promise<Blob> {
  const light = dataLightOn();
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, (light ? 1024 : 1600) / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", light ? 0.7 : 0.85));
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ms, setMs] = useState(0);
  // elapsed: time recorded before the last pause; since: when the current stretch started (null while paused).
  const ref = useRef<{ rec: MediaRecorder; chunks: Blob[]; elapsed: number; since: number | null; stream: MediaStream } | null>(null);
  const now = () => { const c = ref.current; return c ? c.elapsed + (c.since ? Date.now() - c.since : 0) : 0; };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setMs(now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => ref.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Voice notes aren't supported in this browser.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error("Allow the microphone to record voice notes.");
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    // Data-light mode records voice notes at about half the size (still clear for speech).
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), ...(dataLightOn() ? { audioBitsPerSecond: LIGHT_VOICE_BITRATE } : {}) });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
    ref.current = { rec, chunks, elapsed: 0, since: Date.now(), stream };
    setMs(0);
    setPaused(false);
    setRecording(true);
  }

  /** Pause and carry on, like WhatsApp's locked recording. */
  function pause() {
    const c = ref.current;
    if (!c || !c.since || c.rec.state !== "recording") return;
    c.rec.pause();
    c.elapsed += Date.now() - c.since;
    c.since = null;
    setMs(c.elapsed);
    setPaused(true);
  }
  function resume() {
    const c = ref.current;
    if (!c || c.since || c.rec.state !== "paused") return;
    c.rec.resume();
    c.since = Date.now();
    setPaused(false);
  }

  function stop(): Promise<{ blob: Blob; ms: number } | null> {
    const cur = ref.current;
    const total = now();
    ref.current = null;
    setRecording(false);
    setPaused(false);
    if (!cur) return Promise.resolve(null);
    return new Promise((resolve) => {
      cur.rec.onstop = () => {
        cur.stream.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(cur.chunks, { type: cur.rec.mimeType || "audio/webm" }), ms: total });
      };
      cur.rec.stop();
    });
  }

  return { recording, paused, ms, start, stop, pause, resume };
}
