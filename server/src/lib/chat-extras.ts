import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { chatMembers, chatTitle, isMuted, membership, postMessage, stamp } from "./chat";
import { hub } from "./realtime";
import type { ChatMember, Message } from "./types";

// The WhatsApp-style extras around chats: pin, mute, archive, stars, "delete for me",
// message info, view once, disappearing messages, group admin tools, invite links,
// typing and last seen. Message content stays end-to-end encrypted throughout:
// the server only ever handles ids and settings.

const MAX_PINS = 3;
const FOREVER = "9999-12-31T00:00:00.000Z";
export const MUTE_FOR = { "8h": 8 * 3600_000, week: 7 * 86400_000, always: null } as const;
export const TIMERS = [0, 86400, 7 * 86400, 90 * 86400] as const;
export const timerLabel = (secs: number) => (secs === 86400 ? "24 hours" : secs === 7 * 86400 ? "7 days" : "90 days");

async function nameOf(personId: string) {
  return (await getStore().get("people", personId))?.name ?? "Someone";
}

// ── My settings for a chat ───────────────────────────────────────────────────

export async function setChatPrefs(chatId: string, personId: string, b: { pin?: unknown; mute?: unknown; archive?: unknown; unread?: unknown }) {
  const { member } = await membership(chatId, personId);
  const store = getStore();
  const patch: Partial<ChatMember> = {};
  if (typeof b.pin === "boolean") {
    if (b.pin && !member.pinned_at) {
      const pinned = (await store.list("chat_members", { person_id: personId })).filter((m) => m.pinned_at);
      if (pinned.length >= MAX_PINS) throw new DomainError(`You can pin up to ${MAX_PINS} chats.`);
    }
    patch.pinned_at = b.pin ? member.pinned_at ?? stamp() : null;
  }
  if (typeof b.mute === "string") {
    if (b.mute === "off") patch.muted_until = null;
    else if (b.mute in MUTE_FOR) {
      const ms = MUTE_FOR[b.mute as keyof typeof MUTE_FOR];
      patch.muted_until = ms === null ? FOREVER : new Date(Date.now() + ms).toISOString();
    } else throw new DomainError("Choose how long to mute for.");
  }
  if (typeof b.archive === "boolean") {
    patch.archived = b.archive;
    if (b.archive) patch.pinned_at = null; // archived chats can't stay pinned
  }
  if (typeof b.unread === "boolean") {
    patch.marked_unread = b.unread;
    if (!b.unread) patch.last_read_at = stamp();
  }
  await store.update("chat_members", member.id, patch);
  return { pinned: !!(patch.pinned_at ?? member.pinned_at), muted: isMuted({ muted_until: patch.muted_until !== undefined ? patch.muted_until : member.muted_until }) };
}

/** "Clear chat": empties it on my phones (others keep theirs). "Delete chat" also hides it until someone writes again. */
export async function clearChat(chatId: string, personId: string, alsoHide: boolean) {
  const { chat, member } = await membership(chatId, personId);
  if (alsoHide && chat.kind === "group") throw new DomainError("Leave the group first, then you can delete it.");
  const at = stamp();
  await getStore().update("chat_members", member.id, { cleared_at: at, last_read_at: at, marked_unread: false, ...(alsoHide ? { hidden_at: at, pinned_at: null } : {}) });
}

// ── Messages ─────────────────────────────────────────────────────────────────

async function messageIn(chatId: string, personId: string, messageId: string): Promise<{ msg: Message; member: ChatMember }> {
  const { member } = await membership(chatId, personId);
  const msg = await getStore().get("messages", messageId);
  if (!msg || msg.chat_id !== chatId || msg.meta || (member.cleared_at && msg.created_at <= member.cleared_at)) throw new DomainError("That message isn't available any more.");
  return { msg, member };
}

export async function setStar(chatId: string, personId: string, messageId: string, on: boolean) {
  await messageIn(chatId, personId, messageId);
  const store = getStore();
  const existing = await store.list("stars", { person_id: personId, message_id: messageId });
  if (on && !existing.length) await store.insert("stars", { id: randomUUID(), person_id: personId, chat_id: chatId, message_id: messageId, created_at: stamp() });
  if (!on) for (const s of existing) await store.remove("stars", s.id);
  // Nudge my other phones (and this chat) so the star shows everywhere.
  hub().publish(personId, { chat: chatId });
}

/** Starred messages from all my chats, newest first (still encrypted: the phone opens them). */
export async function starredMessages(personId: string) {
  const store = getStore();
  const stars = (await store.list("stars", { person_id: personId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const msgs = new Map((await store.listIn("messages", "id", stars.map((s) => s.message_id))).map((m) => [m.id, m]));
  const chats = new Map((await store.listIn("chats", "id", [...new Set(stars.map((s) => s.chat_id))])).map((c) => [c.id, c]));
  const out = [];
  for (const s of stars) {
    const m = msgs.get(s.message_id);
    const chat = chats.get(s.chat_id);
    if (!m || !chat || m.kind !== "encrypted") continue;
    const members = await chatMembers(chat.id);
    if (!members.some((x) => x.person.id === personId)) continue;
    out.push({
      id: m.id, chat_id: chat.id, chat_title: chatTitle(chat, members, personId), cipher: m.cipher, sender_id: m.sender_id,
      sender_name: members.find((x) => x.person.id === m.sender_id)?.person.name ?? "Someone", created_at: m.created_at,
    });
  }
  return out;
}

/** "Delete for me". */
export async function hideMessage(chatId: string, personId: string, messageId: string) {
  await messageIn(chatId, personId, messageId);
  const store = getStore();
  if (!(await store.list("message_hides", { person_id: personId, message_id: messageId })).length) {
    await store.insert("message_hides", { id: randomUUID(), person_id: personId, chat_id: chatId, message_id: messageId, created_at: stamp() });
  }
  for (const s of await store.list("stars", { person_id: personId, message_id: messageId })) await store.remove("stars", s.id);
  hub().publish(personId, { chat: chatId });
}

/** "Message info" for my own message: who has it and who has read it. */
export async function messageInfo(chatId: string, personId: string, messageId: string) {
  const { msg } = await messageIn(chatId, personId, messageId);
  if (msg.sender_id !== personId) throw new DomainError("Message info is only for your own messages.");
  const { chat } = await membership(chatId, personId);
  const members = (await chatMembers(chatId)).filter((m) => m.person.id !== personId);
  const me = await getStore().get("people", personId);
  const noReceipts = chat.kind === "direct" && (me?.read_receipts_off || members.some((m) => m.person.read_receipts_off));
  return {
    sent_at: msg.created_at,
    people: members.map((m) => ({
      id: m.person.id,
      name: m.person.name,
      status: !noReceipts && m.member.last_read_at && m.member.last_read_at >= msg.created_at ? "read"
        : m.member.last_delivered_at && m.member.last_delivered_at >= msg.created_at ? "delivered" : "sent",
      opened: (msg.opened_by ?? []).includes(m.person.id),
    })),
  };
}

/** A view-once photo was opened. Once everyone has, the encrypted file is deleted for good. */
export async function markOpened(chatId: string, personId: string, messageId: string) {
  const { msg } = await messageIn(chatId, personId, messageId);
  if (msg.sender_id === personId) return;
  const store = getStore();
  const opened = [...new Set([...(msg.opened_by ?? []), personId])];
  await store.update("messages", msg.id, { opened_by: opened, updated_at: stamp() });
  const others = (await chatMembers(chatId)).map((m) => m.person.id).filter((id) => id !== msg.sender_id);
  if (msg.media_path && others.every((id) => opened.includes(id))) {
    const { deleteOwnedMedia } = await import("./media");
    await deleteOwnedMedia(msg.media_path).catch(() => undefined);
    await store.update("messages", msg.id, { media_path: null });
  }
}

/** Everything in the chat I can still see (for search, media, export), still encrypted. */
export async function chatHistory(chatId: string, personId: string) {
  const { chat, member } = await membership(chatId, personId);
  const store = getStore();
  const hidden = new Set((await store.list("message_hides", { person_id: personId, chat_id: chatId })).map((h) => h.message_id));
  const now = new Date().toISOString();
  const all = (await store.list("messages", { chat_id: chatId }))
    .filter((m) => (m.kind === "encrypted") && !hidden.has(m.id) && !(m.target_id && hidden.has(m.target_id))
      && (!member.cleared_at || m.created_at > member.cleared_at) && (!m.expires_at || m.expires_at > now) && (!m.meta || m.meta === "edit")
      && (chat.kind !== "group" || m.created_at >= member.joined_at))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-3000);
  const names = new Map((await chatMembers(chatId)).map((m) => [m.person.id, m.person.name]));
  return all.map((m) => ({ id: m.id, cipher: m.cipher!, sender_id: m.sender_id, sender_name: m.sender_id ? names.get(m.sender_id) ?? "Someone" : null, created_at: m.created_at, meta: m.meta ?? null, target_id: m.target_id ?? null }));
}

// ── Chat settings ────────────────────────────────────────────────────────────

async function canEditInfo(chatId: string, personId: string) {
  const { chat, member } = await membership(chatId, personId);
  if (chat.kind === "group" && chat.admins_only_info && member.role !== "admin") throw new DomainError("Only admins can change this group's settings.");
  return { chat, member };
}

export async function setDisappearing(chatId: string, personId: string, secs: number) {
  if (!TIMERS.includes(secs as (typeof TIMERS)[number])) throw new DomainError("Choose 24 hours, 7 days, 90 days or off.");
  const { chat } = await canEditInfo(chatId, personId);
  if ((chat.disappear_secs ?? 0) === secs) return;
  await getStore().update("chats", chatId, { disappear_secs: secs || null });
  const who = await nameOf(personId);
  await postMessage(chatId, null, "system", secs
    ? `${who} turned on disappearing messages. New messages will disappear from this chat ${timerLabel(secs)} after they're sent.`
    : `${who} turned off disappearing messages.`);
}

export async function updateGroup(chatId: string, personId: string, b: { name?: unknown; description?: unknown }) {
  const { chat } = await canEditInfo(chatId, personId);
  if (chat.kind !== "group") throw new DomainError("Only groups have a name and description.");
  const who = await nameOf(personId);
  if (typeof b.name === "string") {
    const name = b.name.trim().slice(0, 60);
    if (!name) throw new DomainError("Give the group a name.");
    if (name !== chat.name) {
      await getStore().update("chats", chatId, { name });
      await postMessage(chatId, null, "system", `${who} changed the group name to "${name}"`);
    }
  }
  if (typeof b.description === "string") {
    const description = b.description.trim().slice(0, 500);
    if (description !== (chat.description ?? "")) {
      await getStore().update("chats", chatId, { description });
      await postMessage(chatId, null, "system", description ? `${who} changed the group description` : `${who} removed the group description`);
    }
  }
}

async function adminOf(chatId: string, personId: string) {
  const { chat, member } = await membership(chatId, personId);
  if (chat.kind !== "group") throw new DomainError("That's only for groups.");
  if (member.role !== "admin") throw new DomainError("Only group admins can do that.");
  return chat;
}

export async function setGroupPermissions(chatId: string, personId: string, b: { admins_only_send?: unknown; admins_only_info?: unknown }) {
  const chat = await adminOf(chatId, personId);
  const who = await nameOf(personId);
  if (typeof b.admins_only_send === "boolean" && b.admins_only_send !== !!chat.admins_only_send) {
    await getStore().update("chats", chatId, { admins_only_send: b.admins_only_send });
    await postMessage(chatId, null, "system", b.admins_only_send ? `${who} changed this group so only admins can send messages` : `${who} changed this group so everyone can send messages`);
  }
  if (typeof b.admins_only_info === "boolean" && b.admins_only_info !== !!chat.admins_only_info) {
    await getStore().update("chats", chatId, { admins_only_info: b.admins_only_info });
    await postMessage(chatId, null, "system", b.admins_only_info ? `${who} changed this group so only admins can edit its settings` : `${who} changed this group so everyone can edit its settings`);
  }
}

export async function removeFromGroup(chatId: string, personId: string, whoId: string) {
  await adminOf(chatId, personId);
  if (whoId === personId) throw new DomainError("To leave, use Leave group.");
  const store = getStore();
  const [m] = await store.list("chat_members", { chat_id: chatId, person_id: whoId });
  if (!m) throw new DomainError("They're not in this group.");
  await store.remove("chat_members", m.id);
  await postMessage(chatId, null, "system", `${await nameOf(personId)} removed ${await nameOf(whoId)}`);
}

export async function setAdmin(chatId: string, personId: string, whoId: string, admin: boolean) {
  await adminOf(chatId, personId);
  const store = getStore();
  const [m] = await store.list("chat_members", { chat_id: chatId, person_id: whoId });
  if (!m) throw new DomainError("They're not in this group.");
  if (!admin && whoId === personId && (await store.list("chat_members", { chat_id: chatId })).filter((x) => x.role === "admin").length <= 1) {
    throw new DomainError("Make someone else an admin first.");
  }
  if ((m.role === "admin") === admin) return;
  await store.update("chat_members", m.id, { role: admin ? "admin" : "member" });
  await postMessage(chatId, null, "system", admin ? `${await nameOf(whoId)} is now an admin` : `${await nameOf(whoId)} is no longer an admin`);
}

/** The group's invite link (made on first ask; reset makes the old one stop working). */
export async function inviteLink(chatId: string, personId: string, reset: boolean) {
  const chat = await adminOf(chatId, personId);
  let token = chat.invite_token ?? null;
  if (!token || reset) {
    token = randomBytes(12).toString("base64url");
    await getStore().update("chats", chatId, { invite_token: token });
  }
  return { token };
}

async function chatByInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(token)) return null;
  const chat = (await getStore().list("chats", { invite_token: token } as never))[0];
  return chat && chat.kind === "group" && chat.invite_token === token ? chat : null;
}

export async function invitePreview(token: string, viewerId: string | null) {
  const chat = await chatByInvite(token);
  if (!chat) throw new DomainError("This invite link was reset or doesn't exist.", 404);
  const members = await chatMembers(chat.id);
  return { name: chat.name ?? "Group", description: chat.description ?? "", count: members.length, member: !!viewerId && members.some((m) => m.person.id === viewerId), chat_id: chat.id };
}

export async function joinByInvite(token: string, personId: string) {
  const chat = await chatByInvite(token);
  if (!chat) throw new DomainError("This invite link was reset or doesn't exist.", 404);
  const store = getStore();
  const [existing] = await store.list("chat_members", { chat_id: chat.id, person_id: personId });
  if (existing) return { id: chat.id };
  if ((await store.list("chat_members", { chat_id: chat.id })).length >= 1024) throw new DomainError("This group is full.");
  await store.insert("chat_members", { id: randomUUID(), chat_id: chat.id, person_id: personId, role: "member", last_read_at: null, last_delivered_at: null, joined_at: stamp() });
  await postMessage(chat.id, null, "system", `${await nameOf(personId)} joined using the invite link`);
  return { id: chat.id };
}

// ── Typing, online and last seen ─────────────────────────────────────────────

/** "typing…": a nudge straight to the others' phones. Nothing is stored. */
export async function typing(chatId: string, personId: string) {
  await membership(chatId, personId);
  for (const m of await getStore().list("chat_members", { chat_id: chatId })) {
    if (m.person_id !== personId) hub().publish(m.person_id, { typing: chatId, who: personId });
  }
}

const lastTouch = new Map<string, number>();
/** Called while a phone has the app open (its realtime connection), at most once a minute. */
export async function touchPresence(personId: string, force = false) {
  const now = Date.now();
  if (!force && now - (lastTouch.get(personId) ?? 0) < 55_000) return;
  lastTouch.set(personId, now);
  await getStore().update("people", personId, { last_seen_at: new Date(now).toISOString() }).catch(() => undefined);
}

export async function setPrivacy(personId: string, b: { hide_last_seen?: unknown; read_receipts_off?: unknown }) {
  const patch: { hide_last_seen?: boolean; read_receipts_off?: boolean } = {};
  if (typeof b.hide_last_seen === "boolean") patch.hide_last_seen = b.hide_last_seen;
  if (typeof b.read_receipts_off === "boolean") patch.read_receipts_off = b.read_receipts_off;
  const p = await getStore().update("people", personId, patch);
  return { hide_last_seen: !!p.hide_last_seen, read_receipts_off: !!p.read_receipts_off };
}
