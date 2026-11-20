import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, getPerson } from "./domain";
import { stamp } from "./chat";
import { isBlockedBetween } from "./dating";
import { hurtful, HURT_LABEL, normalize } from "./kind-words";
import type { Vouch } from "./types";

// Friends vouch for you: you share a link, a friend signs in and writes a few kind, true words,
// and nothing shows on your profile until you approve it. You can hide it again any time, and
// the friend can take it back. Up to three show on your profile.

export const RELATIONS: Record<Vouch["relation"], string> = { friend: "Friend", sibling: "Sibling", cousin: "Cousin", colleague: "Colleague", classmate: "Classmate" };
export const VOUCH_MIN = 10;
export const VOUCH_MAX = 200;
const INVITE_DAYS = 14;
const SHOWN_MAX = 3;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// A vouch talks about someone, so also catch insults about "her", "him" or "them".
const ABOUT_THEM = /\b(she|he|they|her|him)('?s| is| are| was)?\s+(so\s+|really\s+|such an?\s+|an?\s+)?(ugly|fat|disgusting|pathetic|worthless|stupid|dumb|crazy|psycho|an idiot|idiot|a loser|loser|trash|a joke|a cheater|cheater|a player|liar|a liar)\b/;
const unkind = (text: string) => hurtful(text) ?? (ABOUT_THEM.test(normalize(text)) ? { reason: "insult" as const } : null);

/** A link to send to a friend (works for two weeks, for as many friends as you send it to). */
export async function createVouchInvite(personId: string): Promise<{ token: string }> {
  const token = randomBytes(18).toString("base64url");
  const at = new Date();
  await getStore().insert("vouch_invites", { id: hash(token), person_id: personId, created_at: at.toISOString(), expires_at: new Date(at.getTime() + INVITE_DAYS * 86400_000).toISOString() });
  return { token };
}

async function invite(token: string) {
  const inv = await getStore().get("vouch_invites", hash(String(token ?? "")));
  if (!inv || inv.expires_at < new Date().toISOString()) throw new DomainError("This vouch link has expired. Ask your friend for a new one.", 404);
  const person = await getPerson(inv.person_id);
  if (!person || person.name === "Deleted account") throw new DomainError("This vouch link no longer works.", 404);
  return { inv, person };
}

/** What the friend sees when they open the link. */
export async function vouchInvite(token: string, viewerId: string | null) {
  const { person } = await invite(token);
  const mine = viewerId ? (await getStore().list("vouches", { person_id: person.id, friend_id: viewerId }))[0] : undefined;
  return { first_name: person.name.split(" ")[0], self: viewerId === person.id, existing: mine ? { relation: mine.relation, text: mine.text, status: mine.status } : null };
}

export async function writeVouch(token: string, friendId: string, relation: string, rawText: string): Promise<{ ok: true }> {
  const { person } = await invite(token);
  if (person.id === friendId) throw new DomainError("You can't vouch for yourself. Send the link to a friend.");
  if (await isBlockedBetween(person.id, friendId)) throw new DomainError("This vouch link no longer works.", 404);
  if (!(relation in RELATIONS)) throw new DomainError("Choose how you know them.");
  const text = String(rawText ?? "").replace(/\s+/g, " ").trim();
  if (text.length < VOUCH_MIN) throw new DomainError("Write a little more: a sentence about what makes them great.");
  if (text.length > VOUCH_MAX) throw new DomainError(`Keep it under ${VOUCH_MAX} characters.`);
  const hurt = unkind(text);
  if (hurt) throw new DomainError(`${HURT_LABEL[hurt.reason]} A vouch should be kind and true.`);
  const friend = await getPerson(friendId);
  const store = getStore();
  const at = stamp();
  const [existing] = await store.list("vouches", { person_id: person.id, friend_id: friendId });
  // Changing what you wrote sends it back for approval.
  if (existing) await store.update("vouches", existing.id, { relation: relation as Vouch["relation"], text, status: "pending", friend_name: friend?.name ?? "A friend", created_at: at, decided_at: null });
  else await store.insert("vouches", { id: randomUUID(), person_id: person.id, friend_id: friendId, friend_name: friend?.name ?? "A friend", relation: relation as Vouch["relation"], text, status: "pending", created_at: at, decided_at: null });
  return { ok: true };
}

export interface VouchView { id: string; friend: string; relation: string; text: string; status: Vouch["status"]; created_at: string }
const view = (v: Vouch): VouchView => ({ id: v.id, friend: v.friend_name.split(" ")[0], relation: RELATIONS[v.relation], text: v.text, status: v.status, created_at: v.created_at });

/** Vouches about you: waiting for your OK, showing, and hidden. */
export async function vouchesAbout(personId: string): Promise<VouchView[]> {
  const list = await getStore().list("vouches", { person_id: personId });
  const order = { pending: 0, shown: 1, hidden: 2 };
  return list.sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at)).map(view);
}

export async function decideVouch(personId: string, id: string, status: string) {
  if (status !== "shown" && status !== "hidden") throw new DomainError("Show or hide?");
  const store = getStore();
  const v = await store.get("vouches", id);
  if (!v || v.person_id !== personId) throw new DomainError("Vouch not found.", 404);
  if (status === "shown" && v.status !== "shown") {
    const shown = (await store.list("vouches", { person_id: personId })).filter((x) => x.status === "shown");
    if (shown.length >= SHOWN_MAX) throw new DomainError(`Up to ${SHOWN_MAX} vouches show on your profile. Hide one first.`);
  }
  await store.update("vouches", id, { status, decided_at: stamp() });
  return { ok: true };
}

/** The friend takes their vouch back. */
export async function withdrawVouch(friendId: string, id: string) {
  const store = getStore();
  const v = await store.get("vouches", id);
  if (!v || v.friend_id !== friendId) throw new DomainError("Vouch not found.", 404);
  await store.remove("vouches", id);
  return { ok: true };
}

/** For profile cards: approved vouches, first names only. */
export async function shownVouches(personId: string): Promise<{ friend: string; relation: string; text: string }[]> {
  return (await getStore().list("vouches", { person_id: personId }))
    .filter((v) => v.status === "shown")
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .slice(0, SHOWN_MAX)
    .map((v) => ({ friend: v.friend_name.split(" ")[0], relation: RELATIONS[v.relation], text: v.text }));
}

export async function deleteVouchesFor(personId: string) {
  const store = getStore();
  for (const v of [...(await store.list("vouches", { person_id: personId })), ...(await store.list("vouches", { friend_id: personId }))]) await store.remove("vouches", v.id);
  for (const i of await store.list("vouch_invites", { person_id: personId })) await store.remove("vouch_invites", i.id);
}
