// Time helpers. The launch city is Durban (Africa/Johannesburg, UTC+2, no DST),
// but everything is stored in UTC and the zone is configurable.

export const CITY_TZ = process.env.NEXT_PUBLIC_CITY_TZ || "Africa/Johannesburg";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Offset of a time zone from UTC in minutes at a given instant (e.g. +120 for SAST). */
export function tzOffsetMinutes(at: Date, tz = CITY_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUTC - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Local calendar fields (in the city zone) of an instant. */
export function localParts(at: Date, tz = CITY_TZ) {
  const local = new Date(at.getTime() + tzOffsetMinutes(at, tz) * 60000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hour: local.getUTCHours(),
  };
}

/** The instant of a local wall-clock time in the city zone. */
export function atLocal(year: number, month: number, day: number, hour: number, minute = 0, tz = CITY_TZ): Date {
  const guess = new Date(Date.UTC(year, month, day, hour, minute));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60000);
}

/** Next occurrence (strictly after `now` + 6h lead time) of a weekday at a local hour. */
export function nextWeekdayAt(now: Date, weekday: number, hour: number, minLeadHours = 6): Date {
  const p = localParts(now);
  for (let add = 0; add < 14; add++) {
    const cand = atLocal(p.year, p.month, p.day + add, hour);
    if (localParts(cand).weekday === weekday && cand.getTime() - now.getTime() >= minLeadHours * 3600000) {
      return cand;
    }
  }
  return atLocal(p.year, p.month, p.day + 7, hour);
}

export function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  return WEEKDAYS.findIndex((d) => d === w || d.slice(0, 3) === w);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: CITY_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatRelative(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const span = abs < 3600000 ? `${Math.max(1, Math.round(abs / 60000))} min` : h < 36 ? `${h} h` : `${d} days`;
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}

/** Value for <input type="datetime-local"> in the city zone. */
export function toLocalInput(iso: string): string {
  const p = new Date(Date.parse(iso) + tzOffsetMinutes(new Date(iso)) * 60000);
  return p.toISOString().slice(0, 16);
}

/** Parse <input type="datetime-local"> (city-zone wall clock) to an instant. */
export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return atLocal(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}
