import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, createPlanFromSpark } from "./domain";
import { postMessage, stamp } from "./chat";
import { ageOn, compatible } from "./matching";
import type { DatingProfile } from "./types";

// Double dates: pair up with a friend, match with another pair, and plan a
// date for four. A pair is shown to another pair only if everyone in each pair
// has someone in the other who fits their preferences both ways, and nobody
// has blocked anybody. One like per pair is enough; when both pairs like each
// other, a four-person chat opens with a plan for the pair's date idea, and
// phone numbers stay hidden like in match chats.

import type { DuoRow } from "./types";
export type Duo = DuoRow;

export interface DuoCard {
  id: string;
  idea: string;
  people: { id: string; name: string; age: number; photo: string; verified: boolean }[];
}

async function profile(id: string) {
  return getStore().get("dating_profiles", id);
}

async function usable(id: string): Promise<DatingProfile> {
  const p = await profile(id);
  if (!p) throw new DomainError("Make your dating profile first.");
  if (p.removed_at) throw new DomainError("Your dating profile was removed after a safety review.");
  return p;
}

export async function myDuo(personId: string): Promise<Duo | null> {
  const store = getStore();
  const rows = [...(await store.list("duos", { a: personId })), ...(await store.list("duos", { b: personId }))];
  return rows.find((d) => d.status !== "ended") ?? null;
}

export interface DuoStatus {
  duo: Duo | null;
  partner: { id: string; name: string; photo: string | null } | null;
  inviter?: string;
}

export async function duoStatus(personId: string): Promise<DuoStatus> {
  const duo = await myDuo(personId);
  if (!duo) return { duo: null, partner: null };
  const partnerId = duo.a === personId ? duo.b : duo.a;
  const p = partnerId ? await profile(partnerId) : null;
  return { duo, partner: p ? { id: p.person_id, name: p.display_name, photo: p.photos[0] ?? null } : null };
}

/** Starts a pair: returns an invite code to send to a friend. */
export async function createDuo(personId: string, rawIdea: string) {
  await usable(personId);
  if (await myDuo(personId)) throw new DomainError("You're already in a pair. Leave it first to start a new one.");
  const idea = String(rawIdea ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (idea.length < 4) throw new DomainError("Add a date idea for four, e.g. \"Bowling, then burgers\".");
  return getStore().insert("duos", {
    id: randomUUID(), a: personId, b: null, code: randomBytes(9).toString("base64url"), idea, status: "pending", created_at: stamp(),
  });
}

export async function inviteInfo(code: string) {
  const [duo] = await getStore().list("duos", { code: String(code ?? "") });
  if (!duo || duo.status !== "pending") return null;
  const p = await profile(duo.a);
  return p ? { name: p.display_name, idea: duo.idea } : null;
}

export async function joinDuo(personId: string, code: string) {
  await usable(personId);
  const store = getStore();
  const [duo] = await store.list("duos", { code: String(code ?? "") });
  if (!duo || duo.status !== "pending") throw new DomainError("That invite has expired or was already used.");
  if (duo.a === personId) throw new DomainError("That's your own invite. Send it to a friend.");
  if (await myDuo(personId)) throw new DomainError("You're already in a pair. Leave it first to join this one.");
  const { isBlockedBetween } = await import("./dating");
  if (await isBlockedBetween(personId, duo.a)) throw new DomainError("That invite isn't available.");
  return store.update("duos", duo.id, { b: personId, status: "active", code: randomBytes(9).toString("base64url") });
}

export async function leaveDuo(personId: string) {
  const duo = await myDuo(personId);
  if (duo) await getStore().update("duos", duo.id, { status: "ended" });
}

async function members(d: Duo): Promise<DatingProfile[]> {
  const ps = await Promise.all([d.a, d.b].filter((x): x is string => !!x).map(profile));
  return ps.filter((p): p is DatingProfile => !!p);
}

/** Everyone in each pair has someone in the other who fits both ways; nobody blocked; nobody paused or removed. */
async function visible(mine: DatingProfile[], theirs: DatingProfile[], now: Date): Promise<boolean> {
  if (mine.length !== 2 || theirs.length !== 2) return false;
  if (mine.some((m) => theirs.some((t) => t.person_id === m.person_id))) return false;
  const { isBlockedBetween } = await import("./dating");
  for (const m of mine) for (const t of theirs) if (await isBlockedBetween(m.person_id, t.person_id)) return false;
  const fits = (a: DatingProfile, b: DatingProfile) => compatible(a, b, now) && compatible(b, a, now);
  return mine.every((m) => theirs.some((t) => fits(m, t))) && theirs.every((t) => mine.some((m) => fits(m, t)));
}

const duoCard = (d: Duo, people: DatingProfile[], now: Date): DuoCard => ({
  id: d.id, idea: d.idea,
  people: people.map((p) => ({ id: p.person_id, name: p.display_name, age: ageOn(p.birthdate, now), photo: p.photos[0], verified: !!p.verified_at })),
});

export async function discoverDuos(personId: string, limit = 10): Promise<DuoCard[]> {
  const duo = await myDuo(personId);
  if (!duo || duo.status !== "active") throw new DomainError("Pair up with a friend first.");
  const store = getStore();
  const now = new Date();
  const mine = await members(duo);
  const answered = new Set((await store.list("duo_swipes", { from_duo: duo.id })).map((s) => s.to_duo));
  const likedUs = new Set((await store.list("duo_swipes", { to_duo: duo.id })).filter((s) => s.action === "like").map((s) => s.from_duo));
  const out: { card: DuoCard; liked: boolean; at: string }[] = [];
  for (const d of await store.list("duos", { status: "active" })) {
    if (d.id === duo.id || answered.has(d.id)) continue;
    const theirs = await members(d);
    if (await visible(mine, theirs, now)) out.push({ card: duoCard(d, theirs, now), liked: likedUs.has(d.id), at: d.created_at });
    if (out.length >= limit * 5) break;
  }
  return out.sort((x, y) => Number(y.liked) - Number(x.liked) || y.at.localeCompare(x.at)).slice(0, limit).map((x) => x.card);
}

/** One like per pair. When both pairs like each other, a chat for four opens with a plan for the date. */
export async function swipeDuo(personId: string, toDuo: string, action: string): Promise<{ match: { chat_id: string; title: string } | null }> {
  if (action !== "like" && action !== "pass") throw new DomainError("Unknown answer.");
  const duo = await myDuo(personId);
  if (!duo || duo.status !== "active") throw new DomainError("Pair up with a friend first.");
  const store = getStore();
  const them = await store.get("duos", toDuo);
  if (!them || them.status !== "active") throw new DomainError("That pair isn't available any more.");
  const [mine, theirs] = [await members(duo), await members(them)];
  if (!(await visible(mine, theirs, new Date()))) throw new DomainError("That pair isn't available any more.");
  const [already] = await store.list("duo_swipes", { from_duo: duo.id, to_duo: them.id });
  if (already) return { match: null };
  await store.insert("duo_swipes", { id: randomUUID(), from_duo: duo.id, to_duo: them.id, by_person: personId, action, created_at: stamp() });
  if (action === "pass") return { match: null };
  const [back] = (await store.list("duo_swipes", { from_duo: them.id, to_duo: duo.id })).filter((s) => s.action === "like");
  if (!back) return { match: null };

  const at = stamp();
  const first = (ps: DatingProfile[]) => ps.map((p) => p.display_name.split(" ")[0]).join(" & ");
  const title = `Double date: ${first(mine)} + ${first(theirs)}`.slice(0, 60);
  const chat = await store.insert("chats", { id: randomUUID(), kind: "group", origin: "double", name: title, created_by: personId, created_at: at, last_message_at: at });
  for (const p of [...mine, ...theirs]) {
    await store.insert("chat_members", { id: randomUUID(), chat_id: chat.id, person_id: p.person_id, role: "member", last_read_at: null, last_delivered_at: null, joined_at: at });
  }
  await store.insert("duo_matches", { id: randomUUID(), duo_a: them.id, duo_b: duo.id, chat_id: chat.id, created_at: at });
  await postMessage(chat.id, null, "system", "It's a double date! Both pairs liked each other. Phone numbers stay hidden in this chat.");
  // The pair who liked first suggested the date: plan theirs.
  const idea = back.created_at < at ? them : duo;
  const plan = await createPlanFromSpark(idea.a, idea.idea, null, chat.id);
  await postMessage(chat.id, null, "plan", plan.title, { plan_id: plan.id });
  await postMessage(chat.id, null, "companion", `Here's a plan for "${idea.idea}". Pick an option that suits all four of you and vote. Meet somewhere public, and use "Share date details" to tell a friend where you'll be.`);
  return { match: { chat_id: chat.id, title } };
}

/** Can this person see that person's photo because of double dating? (Same pair, a pair they can see, or a double-date chat.) */
export async function duoCanSeePhoto(viewerId: string, ownerId: string): Promise<boolean> {
  const store = getStore();
  const mine = await myDuo(viewerId);
  if (mine && (mine.a === ownerId || mine.b === ownerId)) return true;
  const theirs = await myDuo(ownerId);
  if (mine?.status === "active" && theirs?.status === "active" && (await visible(await members(mine), await members(theirs), new Date()))) return true;
  const shared = (await store.list("chat_members", { person_id: viewerId })).map((m) => m.chat_id);
  for (const m of await store.list("chat_members", { person_id: ownerId })) {
    if (!shared.includes(m.chat_id)) continue;
    const chat = await store.get("chats", m.chat_id);
    if (chat?.origin === "double") return true;
  }
  return false;
}
