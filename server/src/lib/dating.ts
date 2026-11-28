import "server-only";
import { randomUUID } from "node:crypto";
import { getStore, type CandidateFilter } from "./store";
import { DomainError, createPlanFromSpark } from "./domain";
import { postMessage, stamp } from "./chat";
import { detectCategory } from "./companion/offline";
import { MIN_AGE, ageOn, compatible, distanceBetween, rank } from "./matching";
import { cleanMaxKm, cleanPoint, distanceLabel } from "./geo";
import { deleteOwnedMedia } from "./media";
import { MAX_ANSWER, MAX_COMMENT, MAX_PROMPTS, MAX_VOICE_MS, PROMPTS, promptText } from "./prompts";
import type { DatingProfile, Gender, Match, Report, Seeking, Swipe } from "./types";
import { cleanAnswer, compatibility, type Compatibility } from "./compatibility";

const GENDERS: Gender[] = ["woman", "man", "nonbinary"];
const SEEKING: Seeking[] = ["women", "men", "nonbinary"];
const REASONS: Report["reason"][] = ["fake", "scam", "harassment", "underage", "inappropriate", "safety", "other"];
export const MAX_PHOTOS = 6;

export interface ProfileInput {
  display_name: string;
  birthdate: string;
  gender: string;
  interested_in: string[];
  age_min: number;
  age_max: number;
  area: string;
  bio: string;
  photos: string[];
  date_idea: string;
  paused: boolean;
  consent: boolean;
  prompts?: unknown;
  voice?: unknown;
  lat?: unknown;
  lng?: unknown;
  max_km?: unknown;
  verified_only?: boolean;
}

export async function getProfile(personId: string): Promise<DatingProfile | null> {
  return getStore().get("dating_profiles", personId);
}

export async function saveProfile(personId: string, input: ProfileInput): Promise<DatingProfile> {
  const now = new Date();
  const name = input.display_name.trim().slice(0, 40);
  if (!name) throw new DomainError("Add the first name people will see.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthdate) || Number.isNaN(Date.parse(input.birthdate))) throw new DomainError("Add your date of birth.");
  const age = ageOn(input.birthdate, now);
  if (age < MIN_AGE) throw new DomainError("You must be 18 or older to use Afriheart.");
  if (age > 100) throw new DomainError("Check your date of birth.");
  if (!GENDERS.includes(input.gender as Gender)) throw new DomainError("Choose how you identify.");
  const interested = [...new Set(input.interested_in)].filter((s): s is Seeking => SEEKING.includes(s as Seeking));
  if (!interested.length) throw new DomainError("Choose who you'd like to meet.");
  const min = Math.max(MIN_AGE, Math.round(input.age_min) || MIN_AGE);
  const max = Math.min(100, Math.round(input.age_max) || 99);
  if (min > max) throw new DomainError("The youngest age can't be more than the oldest.");
  const existingEarly = await getProfile(personId);
  const wanted = input.photos.filter((p) => /^profiles\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(p)).slice(0, MAX_PHOTOS);
  // Only photos you uploaded yourself (or already had) can go on your profile.
  const owned = new Set((await getStore().listIn("media_files", "id", wanted)).filter((f) => f.owner_id === personId).map((f) => f.id));
  const photos = wanted.filter((p) => owned.has(p) || existingEarly?.photos.includes(p));
  if (!photos.length) throw new DomainError("Add at least one photo of yourself.");
  const idea = input.date_idea.trim().slice(0, 120);
  if (idea.length < 4) throw new DomainError("Add a date you'd like to go on, e.g. \"Sunrise walk at Umhlanga on Saturday\".");
  const existing = existingEarly;
  if (!existing && !input.consent) throw new DomainError("Please agree to how Afriheart uses your dating details.");
  const row: DatingProfile = {
    id: personId, person_id: personId, display_name: name, birthdate: input.birthdate, gender: input.gender as Gender,
    interested_in: interested, age_min: min, age_max: max, area: input.area.trim().slice(0, 40), bio: input.bio.trim().slice(0, 300),
    photos, date_idea: idea, date_idea_category: detectCategory(idea), paused: !!input.paused, answers: existing?.answers ?? {},
    ...locationFields(input, existing),
    prompts: cleanPrompts(input.prompts, existing),
    ...(await voiceFields(personId, input.voice, existing)),
    // A new photo means the selfie check no longer covers every photo, so the badge goes until you verify again.
    ...(() => {
      const newPhoto = !!existing && photos.some((p) => !existing.photos.includes(p));
      const verified = newPhoto ? null : existing?.verified_at ?? null;
      return { max_km: cleanMaxKm(input.max_km), verified_at: verified, verified_only: !!input.verified_only && !!verified };
    })(),
    removed_at: existing?.removed_at ?? null,
    consent_at: existing?.consent_at ?? now.toISOString(), created_at: existing?.created_at ?? now.toISOString(), updated_at: now.toISOString(),
  };
  const store = getStore();
  const saved = existing ? await store.update("dating_profiles", personId, row) : await store.insert("dating_profiles", row);
  // Photos taken off the profile are deleted from storage.
  for (const old of existing?.photos ?? []) if (!photos.includes(old)) await deleteOwnedMedia(old).catch(() => undefined);
  // A finished profile (with a photo) starts the free week of Afriheart+, once per phone number.
  if (photos.length > 0) {
    const { startTrial } = await import("./plus");
    await startTrial(personId).catch(() => false);
  }
  return saved;
}

/** Up to three prompts, each answered once. Not sent = keep the old ones. */
function cleanPrompts(raw: unknown, existing: DatingProfile | null): { id: string; answer: string }[] {
  if (raw === undefined) return existing?.prompts ?? [];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { id: string; answer: string }[] = [];
  for (const r of raw as { id?: unknown; answer?: unknown }[]) {
    const id = String(r?.id ?? "");
    const answer = String(r?.answer ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER);
    if (!PROMPTS.some((p) => p.id === id) || seen.has(id) || answer.length < 2) continue;
    seen.add(id);
    out.push({ id, answer });
  }
  return out.slice(0, MAX_PROMPTS);
}

/** The voice prompt: a recording you uploaded, answering one prompt. Not sent = keep; null = remove. */
async function voiceFields(personId: string, raw: unknown, existing: DatingProfile | null) {
  const keep = { voice_path: existing?.voice_path ?? null, voice_ms: existing?.voice_ms ?? null, voice_prompt: existing?.voice_prompt ?? null };
  if (raw === undefined) return keep;
  const none = { voice_path: null, voice_ms: null, voice_prompt: null };
  if (raw === null) {
    if (existing?.voice_path) await deleteOwnedMedia(existing.voice_path).catch(() => undefined);
    return none;
  }
  const v = raw as { path?: unknown; ms?: unknown; prompt?: unknown };
  const path = String(v.path ?? "");
  if (path === existing?.voice_path) return { ...keep, voice_prompt: PROMPTS.some((p) => p.id === v.prompt) ? String(v.prompt) : keep.voice_prompt };
  const file = await getStore().get("media_files", path);
  if (!file || file.owner_id !== personId || !/^profiles\/[a-f0-9]{24}\.(webm|ogg|m4a|mp3|aac)$/.test(path)) throw new DomainError("That voice recording didn't upload. Try again.");
  if (!PROMPTS.some((p) => p.id === v.prompt)) throw new DomainError("Choose which prompt your voice note answers.");
  if (existing?.voice_path) await deleteOwnedMedia(existing.voice_path).catch(() => undefined);
  return { voice_path: path, voice_ms: Math.min(MAX_VOICE_MS, Math.max(0, Math.round(Number(v.ms) || 0))), voice_prompt: String(v.prompt) };
}

/** A new location if one was sent; otherwise keep the old one. Sending lat: null clears it. */
function locationFields(input: ProfileInput, existing: DatingProfile | null): { lat: number | null; lng: number | null } {
  if (input.lat === undefined) return { lat: existing?.lat ?? null, lng: existing?.lng ?? null };
  const p = cleanPoint(input.lat, input.lng);
  if (!p && input.lat !== null) throw new DomainError("That location didn't work. Try again or choose your city.");
  return { lat: p?.lat ?? null, lng: p?.lng ?? null };
}

/** Deleting the dating profile removes photos from Discover, the profile, and all likes. Matches' chats stay. */
export async function deleteProfile(personId: string) {
  const store = getStore();
  if (await getProfile(personId)) await store.remove("dating_profiles", personId);
  for (const s of await store.list("swipes", { from_id: personId })) await store.remove("swipes", s.id);
}

async function blockedIds(personId: string): Promise<Set<string>> {
  const store = getStore();
  const [mine, theirs] = await Promise.all([store.list("blocks", { blocker: personId }), store.list("blocks", { blocked: personId })]);
  return new Set([...mine.map((b) => b.blocked), ...theirs.map((b) => b.blocker)]);
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  return (await blockedIds(a)).has(b);
}

export interface Card {
  id: string;
  name: string;
  age: number;
  area: string;
  bio: string;
  photos: string[];
  date_idea: string;
  compat: Compatibility;
  verified: boolean;
  prompts: { id: string; text: string; answer: string }[];
  voice: { path: string; ms: number | null; prompt: string } | null;
  /** If they already liked you: what they liked and what they said. */
  liked_you: { label: string; comment: string | null } | null;
  /** Today's most compatible: one a day, the highest match % among people you haven't answered. */
  daily_pick?: boolean;
  /** A rough band like "Less than 5 km away", never the real distance. */
  distance: string | null;
  /** What friends say (approved by the person, first names only). */
  vouches?: { friend: string; relation: string; text: string }[];
}

/** Adds approved friend vouches to profile cards. */
async function withVouches<T extends Card | null>(cards: T[]): Promise<T[]> {
  const { shownVouches } = await import("./vouch");
  for (const c of cards) if (c) c.vouches = await shownVouches(c.id);
  return cards;
}

const card = (p: DatingProfile, now: Date, me: DatingProfile | null, theirLike: Swipe | null = null): Card => ({
  id: p.person_id, name: p.display_name, age: ageOn(p.birthdate, now), area: p.area, bio: p.bio, photos: p.photos, date_idea: p.date_idea,
  compat: compatibility(me?.answers, p.answers), verified: !!p.verified_at, distance: me ? distanceLabel(distanceBetween(me, p)) : null,
  prompts: (p.prompts ?? []).map((x) => ({ id: x.id, text: promptText(x.id), answer: x.answer })),
  voice: p.voice_path ? { path: p.voice_path, ms: p.voice_ms ?? null, prompt: promptText(p.voice_prompt ?? "") } : null,
  liked_you: theirLike && me ? { label: targetLabel(theirLike), comment: theirLike.comment ?? null } : null,
});

/** "your photo", "your prompt "My ideal Sunday"", "your voice prompt", "your date idea" or "your profile". */
function targetLabel(s: Swipe): string {
  if (s.action === "date") return "your date idea";
  const t = s.target ?? "";
  if (t.startsWith("photo:")) return "your photo";
  if (t.startsWith("prompt:")) return `your answer to "${promptText(t.slice(7))}"`;
  if (t === "voice") return "your voice prompt";
  return "your profile";
}

/** Save one compatibility answer. */
export async function saveAnswer(personId: string, qid: string, raw: { a?: unknown; ok?: unknown; imp?: unknown }) {
  const me = await getProfile(personId);
  if (!me) throw new DomainError("Create your profile first.");
  const answer = cleanAnswer(qid, raw);
  if (!answer) throw new DomainError("Choose an answer.");
  await getStore().update("dating_profiles", personId, { answers: { ...(me.answers ?? {}), [qid]: answer }, updated_at: new Date().toISOString() });
}

export async function clearAnswer(personId: string, qid: string) {
  const me = await getProfile(personId);
  if (!me) return;
  const answers = { ...(me.answers ?? {}) };
  delete answers[qid];
  await getStore().update("dating_profiles", personId, { answers });
}

const GENDER_OF: Record<Seeking, Gender> = { women: "woman", men: "man", nonbinary: "nonbinary" };
const yearsBefore = (d: Date, years: number) => new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);

/** Narrows Discover in the database: genders I want, my age range, and a box around my distance. */
function candidateFilter(me: DatingProfile, now: Date): CandidateFilter {
  let box: CandidateFilter["box"] = null;
  if (me.lat != null && me.lng != null && me.max_km) {
    const dLat = me.max_km / 111;
    const dLng = me.max_km / (111 * Math.max(0.1, Math.cos((me.lat * Math.PI) / 180)));
    box = { minLat: me.lat - dLat, maxLat: me.lat + dLat, minLng: me.lng - dLng, maxLng: me.lng + dLng };
  }
  return { genders: me.interested_in.map((s) => GENDER_OF[s]), bornAfter: yearsBefore(now, me.age_max + 1), bornBefore: yearsBefore(now, me.age_min), box };
}

/** The next people to show. Never: yourself, people you've already answered, matches, or anyone blocked either way. */
export async function discover(personId: string, limit = 10): Promise<Card[]> {
  const me = await getProfile(personId);
  if (!me) throw new DomainError("Create your profile first.");
  if (me.removed_at) throw new DomainError("Your dating profile was removed after a safety review. If you think this is a mistake, contact the Afriheart team.");
  const store = getStore();
  const now = new Date();
  const [mySwipes, toMe, blocked] = await Promise.all([store.list("swipes", { from_id: personId }), store.list("swipes", { to_id: personId }), blockedIds(personId)]);
  const seen = new Set(mySwipes.map((s) => s.to_id));
  const likedMe = new Set(toMe.filter((s) => s.action !== "pass").map((s) => s.from_id));
  const likeFrom = new Map(toMe.filter((s) => s.action !== "pass").map((s) => [s.from_id, s]));
  // Read candidates a page at a time until there are enough to rank well.
  const filter = candidateFilter(me, now);
  const eligible: DatingProfile[] = [];
  for (let page = 0; page < 20 && eligible.length < 200; page++) {
    const rows = await store.candidates(filter, page, 500);
    eligible.push(...rows.filter((p) => !seen.has(p.person_id) && !blocked.has(p.person_id) && compatible(me, p, now)));
    if (rows.length < 500) break;
  }
  const ranked = eligible
    .map((p) => ({ p, c: card(p, now, me, likeFrom.get(p.person_id) ?? null) }))
    .sort((x, y) => rank(me, y.p, likedMe.has(y.p.person_id), y.c.compat.score) - rank(me, x.p, likedMe.has(x.p.person_id), x.c.compat.score));
  // Today's most compatible goes first, marked. It's chosen once a day and doesn't change if you pass.
  const pickId = await dailyPick(personId, ranked.map((x) => x.c));
  const pick = ranked.findIndex((x) => x.c.id === pickId);
  if (pick > 0) ranked.unshift(...ranked.splice(pick, 1));
  if (pick >= 0) ranked[0].c.daily_pick = true;
  // Afriheart+ boosts: boosted people come next, straight after today's pick.
  const nowIso = now.toISOString();
  const head = pick >= 0 ? 1 : 0;
  const rest = ranked.slice(head);
  const boosted = rest.filter((x) => x.p.boosted_until && x.p.boosted_until > nowIso);
  if (boosted.length) ranked.splice(head, rest.length, ...boosted, ...rest.filter((x) => !boosted.includes(x)));
  return withVouches(ranked.slice(0, limit).map((x) => x.c));
}

const PICK_MIN = 60; // a pick should be a genuinely strong match

async function dailyPick(personId: string, cards: Card[]): Promise<string | null> {
  const store = getStore();
  const date = new Date().toISOString().slice(0, 10);
  const id = `${personId}:${date}`;
  const existing = await store.get("daily_picks", id);
  if (existing) return existing.pick_id;
  const best = cards.filter((c) => (c.compat.score ?? 0) >= PICK_MIN).sort((a, b) => (b.compat.score ?? 0) - (a.compat.score ?? 0))[0];
  if (!best) return null; // try again later today, when more people have answered
  await store.insert("daily_picks", { id, person_id: personId, pick_id: best.id, date }).catch(() => undefined);
  return best.id;
}

/** Can this person see that profile at all? (Used before showing a photo or acting on it.) */
async function visibleTo(personId: string, otherId: string): Promise<DatingProfile> {
  const [me, them] = await Promise.all([getProfile(personId), getProfile(otherId)]);
  if (!me || !them || (await isBlockedBetween(personId, otherId)) || !compatible(me, them, new Date())) {
    throw new DomainError("That profile isn't available.");
  }
  return them;
}

/**
 * Like, pass, or say yes to someone's date idea. A match happens when both
 * people say like or yes: it opens a private chat, and if either said yes to a
 * date, the companion drafts that date as a plan in the chat.
 */
export async function swipe(personId: string, otherId: string, action: "like" | "pass" | "date", rawTarget?: string, rawComment?: string): Promise<{ match: { chat_id: string; name: string } | null }> {
  if (!["like", "pass", "date"].includes(action)) throw new DomainError("Unknown answer.");
  const them = await visibleTo(personId, otherId);
  const store = getStore();
  const [already] = await store.list("swipes", { from_id: personId, to_id: otherId });
  if (already) return { match: null };
  // Liking one part of their profile, with an optional comment.
  let target: string | null = null;
  const t = String(rawTarget ?? "");
  if (action === "like" && t) {
    const ok = (t.startsWith("photo:") && them.photos.includes(t.slice(6))) || (t.startsWith("prompt:") && (them.prompts ?? []).some((p) => p.id === t.slice(7))) || (t === "voice" && !!them.voice_path);
    if (!ok) throw new DomainError("That part of their profile changed. Try again.");
    target = t;
  }
  const comment = action === "pass" ? null : String(rawComment ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT) || null;
  await store.insert("swipes", { id: randomUUID(), from_id: personId, to_id: otherId, action, target, comment, created_at: stamp() });
  if (action === "pass") return { match: null };
  const [back] = (await store.list("swipes", { from_id: otherId, to_id: personId })).filter((s) => s.action !== "pass");
  if (!back) return { match: null };
  const me = (await getProfile(personId))!;
  const mine = (await store.list("swipes", { from_id: personId, to_id: otherId }))[0];
  const m = await createMatch(me, them, action, back.action, [mine, back]);
  return { match: { chat_id: m.chat_id, name: them.display_name } };
}

async function createMatch(me: DatingProfile, them: DatingProfile, mine: "like" | "date", theirs: "like" | "pass" | "date", likes: (Swipe | undefined)[] = []): Promise<Match> {
  const store = getStore();
  const at = stamp();
  const chat = await store.insert("chats", { id: randomUUID(), kind: "direct", origin: "match", name: null, created_by: me.person_id, created_at: at, last_message_at: at });
  for (const pid of [me.person_id, them.person_id]) {
    await store.insert("chat_members", { id: randomUUID(), chat_id: chat.id, person_id: pid, role: "admin", last_read_at: null, last_delivered_at: null, joined_at: at });
  }
  const via = mine === "date" || theirs === "date" ? "date" : "like";
  const match = await store.insert("matches", { id: randomUUID(), a: me.person_id, b: them.person_id, chat_id: chat.id, via, created_at: at, ended_at: null, ended_by: null });
  await postMessage(chat.id, null, "system", `You matched with each other. Say hi! Your phone numbers stay private.`);
  // What each of you liked, and any comment, opens the chat (oldest first).
  const names = new Map([[me.person_id, me.display_name], [them.person_id, them.display_name]]);
  const profiles = new Map([[me.person_id, me], [them.person_id, them]]);
  for (const s of likes.filter((x): x is Swipe => !!x).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!s.comment && !s.target) continue;
    const liked = profiles.get(s.to_id)!;
    const label = targetLabel(s).replace(/^your /, `${names.get(s.to_id)}'s `);
    const quote = s.target?.startsWith("prompt:") ? (liked.prompts ?? []).find((p) => p.id === s.target!.slice(7))?.answer ?? null : null;
    await postMessage(chat.id, s.from_id, "like", JSON.stringify({ by: names.get(s.from_id), label, quote, comment: s.comment ?? null }));
  }
  if (via === "date") {
    // The accepted idea: theirs if I said yes to their date, otherwise mine (they said yes to it).
    const idea = mine === "date" ? them : me;
    const plan = await createPlanFromSpark(idea.person_id, idea.date_idea, null, chat.id);
    await postMessage(chat.id, null, "plan", plan.title, { plan_id: plan.id });
    await postMessage(chat.id, null, "companion", `You both said yes to "${idea.date_idea}". ${idea.display_name.split(" ")[0]}, pick the option that suits you and open voting. Meet somewhere public for a first date, and use "Share date details" to tell a friend where you'll be.`);
  }
  return match;
}

export interface MatchSummary { id: string; chat_id: string; other_id: string; name: string; photo: string | null; via: Match["via"]; created_at: string }

export async function listMatches(personId: string): Promise<MatchSummary[]> {
  const store = getStore();
  const rows = [...(await store.list("matches", { a: personId })), ...(await store.list("matches", { b: personId }))].filter((m) => !m.ended_at);
  const out: MatchSummary[] = [];
  for (const m of rows.sort((x, y) => y.created_at.localeCompare(x.created_at))) {
    const other = m.a === personId ? m.b : m.a;
    const p = await getProfile(other);
    out.push({ id: m.id, chat_id: m.chat_id, other_id: other, name: p?.display_name ?? "Someone", photo: p?.photos[0] ?? null, via: m.via, created_at: m.created_at });
  }
  return out;
}

export async function matchForChat(chatId: string, personId: string) {
  const [m] = (await getStore().list("matches", { chat_id: chatId })).filter((x) => x.a === personId || x.b === personId);
  return m ?? null;
}

/** Unmatch: the chat disappears for both people and they won't see each other again. */
export async function unmatch(personId: string, chatId: string) {
  const m = await matchForChat(chatId, personId);
  if (!m) throw new DomainError("That match isn't available.");
  const store = getStore();
  if (!m.ended_at) await store.update("matches", m.id, { ended_at: stamp(), ended_by: personId });
  for (const member of await store.list("chat_members", { chat_id: chatId })) await store.remove("chat_members", member.id);
  for (const s of await store.list("swipes", { from_id: personId, to_id: m.a === personId ? m.b : m.a })) {
    await store.update("swipes", s.id, { action: "pass" });
  }
}

export async function block(personId: string, otherId: string) {
  if (personId === otherId) throw new DomainError("You can't block yourself.");
  const store = getStore();
  if (!(await store.list("blocks", { blocker: personId, blocked: otherId })).length) {
    await store.insert("blocks", { id: randomUUID(), blocker: personId, blocked: otherId, created_at: stamp() });
  }
  // End any match and remove shared one-to-one chats.
  const ms = [...(await store.list("matches", { a: personId, b: otherId })), ...(await store.list("matches", { a: otherId, b: personId }))];
  for (const m of ms) await unmatch(personId, m.chat_id).catch(() => undefined);
}

/** Reports go to the Afriheart team; reporting also blocks the person straight away. */
export async function report(personId: string, otherId: string, reason: string, details: string) {
  if (!REASONS.includes(reason as Report["reason"])) throw new DomainError("Choose a reason.");
  const store = getStore();
  if (!(await store.get("people", otherId))) throw new DomainError("That person isn't available.");
  await store.insert("reports", {
    id: randomUUID(), reporter: personId, reported: otherId, reason: reason as Report["reason"], details: details.trim().slice(0, 1000), created_at: stamp(), status: "open",
  });
  await block(personId, otherId);
}

/** A match's profile, for the chat's info screen (never their phone number). */
export async function matchProfile(chatId: string, personId: string): Promise<Card | null> {
  const m = await matchForChat(chatId, personId);
  if (!m || m.ended_at) return null;
  const p = await getProfile(m.a === personId ? m.b : m.a);
  return p ? (await withVouches([card(p, new Date(), await getProfile(personId))]))[0] : null;
}

/** Profile photos are visible to signed-in people who could see that profile, and to its owner and matches. */
export async function canSeePhoto(personId: string, path: string): Promise<boolean> {
  const store = getStore();
  const [owner] = path.match(/\.(webm|ogg|m4a|mp3|aac)$/)
    ? await store.list("dating_profiles", { voice_path: path })
    : await store.listContaining("dating_profiles", "photos", path);
  if (!owner) return false;
  if (owner.person_id === personId) return true;
  const { isTeam } = await import("./team");
  if (await isTeam(personId)) return true; // the team checks photos against selfies and reports
  if (await isBlockedBetween(personId, owner.person_id)) return false;
  const ms = [...(await store.list("matches", { a: personId, b: owner.person_id })), ...(await store.list("matches", { a: owner.person_id, b: personId }))];
  if (ms.some((m) => !m.ended_at)) return true;
  const { duoCanSeePhoto } = await import("./double");
  if (await duoCanSeePhoto(personId, owner.person_id)) return true;
  const me = await getProfile(personId);
  return !!me && compatible(me, owner, new Date());
}

/**
 * Ends every active match of someone leaving dating (removed by the team, or
 * deleting their account): they leave those chats, and the other person sees
 * why and can't be messaged or called by them any more.
 */
export async function endMatchesFor(personId: string, endedBy: string, note: string) {
  const store = getStore();
  const mine = [...(await store.list("matches", { a: personId })), ...(await store.list("matches", { b: personId }))];
  for (const m of mine.filter((x) => !x.ended_at)) {
    await store.update("matches", m.id, { ended_at: stamp(), ended_by: endedBy });
    for (const member of await store.list("chat_members", { chat_id: m.chat_id, person_id: personId })) await store.remove("chat_members", member.id);
    await postMessage(m.chat_id, null, "system", note);
  }
}

/**
 * People who already like you (and you haven't answered yet), newest first. Everyone sees how
 * many; with Afriheart+ you see who, and liking back matches you straight away.
 */
export async function likesYou(personId: string): Promise<{ count: number; plus: boolean; cards: Card[] }> {
  const me = await getProfile(personId);
  if (!me) throw new DomainError("Create your profile first.");
  const store = getStore();
  const now = new Date();
  const [mySwipes, toMe, blocked] = await Promise.all([store.list("swipes", { from_id: personId }), store.list("swipes", { to_id: personId }), blockedIds(personId)]);
  const answered = new Set(mySwipes.map((s) => s.to_id));
  const likes = toMe.filter((s) => s.action !== "pass" && !answered.has(s.from_id) && !blocked.has(s.from_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const found: { p: DatingProfile; s: Swipe }[] = [];
  for (const s of likes) {
    const p = await getProfile(s.from_id);
    if (p && !p.removed_at && !p.paused && compatible(me, p, now)) found.push({ p, s });
  }
  const { hasPlus } = await import("./plus");
  const plus = await hasPlus(personId);
  return { count: found.length, plus, cards: plus ? await withVouches(found.map(({ p, s }) => card(p, now, me, s))) : [] };
}


// ---------------- Afriheart+: boost and undo ----------------

export const BOOST_MINUTES = 30;
export const BOOST_EVERY_HOURS = 24;

export interface BoostState {
  plus: boolean;
  /** Boosted now: until when. */
  active_until: string | null;
  /** Used today: when the next boost is ready. */
  next_at: string | null;
}

export async function boostState(personId: string): Promise<BoostState> {
  const { hasPlus } = await import("./plus");
  const [plus, me] = await Promise.all([hasPlus(personId), getProfile(personId)]);
  const now = Date.now();
  const until = me?.boosted_until ? Date.parse(me.boosted_until) : 0;
  const started = until - BOOST_MINUTES * 60_000;
  const next = started + BOOST_EVERY_HOURS * 3600_000;
  return {
    plus,
    active_until: until > now ? new Date(until).toISOString() : null,
    next_at: until && next > now && until <= now ? new Date(next).toISOString() : null,
  };
}

/** Afriheart+: show my profile first to people near me for 30 minutes, once a day. */
export async function startBoost(personId: string): Promise<BoostState> {
  const state = await boostState(personId);
  if (!state.plus) throw new DomainError("Boost is part of Afriheart+.");
  if (state.active_until) return state;
  if (state.next_at) throw new DomainError("You've used today's boost. The next one is ready tomorrow.");
  const me = await getProfile(personId);
  if (!me) throw new DomainError("Create your profile first.");
  if (me.paused) throw new DomainError("Unpause your profile first, so people can see you.");
  if (me.removed_at) throw new DomainError("Your dating profile isn't showing to anyone right now.");
  const until = new Date(Date.now() + BOOST_MINUTES * 60_000).toISOString();
  await getStore().update("dating_profiles", personId, { boosted_until: until });
  return { plus: true, active_until: until, next_at: null };
}

/** Afriheart+: bring back the last person I passed on (within a day). */
export async function undoPass(personId: string): Promise<Card> {
  const { hasPlus } = await import("./plus");
  if (!(await hasPlus(personId))) throw new DomainError("Undo is part of Afriheart+.");
  const store = getStore();
  const mine = (await store.list("swipes", { from_id: personId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last = mine[0];
  if (!last || last.action !== "pass") throw new DomainError("There's no pass to undo.");
  if (Date.now() - Date.parse(last.created_at) > 24 * 3600_000) throw new DomainError("You can only undo a pass from today.");
  const them = await visibleTo(personId, last.to_id);
  const me = await getProfile(personId);
  await store.remove("swipes", last.id);
  const toMe = (await store.list("swipes", { from_id: last.to_id, to_id: personId })).find((x) => x.action !== "pass") ?? null;
  const [c] = await withVouches([card(them, new Date(), me!, toMe)]);
  return c;
}
