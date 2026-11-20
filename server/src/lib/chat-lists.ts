import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { membership, stamp } from "./chat";

// Chat lists, like WhatsApp's "Add to list": your own groupings (Family, Work, Braai crew) that
// show as filters above your chats. Only you see them.

const MAX_LISTS = 20;

export async function myLists(personId: string) {
  const lists = (await getStore().list("chat_lists", { person_id: personId })).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return lists.map((l) => ({ id: l.id, name: l.name, chat_ids: l.chat_ids }));
}

export async function createList(personId: string, rawName: unknown, chatId?: unknown) {
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 30) : "";
  if (!name) throw new DomainError("Give the list a name.");
  const store = getStore();
  const lists = await store.list("chat_lists", { person_id: personId });
  if (lists.length >= MAX_LISTS) throw new DomainError(`You can have up to ${MAX_LISTS} lists.`);
  if (lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new DomainError("You already have a list with that name.");
  const ids: string[] = [];
  if (typeof chatId === "string" && chatId) { await membership(chatId, personId); ids.push(chatId); }
  const row = await store.insert("chat_lists", { id: randomUUID(), person_id: personId, name, chat_ids: ids, created_at: stamp() });
  return { id: row.id, name: row.name, chat_ids: row.chat_ids };
}

async function own(personId: string, id: string) {
  const l = await getStore().get("chat_lists", id);
  if (!l || l.person_id !== personId) throw new DomainError("That list isn't there any more.", 404);
  return l;
}

export async function updateList(personId: string, id: string, b: { name?: unknown; add?: unknown; remove?: unknown }) {
  const l = await own(personId, id);
  let ids = l.chat_ids;
  if (typeof b.add === "string") { await membership(b.add, personId); ids = [...new Set([...ids, b.add])]; }
  if (typeof b.remove === "string") ids = ids.filter((x) => x !== b.remove);
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 30) : l.name;
  const row = await getStore().update("chat_lists", id, { name, chat_ids: ids });
  return { id: row.id, name: row.name, chat_ids: row.chat_ids };
}

export async function deleteList(personId: string, id: string) {
  await own(personId, id);
  await getStore().remove("chat_lists", id);
}
