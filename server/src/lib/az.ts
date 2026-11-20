import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { companionPlan, membership, postMessage, stamp } from "./chat";
import type { AzAlbum, AzDate } from "./types";
import { IDEAS, STYLES, allIdeas, firstIdea, isLook, isStyle, type AlbumLook, type DateStyle } from "./alphabet-ideas";

// Alphabet date ideas: 26 dates for two people, one per letter, kept as an
// album. Each letter starts with a few ideas; either of you can pick one or
// write your own. When you've been, you add a photo, a little story and a
// rating. The photo and story are sent into the chat end-to-end encrypted
// like any other message, and the album only remembers which messages they were.

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export { IDEAS, STYLES, LOOKS } from "./alphabet-ideas";
/** Where each letter starts in the classic style. */
export const SUGGESTIONS: Record<string, string> = Object.fromEntries(LETTERS.map((l) => [l, firstIdea(l, "out")]));

export interface AzLetter {
  letter: string;
  activity: string;
  custom: boolean;
  status: AzDate["status"];
  plan_slug: string | null;
  done_at: string | null;
  done_by: string | null;
  /** Ideas for this letter in every style, the album's style first. */
  ideas: { style: DateStyle; name: string; items: string[] }[];
  /** The encrypted photo message, opened on the phone. Null if there's no photo or it was deleted. */
  photo: Sealed | null;
  /** The encrypted story and rating, opened on the phone. */
  story: Sealed | null;
}
export interface Sealed { message_id: string; cipher: string; sender_id: string | null }

export interface AzBoard { letters: AzLetter[]; done: number; style: DateStyle; look: AlbumLook }

async function album(chatId: string): Promise<{ style: DateStyle; look: AlbumLook }> {
  const row = await getStore().get("az_albums", chatId);
  return { style: row?.style ?? "out", look: row?.look ?? "cream" };
}

async function directChat(chatId: string, personId: string) {
  const { chat } = await membership(chatId, personId);
  if (chat.kind !== "direct") throw new DomainError("Alphabet date ideas are for two people, so they're only in one-to-one chats.");
  return chat;
}

function cleanLetter(raw: string): string {
  const l = String(raw ?? "").trim().toUpperCase();
  if (!LETTERS.includes(l)) throw new DomainError("Pick a letter from A to Z.");
  return l;
}

export async function azBoard(chatId: string, personId: string): Promise<AzBoard> {
  await directChat(chatId, personId);
  const store = getStore();
  const { style, look } = await album(chatId);
  const rows = new Map((await store.list("az_dates", { chat_id: chatId })).map((r) => [r.letter, r]));
  const styles = [...STYLES].sort((x, y) => (x.id === style ? -1 : y.id === style ? 1 : 0));
  const msgIds = [...rows.values()].flatMap((r) => [r.message_id, r.story_message_id]).filter((x): x is string => !!x);
  const msgs = new Map((await store.listIn("messages", "id", msgIds)).filter((m) => m.chat_id === chatId).map((m) => [m.id, m]));
  const letters = LETTERS.map((letter): AzLetter => {
    const r = rows.get(letter);
    const sealed = (id: string | null | undefined): Sealed | null => {
      const m = id ? msgs.get(id) : undefined;
      return m?.cipher ? { message_id: m.id, cipher: m.cipher, sender_id: m.sender_id } : null;
    };
    return {
      letter,
      activity: r?.activity ?? firstIdea(letter, style),
      custom: !!r && !allIdeas(letter).includes(r.activity),
      status: r?.status ?? "idea",
      plan_slug: r?.plan_slug ?? null,
      done_at: r?.status === "done" ? r.done_at : null,
      done_by: r?.status === "done" ? r.updated_by : null,
      ideas: styles.map((st) => ({ style: st.id, name: st.name, items: IDEAS[letter][st.id] })),
      photo: sealed(r?.message_id),
      story: sealed(r?.story_message_id),
    };
  });
  return { letters, done: letters.filter((l) => l.status === "done").length, style, look };
}

async function upsert(chatId: string, letter: string, personId: string, patch: Partial<AzDate>): Promise<AzDate> {
  const store = getStore();
  const [row] = await store.list("az_dates", { chat_id: chatId, letter });
  const at = stamp();
  if (row) return store.update("az_dates", row.id, { ...patch, updated_by: personId, updated_at: at });
  const { style } = await album(chatId);
  return store.insert("az_dates", {
    id: randomUUID(), chat_id: chatId, letter, activity: firstIdea(letter, style), status: "idea", plan_slug: null,
    message_id: null, story_message_id: null, done_at: null, ...patch, updated_by: personId, updated_at: at,
  });
}

export async function renameAz(chatId: string, personId: string, rawLetter: string, rawActivity: string) {
  await directChat(chatId, personId);
  const letter = cleanLetter(rawLetter);
  const activity = String(rawActivity ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (activity.length < 2) throw new DomainError("Give the date a name.");
  await upsert(chatId, letter, personId, { activity });
}

/** Drafts a plan in the chat for this letter's date, so you can pick a time together. */
export async function planAz(chatId: string, personId: string, rawLetter: string): Promise<string | null> {
  await directChat(chatId, personId);
  const letter = cleanLetter(rawLetter);
  const board = await azBoard(chatId, personId);
  const entry = board.letters.find((l) => l.letter === letter)!;
  const plan = await companionPlan(chatId, personId, `${entry.activity} (${letter} of our alphabet dates)`);
  if (plan) await upsert(chatId, letter, personId, { status: entry.status === "done" ? "done" : "planned", plan_slug: plan.slug });
  return plan?.slug ?? null;
}

async function ownSealed(chatId: string, personId: string, messageId: string, what: string) {
  const msg = await getStore().get("messages", String(messageId ?? ""));
  if (!msg || msg.chat_id !== chatId || msg.sender_id !== personId || !msg.cipher) throw new DomainError(`That ${what} didn't send. Try again.`);
  return msg;
}

/** Ticks a letter off with the encrypted photo you just sent into the chat. */
export async function completeAz(chatId: string, personId: string, rawLetter: string, messageId: string) {
  await directChat(chatId, personId);
  const letter = cleanLetter(rawLetter);
  const msg = await ownSealed(chatId, personId, messageId, "photo");
  const before = (await azBoard(chatId, personId)).done;
  await upsert(chatId, letter, personId, { status: "done", message_id: msg.id, done_at: stamp() });
  if (before === 25) await postMessage(chatId, null, "system", "You've done all 26 alphabet dates 🎉 Your album is complete.");
}

/** Not done after all: back to an idea. The photo stays in the chat. */
export async function undoAz(chatId: string, personId: string, rawLetter: string) {
  await directChat(chatId, personId);
  const letter = cleanLetter(rawLetter);
  const [row] = await getStore().list("az_dates", { chat_id: chatId, letter });
  if (row) await upsert(chatId, letter, personId, { status: row.plan_slug ? "planned" : "idea", message_id: null, done_at: null });
}

/** Points a letter's page at the encrypted story (and rating) you just sent into the chat. */
export async function storyAz(chatId: string, personId: string, rawLetter: string, messageId: string) {
  await directChat(chatId, personId);
  const letter = cleanLetter(rawLetter);
  const msg = await ownSealed(chatId, personId, messageId, "story");
  await upsert(chatId, letter, personId, { story_message_id: msg.id });
}

/** The album's date style (which ideas each letter starts with) and look. Shared by both people. */
export async function setAlbum(chatId: string, personId: string, raw: { style?: unknown; look?: unknown }) {
  await directChat(chatId, personId);
  const store = getStore();
  const current = await store.get("az_albums", chatId);
  const next: AzAlbum = {
    id: chatId, chat_id: chatId,
    style: isStyle(raw.style) ? raw.style : current?.style ?? "out",
    look: isLook(raw.look) ? raw.look : current?.look ?? "cream",
    updated_by: personId, updated_at: stamp(),
  };
  if (current) await store.update("az_albums", chatId, next);
  else await store.insert("az_albums", next);
  // Letters you haven't touched follow the new style automatically; ones you've picked, planned or done keep theirs.
}
