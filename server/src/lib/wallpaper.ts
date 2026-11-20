"use client";

import { useSyncExternalStore } from "react";

// Chat theme: a wallpaper and a colour for your own bubbles, chosen per chat and kept on this phone.

export const WALLPAPERS = [
  { id: "doodle", label: "Afriheart doodles" },
  { id: "dots", label: "Dots" },
  { id: "plain", label: "Plain" },
  { id: "sand", label: "Sand" },
  { id: "sage", label: "Sage" },
  { id: "sky", label: "Sky" },
  { id: "blush", label: "Blush" },
  { id: "night", label: "Night" },
] as const;
export const BUBBLES = [
  { id: "teal", label: "Teal", swatch: "#d6efe8" },
  { id: "clay", label: "Clay", swatch: "#fbe9e3" },
  { id: "ochre", label: "Ochre", swatch: "#fbecc7" },
  { id: "plum", label: "Plum", swatch: "#efe9f6" },
  { id: "ocean", label: "Ocean", swatch: "#e4eef7" },
] as const;
export type WallpaperId = (typeof WALLPAPERS)[number]["id"];
export type BubbleId = (typeof BUBBLES)[number]["id"];
export interface Theme { wall: WallpaperId; bubbles: BubbleId }

const key = (chatId: string) => `afriheart:theme:${chatId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Theme>();
const DEFAULT: Theme = { wall: "doodle", bubbles: "teal" };

function read(chatId: string): Theme {
  const hit = cache.get(chatId);
  if (hit) return hit;
  let t = DEFAULT;
  try {
    const v = JSON.parse(localStorage.getItem(key(chatId)) ?? "null");
    if (v && WALLPAPERS.some((w) => w.id === v.wall) && BUBBLES.some((b) => b.id === v.bubbles)) t = v;
  } catch { /* none yet */ }
  cache.set(chatId, t);
  return t;
}

export function setTheme(chatId: string, patch: Partial<Theme>) {
  const next = { ...read(chatId), ...patch };
  cache.set(chatId, next);
  try { localStorage.setItem(key(chatId), JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

export function useTheme(chatId: string): Theme {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => read(chatId), () => DEFAULT);
}
