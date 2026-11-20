"use client";

import { useSyncExternalStore } from "react";

// Data-light mode: for when data is expensive or the signal is weak. Profile photos load as small
// copies, chat photos wait for a tap, voice notes are recorded smaller, and video calls use less.
// "Auto" turns it on when the phone's own data saver is on. The meter adds up what Afriheart
// itself downloads and sends on this phone, week by week.

export type DataMode = "auto" | "on" | "off";
const KEY = "afriheart:data-light";
const USAGE = "afriheart:data-used";
const listeners = new Set<() => void>();

function read(): DataMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

const phoneSaysSaveData = () =>
  typeof navigator !== "undefined" && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** Whether to save data right now. */
export function dataLightOn(): boolean {
  if (typeof window === "undefined") return false;
  const m = read();
  return m === "on" || (m === "auto" && phoneSaysSaveData());
}

export function setDataMode(m: DataMode) {
  try { localStorage.setItem(KEY, m); } catch { /* private mode: just this visit */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === USAGE) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/** { mode, on } for components; re-renders when it changes (also from another tab). */
export function useDataLight(): { mode: DataMode; on: boolean } {
  const mode = useSyncExternalStore(subscribe, read, () => "auto" as DataMode);
  const on = useSyncExternalStore(subscribe, dataLightOn, () => false);
  return { mode, on };
}

/** A profile photo's address: the small copy in data-light mode. */
export const photoSrc = (path: string, light: boolean) => `/api/dating/photos/${path}${light ? "?size=small" : ""}`;

// ---- The meter ----

/** Monday of this week, as YYYY-MM-DD (weeks start on Monday). */
function weekOf(d = new Date()): string {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

type Usage = { week: string; bytes: number; last: number };
function usage(): Usage {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE) ?? "") as Usage;
    if (u && u.week === weekOf()) return u;
    return { week: weekOf(), bytes: 0, last: u?.week ? u.bytes : 0 };
  } catch {
    return { week: weekOf(), bytes: 0, last: 0 };
  }
}

let pending = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Counts bytes Afriheart used (downloads, uploads, calls). */
export function addDataUsed(bytes: number) {
  if (!(bytes > 0) || typeof window === "undefined") return;
  pending += bytes;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const u = usage();
    u.bytes += pending;
    pending = 0;
    try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  }, 2000);
}

let started = false;
/** Starts counting everything the page downloads (once per page). */
export function startDataMeter() {
  if (started || typeof PerformanceObserver === "undefined") return;
  started = true;
  const count = (list: PerformanceEntryList) => {
    for (const e of list as PerformanceResourceTiming[]) addDataUsed(e.transferSize ?? 0);
  };
  try {
    new PerformanceObserver((l) => count(l.getEntries())).observe({ type: "resource", buffered: true });
    new PerformanceObserver((l) => count(l.getEntries())).observe({ type: "navigation", buffered: true });
  } catch { /* older browsers: no meter */ }
}

const usageSnapshot = () => { const u = usage(); return `${u.bytes}|${u.last}`; };
/** This week's and last week's totals on this phone. */
export function useDataUsed(): { thisWeek: number; lastWeek: number } {
  const s = useSyncExternalStore(subscribe, usageSnapshot, () => "0|0");
  const [a, b] = s.split("|").map(Number);
  return { thisWeek: a, lastWeek: b };
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Smaller video and a bandwidth cap for calls in data-light mode. */
export const LIGHT_VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 } };
export const LIGHT_VIDEO_BITRATE = 200_000;
export const LIGHT_VOICE_BITRATE = 16_000;
