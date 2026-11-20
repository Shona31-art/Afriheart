"use client";

import { useEffect, useState } from "react";

// Recently used emojis and stickers, and favourite stickers: kept on this phone only.

export type StickerRef =
  | { kind: "pack"; pack: string; id: string; label: string }
  | { kind: "own"; path: string; key: string; iv: string; mime: string; chatId: string };

const EMOJI_KEY = "afriheart:recent-emoji";
const RECENT_STICKERS = "afriheart:recent-stickers";
const FAV_STICKERS = "afriheart:fav-stickers";
const EVENT = "afriheart:expressions";

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

export const stickerKey = (s: StickerRef) => (s.kind === "pack" ? `${s.pack}/${s.id}` : s.path);

export function useEmojiRecents(): [string[], (e: string) => void] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const load = () => setList(read<string>(EMOJI_KEY));
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, []);
  return [list, (e) => write(EMOJI_KEY, [e, ...read<string>(EMOJI_KEY).filter((x) => x !== e)].slice(0, 24))];
}

export function useStickers() {
  const [recent, setRecent] = useState<StickerRef[]>([]);
  const [favs, setFavs] = useState<StickerRef[]>([]);
  useEffect(() => {
    const load = () => { setRecent(read<StickerRef>(RECENT_STICKERS)); setFavs(read<StickerRef>(FAV_STICKERS)); };
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, []);
  return {
    recent,
    favs,
    used: (s: StickerRef) => write(RECENT_STICKERS, [s, ...read<StickerRef>(RECENT_STICKERS).filter((x) => stickerKey(x) !== stickerKey(s))].slice(0, 16)),
    toggleFav: (s: StickerRef) => {
      const list = read<StickerRef>(FAV_STICKERS);
      const has = list.some((x) => stickerKey(x) === stickerKey(s));
      write(FAV_STICKERS, has ? list.filter((x) => stickerKey(x) !== stickerKey(s)) : [s, ...list].slice(0, 60));
      return !has;
    },
    isFav: (s: StickerRef) => favs.some((x) => stickerKey(x) === stickerKey(s)),
  };
}

/** Only emojis, at most three (shown big, like WhatsApp). */
export function onlyEmoji(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 32) return false;
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(t)].map((s) => s.segment).filter((s) => s.trim()) : [...t];
  return seg.length <= 3 && seg.every((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
}
