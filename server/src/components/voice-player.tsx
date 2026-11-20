"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mmss } from "@/lib/client";
import { useDataLight } from "@/lib/data-light";

const SPEEDS = [1, 1.5, 2];
const SPEED_KEY = "afriheart:voice-speed";
const BARS = 40;

function savedSpeed() {
  try { const v = Number(localStorage.getItem(SPEED_KEY)); return SPEEDS.includes(v) ? v : 1; } catch { return 1; }
}
const speedListeners = new Set<() => void>();
function setSavedSpeed(v: number) {
  try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* fine */ }
  speedListeners.forEach((fn) => fn());
}
/** The chosen speed is shared by every voice note (and remembered), like WhatsApp. */
function useSpeed() {
  return useSyncExternalStore((fn) => { speedListeners.add(fn); return () => { speedListeners.delete(fn); }; }, savedSpeed, () => 1);
}

/**
 * A voice note: play/pause, a waveform you can tap or drag to jump, 1× / 1.5× / 2×,
 * and when it ends the next voice note in the chat plays by itself.
 */
export function VoicePlayer({ src, ms, wave }: { src: string; ms: number | null; wave?: number[] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { on: light } = useDataLight();
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const speed = useSpeed();
  const [dur, setDur] = useState(ms ?? 0);
  const total = dur || ms || 0;
  const pct = total ? Math.min(1, pos / total) : 0;
  const bars = normalise(wave);

  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed, playing]);
  // "Play the next one": started by the voice note before this one when it ends.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const go = () => audio.current?.play().catch(() => undefined);
    el.addEventListener("voice-play", go);
    return () => el.removeEventListener("voice-play", go);
  }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // Only one voice note plays at a time.
      document.querySelectorAll("audio").forEach((x) => { if (x !== a) x.pause(); });
      a.play().catch(() => undefined);
    } else a.pause();
  }
  function seekTo(fraction: number) {
    const a = audio.current;
    if (!a || !total) return;
    const t = Math.max(0, Math.min(1, fraction)) * (total / 1000);
    a.currentTime = t;
    setPos(t * 1000);
  }
  function fromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - r.left) / r.width);
  }
  function playNext() {
    const all = [...document.querySelectorAll<HTMLElement>("[data-voice]")].filter((x) => x.offsetParent !== null);
    const i = all.indexOf(box.current!);
    if (i >= 0 && all[i + 1]) all[i + 1].dispatchEvent(new Event("voice-play"));
  }

  return (
    <div ref={box} data-voice className="flex w-64 max-w-full items-center gap-2 py-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <button aria-label={playing ? "Pause voice note" : "Play voice note"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" onClick={toggle}>
        {playing
          ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div role="slider" tabIndex={0} aria-label="Voice note position" aria-valuemin={0} aria-valuemax={Math.round(total / 1000)} aria-valuenow={Math.round(pos / 1000)} aria-valuetext={`${mmss(pos)} of ${mmss(total)}`}
          className="flex h-8 cursor-pointer touch-none items-center gap-[2px]" data-waveform
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
          onPointerMove={(e) => { if (e.buttons) fromPointer(e); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); seekTo(pct + 0.05); }
            if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(pct - 0.05); }
          }}>
          {bars.map((h, i) => (
            <span key={i} aria-hidden className={`w-[3px] shrink-0 rounded-full ${i / bars.length < pct ? "bg-accent" : "bg-muted/45"}`} style={{ height: `${Math.max(12, h * 100)}%` }} />
          ))}
        </div>
        <span className="flex items-center justify-between text-[11px] text-muted">
          <span>{mmss(playing || pos ? pos : total)}</span>
        </span>
      </div>
      <button className="h-8 min-w-11 shrink-0 rounded-full bg-black/10 px-2 text-xs font-bold dark:bg-white/15" aria-label={`Playback speed ${speed} times. Tap to change`}
        onClick={() => {
          setSavedSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
        }} data-voice-speed>{speed}×</button>
      <audio ref={audio} src={src} preload={light ? "none" : "metadata"}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d * 1000); }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); playNext(); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)} />
    </div>
  );
}

/** Older voice notes have no waveform: draw a gentle made-up one so they still look like voice. */
function normalise(wave?: number[]): number[] {
  if (wave?.length) {
    const max = Math.max(1, ...wave);
    const out: number[] = [];
    for (let i = 0; i < BARS; i++) out.push(wave[Math.floor((i / BARS) * wave.length)] / max);
    return out;
  }
  return Array.from({ length: BARS }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 1.7)) + 0.15 * Math.abs(Math.sin(i * 0.6)));
}

/** The waveform of a recording, worked out on the phone: 48 bars from 0 to 31. */
export async function waveformOf(blob: Blob): Promise<number[] | undefined> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close().catch(() => undefined);
    const data = buf.getChannelData(0);
    const n = 48;
    const size = Math.floor(data.length / n) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) sum += data[j] * data[j];
      out.push(Math.sqrt(sum / size));
    }
    const max = Math.max(...out) || 1;
    return out.map((v) => Math.round((v / max) * 31));
  } catch {
    return undefined;
  }
}
