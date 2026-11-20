"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_GROUPS, searchEmoji } from "@/lib/emoji-data";
import { stickerKey, useEmojiRecents, useStickers, type StickerRef } from "@/lib/expressions";
import { apiGet } from "@/lib/client";
import { mediaUrl } from "@/lib/e2e-device";
import { IconSearch, IconStar } from "./icons";

export interface GifResult { id: string; title: string; w: number; h: number; preview: string; full: string; mime: string }
interface Pack { id: string; name: string; stickers: { id: string; label: string }[] }

let packPromise: Promise<Pack> | null = null;
export function loadPack(): Promise<Pack> {
  packPromise ??= fetch("/stickers/pack.json").then((r) => r.json());
  return packPromise;
}

/** Emoji grid with search, recents and categories (the message box, and "any reaction"). */
export function EmojiPicker({ onPick, compact = false }: { onPick: (e: string) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [recents, used] = useEmojiRecents();
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const results = useMemo(() => searchEmoji(q), [q]);
  const pick = (e: string) => { used(e); onPick(e); };
  const btn = "flex h-11 w-11 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-line/40 active:bg-line/60";
  const grid = (list: { e: string; words: string }[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]">
      {list.map((x) => <button key={x.e} type="button" className={btn} onClick={() => pick(x.e)} aria-label={x.words.split(" ").slice(0, 3).join(" ")} title={x.words.split(" ")[0]}>{x.e}</button>)}
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-emoji-picker>
      <div className="flex items-center gap-2 px-2 pb-2">
        <label className="relative flex-1">
          <span className="sr-only">Search emoji</span>
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" className="field py-2 pl-9 text-sm" placeholder="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {!q && !compact && (
        <div className="flex gap-1 overflow-x-auto px-2 pb-1" role="group" aria-label="Emoji categories">
          {EMOJI_GROUPS.map((g) => (
            <button key={g.name} type="button" className="chip min-h-9 shrink-0 text-sm" onClick={() => groupRefs.current[g.name]?.scrollIntoView({ block: "start" })}>{g.emojis[0].e} {g.name}</button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {q ? (
          results.length ? grid(results) : <p className="p-3 text-sm text-muted">No emoji for “{q}”.</p>
        ) : (
          <>
            {recents.length > 0 && (
              <section aria-label="Recently used">
                <h3 className="px-2 pt-1 text-xs font-semibold text-muted">Recent</h3>
                {grid(recents.map((e) => ({ e, words: `recent ${e}` })))}
              </section>
            )}
            {EMOJI_GROUPS.map((g) => (
              <section key={g.name} ref={(el) => { groupRefs.current[g.name] = el; }} aria-label={g.name}>
                <h3 className="px-2 pt-2 text-xs font-semibold text-muted">{g.name}</h3>
                {grid(g.emojis)}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** A sticker image: built-in ones come from the app, your own are decrypted on the phone. */
export function StickerImage({ s, size = 128, alt }: { s: StickerRef; size?: number; alt?: string }) {
  const [url, setUrl] = useState<string | null>(s.kind === "pack" ? `/stickers/${s.id}.svg` : null);
  useEffect(() => {
    if (s.kind !== "own") return;
    let live = true;
    mediaUrl(s.path, s.key, s.iv, s.mime).then((u) => live && setUrl(u), () => undefined);
    return () => { live = false; };
  }, [s]);
  const label = alt ?? (s.kind === "pack" ? `Sticker: ${s.label}` : "Sticker");
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={label} width={size} height={size} className="object-contain" draggable={false} style={{ width: size, height: size }} />
    : <span role="img" aria-label={label} className="inline-block animate-pulse rounded-2xl bg-line/50" style={{ width: size, height: size }} />;
}

function StickerTab({ onSticker, onMake }: { onSticker: (s: StickerRef) => void; onMake: () => void }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const { recent, favs } = useStickers();
  useEffect(() => { loadPack().then(setPack).catch(() => undefined); }, []);
  const cell = "flex aspect-square items-center justify-center rounded-xl p-1 hover:bg-line/40 active:bg-line/60";
  const grid = (list: StickerRef[]) => (
    <div className="grid grid-cols-4 gap-1 px-1">
      {list.map((s) => <button key={stickerKey(s)} type="button" className={cell} onClick={() => onSticker(s)} aria-label={s.kind === "pack" ? `Send sticker: ${s.label}` : "Send your sticker"}><StickerImage s={s} size={72} alt="" /></button>)}
    </div>
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2" data-sticker-picker>
      <div className="flex items-center justify-between px-2 pb-2">
        <p className="text-xs text-muted">Tap a sticker to send it.</p>
        <button type="button" className="chip min-h-9" onClick={onMake}>+ Make a sticker</button>
      </div>
      {favs.length > 0 && <section aria-label="Favourite stickers"><h3 className="flex items-center gap-1 px-2 text-xs font-semibold text-muted"><IconStar size={12} /> Favourites</h3>{grid(favs)}</section>}
      {recent.length > 0 && <section aria-label="Recent stickers"><h3 className="px-2 pt-2 text-xs font-semibold text-muted">Recent</h3>{grid(recent)}</section>}
      {pack && (
        <section aria-label={`${pack.name} stickers`}>
          <h3 className="px-2 pt-2 text-xs font-semibold text-muted">{pack.name}</h3>
          {grid(pack.stickers.map((x) => ({ kind: "pack", pack: pack.id, id: x.id, label: x.label })))}
        </section>
      )}
    </div>
  );
}

function GifTab({ onGif }: { onGif: (g: GifResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      apiGet<GifResult[]>(`/api/gifs?q=${encodeURIComponent(q.trim())}`).then((r) => { if (live) { setResults(r); setError(null); } }, (e) => live && setError((e as Error).message));
    }, q ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-gif-picker>
      <label className="relative px-2 pb-2">
        <span className="sr-only">Search GIFs</span>
        <IconSearch size={16} className="pointer-events-none absolute left-5 top-1/2 -translate-y-[60%] text-muted" />
        <input type="search" className="field py-2 pl-9 text-sm" placeholder="Search GIPHY" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {error && <p role="alert" className="p-2 text-sm text-danger">{error}</p>}
        {!results && !error && <p className="p-2 text-sm text-muted">Loading GIFs…</p>}
        {results?.length === 0 && <p className="p-2 text-sm text-muted">No GIFs for “{q}”.</p>}
        <div className="columns-2 gap-1">
          {results?.map((g) => (
            <button key={g.id} type="button" className="mb-1 block w-full overflow-hidden rounded-lg bg-line/40" onClick={() => onGif(g)} aria-label={`Send GIF: ${g.title || "GIF"}`}>
              {g.mime.startsWith("video/")
                ? <video src={g.preview} autoPlay loop muted playsInline className="block w-full" style={{ aspectRatio: `${g.w} / ${g.h}` }} />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={g.preview} alt="" className="block w-full" style={{ aspectRatio: `${g.w} / ${g.h}` }} />}
            </button>
          ))}
        </div>
      </div>
      <p className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[11px] text-muted">
        <span>Searches go to GIPHY through Afriheart. GIFs you send are end-to-end encrypted.</span>
        <span className="shrink-0 font-bold tracking-wide">Powered by GIPHY</span>
      </p>
    </div>
  );
}

/** The panel that opens from the smiley button: Emoji, Stickers and (when switched on) GIFs. */
export function ExpressionPanel({ onEmoji, onSticker, onGif, onMakeSticker }: {
  onEmoji: (e: string) => void; onSticker: (s: StickerRef) => void; onGif: (g: GifResult) => void; onMakeSticker: () => void;
}) {
  const [tab, setTab] = useState<"emoji" | "stickers" | "gifs">("emoji");
  const [gifs, setGifs] = useState(false);
  useEffect(() => { apiGet<{ enabled: boolean }>("/api/gifs?config=1").then((r) => setGifs(r.enabled)).catch(() => undefined); }, []);
  const tabBtn = (t: typeof tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} id={`expr-${t}`} aria-controls="expr-panel"
      className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${tab === t ? "bg-accent-soft text-accent" : "text-muted"}`} onClick={() => setTab(t)}>{label}</button>
  );
  return (
    <div className="mb-2 flex h-[min(22rem,45dvh)] flex-col rounded-2xl border border-line bg-card pt-2 shadow-sm" data-expression-panel>
      <div role="tablist" aria-label="Emoji, stickers and GIFs" className="mx-2 mb-2 flex gap-1 rounded-full bg-paper p-1">
        {tabBtn("emoji", "Emoji")}
        {tabBtn("stickers", "Stickers")}
        {gifs && tabBtn("gifs", "GIFs")}
      </div>
      <div id="expr-panel" role="tabpanel" aria-labelledby={`expr-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "emoji" && <EmojiPicker onPick={onEmoji} />}
        {tab === "stickers" && <StickerTab onSticker={onSticker} onMake={onMakeSticker} />}
        {tab === "gifs" && gifs && <GifTab onGif={onGif} />}
      </div>
    </div>
  );
}

/** Turns a photo into a sticker: a square cut from the middle with round corners, 512×512, transparent around it. */
export async function photoToSticker(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const pad = 16;
  const r = 96;
  const s = 512 - pad * 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, s, s, r);
  ctx.save();
  ctx.clip();
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, pad, pad, s, s);
  ctx.restore();
  // A white edge, like a cut-out sticker.
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(pad, pad, s, s, r);
  ctx.stroke();
  const type = "image/webp";
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), type, 0.85));
}
