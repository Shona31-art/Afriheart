// Browser-side helpers shared by the chat and call screens.

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" }).catch(() => {
    throw new ApiError("No internet connection. Check your data or Wi-Fi and try again.", 0);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "Couldn't load.", res.status);
  return data as T;
}

export const OFFLINE_MESSAGE = "No internet connection. Check your data or Wi-Fi and try again.";

export async function apiSend<T = unknown>(url: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError(OFFLINE_MESSAGE, 0);
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "Something went wrong.", res.status);
  return data as T;
}

const TZ = process.env.NEXT_PUBLIC_CITY_TZ || "Africa/Johannesburg";

export function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function dayLabel(iso: string, now = new Date()): string {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const day = fmt(new Date(iso));
  if (day === fmt(now)) return "Today";
  if (day === fmt(new Date(now.getTime() - 86400000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

export function listTime(iso: string, now = new Date()): string {
  const label = dayLabel(iso, now);
  if (label === "Today") return clock(iso);
  if (label === "Yesterday") return label;
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
}

export function whenLong(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function initials(name: string): string {
  const parts = name.replace(/^\+/, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// All of these keep white initials at 4.5:1 or better.
// No teal: avatars must stand out on the teal chat header (and look the same everywhere).
// Jewel tones for initials: malachite, oxblood, sapphire, umber, aubergine, deep jade. White text on all of them is 9:1 or more.
const COLORS = ["#0e3b34", "#5a1e25", "#1c3557", "#4a3424", "#3b2340", "#21463f"];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The Android app's bridge (android/…/Bridge.kt). Absent in a normal browser. */
export interface CommonAndroid {
  version(): number;
  fcmToken(): string;
  setBadge(count: number): void;
  inCall(mode: "voice" | "video" | "none"): void;
  setSpeaker(on: boolean): void;
}
export function android(): CommonAndroid | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { CommonAndroid?: CommonAndroid }).CommonAndroid ?? null;
}

/** 27825550101 → "+27 82 555 0101"; other countries: "+<digits>". */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const za = /^27(\d{2})(\d{3})(\d{4})$/.exec(d);
  return za ? `+27 ${za[1]} ${za[2]} ${za[3]}` : `+${d}`;
}
