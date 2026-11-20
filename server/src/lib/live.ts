"use client";

import { useEffect, useRef, useState } from "react";

// One realtime connection per phone (Server-Sent Events from /api/events),
// shared by every screen. A nudge says only "this chat (or call) changed";
// screens then fetch the update as usual. When the connection is down, screens
// fall back to quick polling.

/** resync: the connection came back after a gap, so anything may have changed: catch up. */
export interface Nudge { chat: string | null; call: string | null; resync?: boolean }
type Listener = (n: Nudge) => void;

const listeners = new Set<Listener>();
/** "typing…": chat id -> who, and until when to show it. */
const typingListeners = new Set<(chat: string, who: string) => void>();
const liveListeners = new Set<(live: boolean) => void>();
let source: EventSource | null = null;
let live = false;
let users = 0;
let openedBefore = false;

function setLive(v: boolean) {
  if (v === live) return;
  live = v;
  for (const fn of liveListeners) fn(v);
}

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.onopen = () => {
    setLive(true);
    if (openedBefore) for (const fn of listeners) fn({ chat: null, call: null, resync: true });
    openedBefore = true;
  };
  source.addEventListener("nudge", (e) => {
    let n: Nudge = { chat: null, call: null };
    try { n = JSON.parse((e as MessageEvent).data); } catch { /* ignore a broken nudge */ }
    for (const fn of listeners) fn(n);
  });
  source.addEventListener("typing", (e) => {
    try {
      const t = JSON.parse((e as MessageEvent).data) as { chat?: string; who?: string };
      if (t.chat && t.who) for (const fn of typingListeners) fn(t.chat, t.who);
    } catch { /* ignore */ }
  });
  source.onerror = () => {
    setLive(false);
    // Signed out (401) or the server refused: stop, and let polling carry on. Otherwise the browser reconnects by itself.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      setTimeout(() => { if (users > 0) open(); }, 5000);
    }
  };
}

function close() {
  source?.close();
  source = null;
  setLive(false);
}

/** Listen for nudges while this component is on screen. Returns whether the live connection is up. */
export function useLive(onNudge: Listener): boolean {
  const ref = useRef(onNudge);
  useEffect(() => { ref.current = onNudge; });
  const [isLive, setIsLive] = useState(live);
  useEffect(() => {
    const fn: Listener = (n) => ref.current(n);
    listeners.add(fn);
    liveListeners.add(setIsLive);
    users++;
    open();
    return () => {
      listeners.delete(fn);
      liveListeners.delete(setIsLive);
      if (--users === 0) close();
    };
  }, []);
  return isLive;
}

/** How long to wait before the next backup poll. */
export const backupPoll = (isLive: boolean, quick: number) => (isLive ? 30_000 : quick);

/** Who is typing in each chat right now (shown for 6 seconds after each "typing" signal). */
export function useTyping(): Record<string, { who: string; until: number }[]> {
  const [state, setState] = useState<Record<string, { who: string; until: number }[]>>({});
  useLive(() => {});
  useEffect(() => {
    const fn = (chat: string, who: string) => {
      const until = Date.now() + 6000;
      setState((s) => ({ ...s, [chat]: [...(s[chat] ?? []).filter((x) => x.who !== who), { who, until }] }));
    };
    typingListeners.add(fn);
    const t = setInterval(() => {
      const now = Date.now();
      setState((s) => {
        let changed = false;
        const next: typeof s = {};
        for (const [k, v] of Object.entries(s)) {
          const keep = v.filter((x) => x.until > now);
          if (keep.length !== v.length) changed = true;
          if (keep.length) next[k] = keep;
        }
        return changed ? next : s;
      });
    }, 1000);
    return () => { typingListeners.delete(fn); clearInterval(t); };
  }, []);
  return state;
}

