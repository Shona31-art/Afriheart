// Who can see whom in Discover. Pure functions, so the rules are easy to test and reason about.
import type { DatingProfile, Gender, Seeking } from "./types";
import { km } from "./geo";

export const MIN_AGE = 18;
const SEEKS: Record<Gender, Seeking> = { woman: "women", man: "men", nonbinary: "nonbinary" };

export function ageOn(birthdate: string, now: Date): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

export function wants(profile: DatingProfile, gender: Gender): boolean {
  return profile.interested_in.includes(SEEKS[gender]);
}

/** Kilometres between two people, or null if either hasn't set a location. */
export function distanceBetween(a: DatingProfile, b: DatingProfile): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  return km({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

const withinReach = (p: DatingProfile, d: number) => !p.max_km || d <= p.max_km;
const wantsVerified = (p: DatingProfile) => !!p.verified_only && !!p.verified_at;

/**
 * Both people must want each other's gender, fit each other's age range, and be
 * within each other's distance. Someone who asked for verified people only
 * neither sees nor is seen by unverified people. Paused, removed or photo-less
 * profiles never show.
 */
export function compatible(me: DatingProfile, them: DatingProfile, now: Date): boolean {
  if (me.person_id === them.person_id || them.paused || them.photos.length === 0 || them.removed_at || me.removed_at) return false;
  if ((wantsVerified(me) && !them.verified_at) || (wantsVerified(them) && !me.verified_at)) return false;
  const d = distanceBetween(me, them);
  if (d !== null && (!withinReach(me, d) || !withinReach(them, d))) return false;
  const myAge = ageOn(me.birthdate, now);
  const theirAge = ageOn(them.birthdate, now);
  if (myAge < MIN_AGE || theirAge < MIN_AGE) return false;
  return wants(me, them.gender) && wants(them, me.gender)
    && theirAge >= me.age_min && theirAge <= me.age_max
    && myAge >= them.age_min && myAge <= them.age_max;
}

/**
 * Order for Discover: compatibility counts most (up to +5 for 100%), then people
 * who already said yes to you, shared kinds of dates, the same area, and recency.
 */
export function rank(me: DatingProfile, them: DatingProfile, likedMe: boolean, compat: number | null = null): number {
  let score = compat === null ? 2.5 : compat / 20; // unknown counts as average, so answering never hides you

  if (likedMe) score += 4;
  if (me.date_idea_category && me.date_idea_category === them.date_idea_category) score += 2;
  if (me.area && me.area.toLowerCase() === them.area.toLowerCase()) score += 1;
  const d = distanceBetween(me, them);
  if (d !== null) score += 1.5 * Math.max(0, 1 - d / 100); // closer is a little better
  if (them.verified_at) score += 0.5;
  return score + Date.parse(them.updated_at) / 1e13; // tie-break: recently active first
}
