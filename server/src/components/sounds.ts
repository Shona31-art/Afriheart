"use client";

import { useEffect } from "react";

// Ringtone and ringback made with Web Audio, so there are no sound files to ship.
// Browsers only play sound after the person has interacted with the page; when
// that's not allowed these simply stay silent.

function pattern(ctx: AudioContext, freqs: number[], on: number, gain: number) {
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  const oscs = freqs.map((f) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start();
    return o;
  });
  setTimeout(() => oscs.forEach((o) => o.stop()), on);
}

function useTone(active: boolean, freqs: number[], on: number, every: number, gain: number) {
  const key = freqs.join(",");
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const play = () => {
      if (ctx && ctx.state !== "closed") {
        ctx.resume().catch(() => undefined);
        pattern(ctx, key.split(",").map(Number), on, gain);
      }
    };
    play();
    const t = setInterval(play, every);
    navigator.vibrate?.([400, 200, 400]);
    return () => {
      clearInterval(t);
      ctx?.close().catch(() => undefined);
      navigator.vibrate?.(0);
    };
  }, [active, key, on, every, gain]);
}

/** Incoming call. */
export const useRingtone = (active: boolean) => useTone(active, [523, 659], 900, 2200, 0.08);
/** Caller hears this while the other phone rings (South African style double ring). */
export const useRingback = (active: boolean) => useTone(active, [400, 450], 1200, 3000, 0.05);
