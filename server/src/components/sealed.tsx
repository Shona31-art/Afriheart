"use client";

import { CARD_DECKS, deckById } from "@/lib/card-decks";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaUrl, openMessage, type Opened } from "@/lib/e2e-device";
import type { Payload, Quote } from "@/lib/e2e-crypto";
import { VoicePlayer } from "./voice-player";
import { StickerImage } from "./expression-panel";
import { onlyEmoji } from "@/lib/expressions";
import { useDataLight } from "@/lib/data-light";
import { HURT_LABEL, hurtful } from "@/lib/kind-words";
import { apiSend, formatPhone } from "@/lib/client";
import { IconDownload, IconFile, IconForward, IconOnce, IconPin, IconUser } from "./icons";

/** Decrypts one message on this phone and shows it. */
export function useOpened(chatId: string, personId: string, cipher: string | null, senderId: string | null): Opened | null {
  const [state, setState] = useState<Opened | null>(null);
  useEffect(() => {
    let live = true;
    if (cipher) openMessage(chatId, personId, cipher, senderId).then((o) => live && setState(o));
    return () => { live = false; };
  }, [chatId, personId, cipher, senderId]);
  return state;
}

/**
 * "Does this bother you?": a received message that looks hurtful stays blurred
 * until tapped, with a way to report it. Checked on this phone only.
 */
export function Gentle({ text, mine, onReport, children }: { text: string | null | undefined; mine?: boolean; onReport?: (text: string) => void; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const hurt = mine ? null : hurtful(text);
  if (!hurt || shown) return <>{children}</>;
  return (
    <span className="block" data-hurtful={hurt.reason}>
      <span className="block select-none text-[15px] leading-snug blur-sm" aria-hidden>{text}</span>
      <span className="mt-1 block text-sm font-semibold">Does this bother you?</span>
      <span className="block text-xs text-muted">{HURT_LABEL[hurt.reason]}</span>
      <span className="mt-1 flex gap-3">
        <button className="min-h-11 text-sm font-semibold text-accent underline" onClick={(e) => { e.stopPropagation(); setShown(true); }}>Show message</button>
        {onReport && <button className="min-h-11 text-sm font-semibold text-danger underline" onClick={(e) => { e.stopPropagation(); onReport(text ?? ""); }}>Report</button>}
      </span>
    </span>
  );
}

/** Everything a message bubble needs beyond the payload itself. */
export interface SealedContext {
  msgId?: string;
  chatId?: string;
  me?: string;
  senderId?: string | null;
  members?: { id: string; name: string }[];
  edited?: string;
  votes?: Map<string, number[]>;
  openedBy?: string[];
  onVote?: (options: number[]) => void;
  onQuote?: (id: string) => void;
  onOpenedOnce?: () => void;
}

export function SealedContent({ opened, onImage, mine, onReport, ctx = {} }: { opened: Opened | null; onImage: (src: string) => void; mine?: boolean; onReport?: (text: string) => void; ctx?: SealedContext }) {
  if (!opened) return <span className="text-sm text-muted">Decrypting…</span>;
  if (!opened.ok) {
    return (
      <span className="text-sm italic text-muted">
        {opened.reason === "waiting"
          ? "🔒 Waiting for this message. It was sent before this phone was set up, so it can't be read here."
          : "⚠️ This message couldn't be verified and was hidden."}
      </span>
    );
  }
  const p = opened.payload;
  const extras = "re" in p || "fwd" in p ? (p as { re?: Quote; fwd?: boolean }) : {};
  return (
    <>
      {extras.fwd && <span className="mb-0.5 flex items-center gap-1 text-xs italic text-muted" data-forwarded><IconForward size={13} /> Forwarded</span>}
      {extras.re && <QuoteBlock quote={extras.re} onTap={ctx.onQuote} />}
      <Body p={p} onImage={onImage} mine={mine} onReport={onReport} ctx={ctx} />
    </>
  );
}

export function QuoteBlock({ quote, onTap }: { quote: Quote; onTap?: (id: string) => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onTap?.(quote.id); }} data-quote
      className="mb-1 block w-full min-w-40 rounded-lg border-l-4 border-accent bg-black/5 px-2 py-1 text-left dark:bg-white/10">
      <span className="block text-xs font-bold text-accent">{quote.name}</span>
      <span className="line-clamp-2 block text-[13px] text-ink/75">{quote.text}</span>
    </button>
  );
}

/** Text with @mentions of people in the chat in bold. */
function WithMentions({ text, members, mentions }: { text: string; members?: { id: string; name: string }[]; mentions?: string[] }) {
  const names = (members ?? []).filter((m) => mentions?.includes(m.id)).map((m) => `@${m.name.split(" ")[0]}`);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{text.split(re).map((part, i) => (names.includes(part) ? <strong key={i} className="font-semibold text-accent" data-mention>{part}</strong> : part))}</>;
}

function Body({ p, onImage, mine, onReport, ctx }: { p: Payload; onImage: (src: string) => void; mine?: boolean; onReport?: (text: string) => void; ctx: SealedContext }) {
  if (p.t === "text") {
    const text = ctx.edited ?? p.text;
    return (
      <Gentle text={text} mine={mine} onReport={onReport}>
        <span className={`whitespace-pre-wrap break-words leading-snug ${onlyEmoji(text) ? "text-5xl leading-tight" : "text-[15px]"}`} data-big-emoji={onlyEmoji(text) || undefined}><Linkify text={text} members={ctx.members} mentions={p.mentions} /></span>
        {ctx.edited !== undefined && <span className="ml-1 text-[11px] text-muted" data-edited>Edited</span>}
      </Gentle>
    );
  }
  if (p.t === "story") {
    return (
      <span className="block text-[15px] leading-snug">
        <span className="block text-xs font-semibold text-accent">📖 Our alphabet dates: {p.letter} is for {p.activity}</span>
        {p.story && <span className="block">{p.story}</span>}
        <span className="block text-xs text-muted" aria-label={`${p.rating} out of 5 hearts`}>{"♥".repeat(Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0))))}{"♡".repeat(5 - Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0))))}</span>
      </span>
    );
  }
  if (p.t === "couple") return <span className="block"><span className="block text-xs opacity-80">Couple space · {p.question}</span>{p.answer}</span>;
  if (p.t === "card") {
    const deck = deckById(p.deck) ?? CARD_DECKS[0];
    return (
      <span className="block min-w-52 max-w-64 rounded-2xl px-4 py-3" style={{ background: deck.bg, color: deck.ink }} data-card-message>
        <span className="block text-[11px] font-bold uppercase tracking-[.2em] opacity-90">Talking cards · {deck.name}</span>
        <span className="display mt-1.5 block text-lg leading-snug">{p.question}</span>
        <span className="mt-2 block text-xs opacity-90">Answer it here in the chat</span>
      </span>
    );
  }
  if (p.t === "image") {
    if (p.once) return <ViewOnce p={p} mine={mine} ctx={ctx} onImage={onImage} />;
    return <Gentle text={p.caption} mine={mine} onReport={onReport}><EncryptedImage path={p.path} k={p.key} iv={p.iv} mime={p.mime} caption={p.caption} onImage={onImage} /></Gentle>;
  }
  if (p.t === "voice") return <EncryptedVoice path={p.path} k={p.key} iv={p.iv} mime={p.mime} ms={p.ms} wave={Array.isArray(p.wave) ? p.wave.slice(0, 64).map(Number) : undefined} />;
  if (p.t === "sticker") return <StickerMessage p={p} />;
  if (p.t === "gif") return <GifMessage p={p} />;
  if (p.t === "file") return <EncryptedFile p={p} />;
  if (p.t === "location") {
    const url = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex min-w-52 items-center gap-3 rounded-lg bg-black/5 p-2 dark:bg-white/10" data-location>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"><IconPin size={22} /></span>
        <span className="min-w-0">
          <span className="block font-semibold">{p.label || "Location"}</span>
          <span className="block text-xs text-ink/75">{p.lat.toFixed(5)}, {p.lng.toFixed(5)} · Open in Maps</span>
        </span>
      </a>
    );
  }
  if (p.t === "contact") return <ContactCard name={p.name} phone={p.phone} />;
  if (p.t === "poll") return <Poll p={p} ctx={ctx} />;
  return null;
}

/** Web links in messages become tappable (they open outside Afriheart). */
function Linkify({ text, members, mentions }: { text: string; members?: { id: string; name: string }[]; mentions?: string[] }) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g);
  return (
    <>
      {parts.map((part, i) => i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline" onClick={(e) => e.stopPropagation()}>{part}</a>
        : <WithMentions key={i} text={part} members={members} mentions={mentions} />)}
    </>
  );
}

function ContactCard({ name, phone }: { name: string; phone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="block min-w-52" data-contact>
      <span className="flex items-center gap-3 rounded-lg bg-black/5 p-2 dark:bg-white/10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line"><IconUser size={22} /></span>
        <span className="min-w-0">
          <span className="block font-semibold">{name}</span>
          <span className="block text-xs text-ink/75">{formatPhone(phone)}</span>
        </span>
      </span>
      <button className="mt-1 min-h-11 w-full text-sm font-semibold text-accent" disabled={busy} onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const c = await apiSend<{ id: string }>("/api/chats", "POST", { kind: "direct", phone, name });
          router.push(`/chats/${c.id}`);
        } catch {
          setBusy(false);
        }
      }}>Message {name.split(" ")[0]}</button>
    </span>
  );
}

function Poll({ p, ctx }: { p: Extract<Payload, { t: "poll" }>; ctx: SealedContext }) {
  const votes = ctx.votes ?? new Map<string, number[]>();
  const mine = new Set(ctx.me ? votes.get(ctx.me) ?? [] : []);
  const counts = p.options.map((_, i) => [...votes.values()].filter((v) => v.includes(i)).length);
  const voters = [...votes.values()].filter((v) => v.length).length;
  const max = Math.max(1, ...counts);
  const names = new Map((ctx.members ?? []).map((m) => [m.id, m.name.split(" ")[0]]));
  function toggle(i: number) {
    let next: number[];
    if (p.multi) next = mine.has(i) ? [...mine].filter((x) => x !== i) : [...mine, i];
    else next = mine.has(i) ? [] : [i];
    ctx.onVote?.(next.sort((a, b) => a - b));
  }
  return (
    <span className="block min-w-60" data-poll>
      <span className="mb-1 block font-semibold">{p.q}</span>
      <span className="mb-2 block text-xs text-muted">{p.multi ? "Select one or more" : "Select one"}</span>
      <span className="flex flex-col gap-1.5" role="group" aria-label={`Poll: ${p.q}`}>
        {p.options.map((o, i) => {
          const who = [...votes.entries()].filter(([, v]) => v.includes(i)).map(([id]) => (id === ctx.me ? "You" : names.get(id) ?? "Someone"));
          return (
            <button key={i} type="button" onClick={(e) => { e.stopPropagation(); toggle(i); }} aria-pressed={mine.has(i)}
              className="relative block min-h-11 w-full overflow-hidden rounded-lg border border-line px-3 py-2 text-left">
              <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(counts[i] / max) * 100}%` }} aria-hidden />
              <span className="relative flex items-center gap-2">
                <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center ${p.multi ? "rounded" : "rounded-full"} border-2 ${mine.has(i) ? "border-accent bg-accent text-accent-ink" : "border-muted"}`}>{mine.has(i) ? "✓" : ""}</span>
                <span className="flex-1 text-[15px]">{o}</span>
                <span className="text-sm font-semibold" aria-label={`${counts[i]} votes`}>{counts[i]}</span>
              </span>
              {who.length > 0 && <span className="relative mt-0.5 block pl-7 text-xs">{who.join(", ")}</span>}
            </button>
          );
        })}
      </span>
      <span className="mt-1 block text-xs text-muted">{voters} {voters === 1 ? "person has" : "people have"} voted</span>
    </span>
  );
}

/** A photo that can be opened once: then the encrypted file is deleted from the server. */
function ViewOnce({ p, mine, ctx, onImage }: { p: Extract<Payload, { t: "image" }>; mine?: boolean; ctx: SealedContext; onImage: (src: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const openedByMe = !!ctx.me && (ctx.openedBy ?? []).includes(ctx.me);
  const openedByOthers = (ctx.openedBy ?? []).length > 0;
  if (mine) {
    return <span className="flex items-center gap-2 text-[15px]" data-view-once><IconOnce size={20} /> Photo · {openedByOthers ? "Opened" : "View once"}</span>;
  }
  if (openedByMe) return <span className="flex items-center gap-2 text-[15px] text-muted" data-view-once><IconOnce size={20} /> Opened</span>;
  return (
    <button className="flex min-h-11 items-center gap-2 text-[15px] font-semibold" data-view-once disabled={busy} onClick={async (e) => {
      e.stopPropagation();
      setBusy(true);
      try {
        const url = await mediaUrl(p.path, p.key, p.iv, p.mime);
        onImage(url);
        ctx.onOpenedOnce?.();
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    }}>
      <IconOnce size={20} /> {failed ? "Photo unavailable" : busy ? "Opening…" : "Photo · tap to view once"}
    </button>
  );
}

/** Downloads and decrypts a photo or voice note: straight away, or only when tapped in data-light mode. */
function useMedia(path: string, k: string, iv: string, mime: string, lazy = false) {
  const { on: light } = useDataLight();
  const [asked, setAsked] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const go = (!light && !lazy) || asked;
  useEffect(() => {
    if (!go) return;
    let live = true;
    mediaUrl(path, k, iv, mime).then((u) => live && setUrl(u), () => live && setFailed(true));
    return () => { live = false; };
  }, [path, k, iv, mime, go]);
  return { url, failed, waiting: !go, load: () => setAsked(true) };
}

function EncryptedImage({ path, k, iv, mime, caption, onImage }: { path: string; k: string; iv: string; mime: string; caption?: string; onImage: (s: string) => void }) {
  const { url, failed, waiting, load } = useMedia(path, k, iv, mime);
  return (
    <>
      {waiting ? (
        <button onClick={(e) => { e.stopPropagation(); load(); }} className="flex h-28 w-56 flex-col items-center justify-center gap-1 rounded-lg bg-line/60 text-sm" data-light-photo>
          <span className="font-semibold">Tap to load photo</span>
          <span className="text-xs text-muted">Data-light mode is on</span>
        </button>
      ) : url ? (
        <button onClick={(e) => { e.stopPropagation(); onImage(url); }} className="block" aria-label="Open photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Photo" className="max-h-72 w-full rounded-lg object-cover" />
        </button>
      ) : (
        <span className="flex h-40 w-56 items-center justify-center rounded-lg bg-line/60 text-sm text-muted">{failed ? "Photo unavailable" : "Loading photo…"}</span>
      )}
      {caption && <span className="mt-1 block text-[15px] leading-snug">{caption}</span>}
    </>
  );
}

function EncryptedVoice({ path, k, iv, mime, ms, wave }: { path: string; k: string; iv: string; mime: string; ms: number; wave?: number[] }) {
  const { url, failed, waiting, load } = useMedia(path, k, iv, mime);
  if (failed) return <span className="text-sm text-muted">Voice note unavailable</span>;
  if (waiting) return <button onClick={(e) => { e.stopPropagation(); load(); }} className="min-h-11 text-sm font-semibold underline">Tap to load voice note ({Math.max(1, Math.round(ms / 1000))} s)</button>;
  return url ? <VoicePlayer src={url} ms={ms} wave={wave} /> : <span className="text-sm text-muted">Loading voice note…</span>;
}

/** Stickers show without a bubble, like WhatsApp. */
function StickerMessage({ p }: { p: Extract<Payload, { t: "sticker" }> }) {
  if (p.pack && p.id && /^[a-z0-9-]{1,40}$/.test(p.id)) return <span data-sticker><StickerImage s={{ kind: "pack", pack: p.pack, id: p.id, label: p.label ?? "" }} size={150} /></span>;
  if (p.path && p.key && p.iv) return <span data-sticker><StickerImage s={{ kind: "own", path: p.path, key: p.key, iv: p.iv, mime: p.mime ?? "image/webp", chatId: "" }} size={150} /></span>;
  return <span className="text-sm text-muted">Sticker</span>;
}

/** GIFs play on a loop, silently (tap to play in data-light mode). */
function GifMessage({ p }: { p: Extract<Payload, { t: "gif" }> }) {
  const { url, failed, waiting, load } = useMedia(p.path, p.key, p.iv, p.mime);
  const w = 220;
  const h = Math.round(w * (Math.min(2, Math.max(0.4, (p.h || 1) / (p.w || 1)))));
  if (waiting) return <button onClick={(e) => { e.stopPropagation(); load(); }} className="flex items-center justify-center rounded-lg bg-line/60 text-sm font-semibold" style={{ width: w, height: h }} data-gif>Tap to play GIF</button>;
  if (!url) return <span className="flex items-center justify-center rounded-lg bg-line/60 text-sm text-muted" style={{ width: w, height: h }} data-gif>{failed ? "GIF unavailable" : "Loading GIF…"}</span>;
  return (
    <span className="relative block" data-gif>
      {p.mime.startsWith("video/")
        ? <video src={url} autoPlay loop muted playsInline aria-label={p.title || "GIF"} className="block rounded-lg" style={{ width: w, height: h, objectFit: "cover" }} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt={p.title || "GIF"} className="block rounded-lg" style={{ width: w, height: h, objectFit: "cover" }} />}
      <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1 text-[10px] font-bold text-white" aria-hidden>GIF</span>
    </span>
  );
}

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Documents download when tapped; videos play in the chat (loaded when tapped). */
function EncryptedFile({ p }: { p: Extract<Payload, { t: "file" }> }) {
  const video = p.mime.startsWith("video/");
  const { url, failed, waiting, load } = useMedia(p.path, p.key, p.iv, p.mime, true);
  const [saveFailed, setSaveFailed] = useState(false);
  async function save() {
    try {
      const u = await mediaUrl(p.path, p.key, p.iv, p.mime);
      const a = document.createElement("a");
      a.href = u;
      a.download = p.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setSaveFailed(true);
    }
  }
  if (video) {
    return (
      <span className="block" data-video>
        {url ? (
          <video src={url} controls playsInline className="max-h-72 w-64 rounded-lg bg-black" />
        ) : (
          <button onClick={(e) => { e.stopPropagation(); load(); }} className="flex h-36 w-64 flex-col items-center justify-center gap-1 rounded-lg bg-black/80 text-white">
            <span className="text-2xl" aria-hidden>▶</span>
            <span className="text-sm font-semibold">{failed ? "Video unavailable" : waiting ? `Play video (${fileSize(p.size)})` : "Loading video…"}</span>
          </button>
        )}
        {p.caption && <span className="mt-1 block text-[15px] leading-snug">{p.caption}</span>}
      </span>
    );
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); save(); }} className="flex min-w-56 items-center gap-3 rounded-lg bg-black/5 p-2 text-left dark:bg-white/10" data-file>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><IconFile size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{p.name}</span>
        <span className="block text-xs text-ink/75">{saveFailed ? "Unavailable" : `${fileSize(p.size)} · ${(p.name.split(".").pop() ?? "file").toUpperCase()}`}</span>
      </span>
      <IconDownload size={20} className="shrink-0 text-muted" aria-label="Download" />
    </button>
  );
}

