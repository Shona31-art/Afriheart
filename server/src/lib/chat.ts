import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, findOrCreatePerson, normalizePhone } from "./domain";
import * as M from "./plan-machine";
import type { Chat, ChatMember, Message, MessageKind, Person, PlanBundle, Response } from "./types";

// ── Clock ────────────────────────────────────────────────────────────────────
// Message cursors use timestamps, so they must never repeat within a process.
let last = 0;
export function stamp(): string {
  const now = Math.max(Date.now(), last + 1);
  last = now;
  return new Date(now).toISOString();
}

// ── Chats ────────────────────────────────────────────────────────────────────

export async function membership(chatId: string, personId: string): Promise<{ chat: Chat; member: ChatMember }> {
  const store = getStore();
  const chat = await store.get("chats", chatId);
  const [member] = chat ? await store.list("chat_members", { chat_id: chatId, person_id: personId }) : [];
  if (!chat || !member) throw new DomainError("That chat isn't available.");
  return { chat, member };
}

async function addMember(chatId: string, personId: string, role: ChatMember["role"]) {
  const store = getStore();
  const [existing] = await store.list("chat_members", { chat_id: chatId, person_id: personId });
  if (existing) return existing;
  return store.insert("chat_members", {
    id: randomUUID(), chat_id: chatId, person_id: personId, role, last_read_at: null, last_delivered_at: null, joined_at: stamp(),
  });
}

/** Someone not on Afriheart yet becomes a placeholder; signing in with that number claims it. */
async function personByPhone(phone: string, name?: string): Promise<Person> {
  const n = normalizePhone(phone);
  if (!n) throw new DomainError(`"${phone}" doesn't look like a phone number.`);
  return findOrCreatePerson({ name: name?.trim() || `+${n}`, phone: n, isGuest: true });
}

export async function openDirectChat(personId: string, phone: string, name?: string): Promise<Chat> {
  const other = await personByPhone(phone, name);
  if (other.id === personId) throw new DomainError("That's your own number.");
  const { isBlockedBetween } = await import("./dating");
  if (await isBlockedBetween(personId, other.id)) throw new DomainError("You can't message this number.");
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const chats = await store.listIn("chats", "id", mine.map((m) => m.chat_id));
  for (const chat of chats.filter((c) => c.kind === "direct" && c.origin !== "match")) {
    const [theirs] = await store.list("chat_members", { chat_id: chat.id, person_id: other.id });
    if (theirs) return chat;
  }
  const at = stamp();
  const chat = await store.insert("chats", { id: randomUUID(), kind: "direct", name: null, created_by: personId, created_at: at, last_message_at: at });
  await addMember(chat.id, personId, "admin");
  await addMember(chat.id, other.id, "admin");
  return chat;
}

export async function createGroup(personId: string, name: string, phones: string[]): Promise<Chat> {
  const title = name.trim().slice(0, 60);
  if (!title) throw new DomainError("Give the group a name.");
  const people = await Promise.all(phones.filter((p) => p.trim()).map((p) => personByPhone(p)));
  const at = stamp();
  const store = getStore();
  const chat = await store.insert("chats", { id: randomUUID(), kind: "group", name: title, created_by: personId, created_at: at, last_message_at: at });
  await addMember(chat.id, personId, "admin");
  for (const p of people) if (p.id !== personId) await addMember(chat.id, p.id, "member");
  const me = await store.get("people", personId);
  await postMessage(chat.id, null, "system", `${me?.name ?? "Someone"} created the group "${title}"`);
  return chat;
}

export async function addToGroup(chatId: string, personId: string, phones: string[]) {
  const { chat, member } = await membership(chatId, personId);
  if (chat.kind !== "group") throw new DomainError("You can only add people to a group.");
  if (member.role !== "admin") throw new DomainError("Only group admins can add people.");
  const store = getStore();
  const me = await store.get("people", personId);
  for (const phone of phones.filter((p) => p.trim())) {
    const p = await personByPhone(phone);
    await addMember(chatId, p.id, "member");
    await postMessage(chatId, null, "system", `${me?.name ?? "Someone"} added ${p.name}`);
  }
}

export async function leaveGroup(chatId: string, personId: string) {
  const { chat, member } = await membership(chatId, personId);
  if (chat.kind !== "group") throw new DomainError("You can't leave a direct chat.");
  const me = await getStore().get("people", personId);
  await getStore().remove("chat_members", member.id);
  await postMessage(chatId, null, "system", `${me?.name ?? "Someone"} left`);
}

export async function chatMembers(chatId: string) {
  const store = getStore();
  const members = await store.list("chat_members", { chat_id: chatId });
  const people = await store.listIn("people", "id", members.map((m) => m.person_id));
  const byId = new Map(people.map((p) => [p.id, p]));
  return members.map((m) => ({ member: m, person: byId.get(m.person_id)! })).filter((x) => x.person);
}

export function chatTitle(chat: Chat, members: { person: Person }[], viewerId: string): string {
  if (chat.kind === "group") return chat.name ?? "Group";
  return members.find((m) => m.person.id !== viewerId)?.person.name ?? "Chat";
}

function preview(m: Message, senderName: string | null, viewerId: string): string {
  const who = m.sender_id === viewerId ? "You: " : senderName && m.kind !== "call" ? `${senderName.split(" ")[0]}: ` : "";
  switch (m.kind) {
    case "image": return `${who}📷 Photo`;
    case "voice": return `${who}🎤 Voice note`;
    case "plan": return `📅 ${m.body}`;
    case "call": return m.body;
    case "encrypted": return `${who}🔒 Message`;
    case "like": return `${who}❤ Liked your profile`;
    default: return `${who}${m.body}`;
  }
}

export interface ChatSummary {
  id: string;
  kind: Chat["kind"];
  title: string;
  subtitle: string;
  last_message_at: string;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  marked_unread: boolean;
  other_person_id: string | null;
  /** The last message, still encrypted: the phone decrypts it for the preview. */
  last_cipher: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
}

/** Chat list, newest first. Also records that the viewer's phone received everything. */
export async function listChats(personId: string): Promise<ChatSummary[]> {
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const chats = await store.listIn("chats", "id", mine.map((m) => m.chat_id));
  const all = await store.listIn("messages", "chat_id", chats.map((c) => c.id));
  const at = stamp();
  const out: ChatSummary[] = [];
  for (const chat of chats) {
    const members = await chatMembers(chat.id);
    const me = mine.find((m) => m.chat_id === chat.id)!;
    const raw = all.filter((m) => m.chat_id === chat.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const msgs = (await visibleTo(personId, me, await purgeExpired(chat.id, raw), chat.kind)).filter((m) => !m.meta);
    const lastMsg = msgs[msgs.length - 1];
    // "Delete chat": gone from the list until someone writes again.
    if (me.hidden_at && (!lastMsg || lastMsg.created_at <= me.hidden_at)) continue;
    const sender = lastMsg?.sender_id ? members.find((m) => m.person.id === lastMsg.sender_id)?.person.name ?? null : null;
    out.push({
      id: chat.id,
      kind: chat.kind,
      title: chatTitle(chat, members, personId),
      subtitle: lastMsg ? preview(lastMsg, sender, personId) : chat.kind === "group" ? `${members.length} people` : "Say hi 👋",
      last_message_at: chat.last_message_at,
      unread: msgs.filter((m) => m.sender_id !== personId && m.kind !== "system" && (!me.last_read_at || m.created_at > me.last_read_at)).length,
      pinned: !!me.pinned_at,
      muted: isMuted(me),
      archived: !!me.archived,
      marked_unread: !!me.marked_unread,
      other_person_id: chat.kind === "direct" ? members.find((m) => m.person.id !== personId)?.person.id ?? null : null,
      last_cipher: lastMsg?.kind === "encrypted" ? lastMsg.cipher : null,
      last_sender_id: lastMsg?.sender_id ?? null,
      last_sender_name: sender,
    });
    if (!me.last_delivered_at || (lastMsg && lastMsg.created_at > me.last_delivered_at)) {
      await store.update("chat_members", me.id, { last_delivered_at: at });
    }
  }
  // Pinned chats first (most recently pinned on top), then newest.
  const pinnedAt = new Map(mine.map((m) => [m.chat_id, m.pinned_at ?? ""]));
  return out.sort((a, b) => (pinnedAt.get(b.id) ?? "").localeCompare(pinnedAt.get(a.id) ?? "") || b.last_message_at.localeCompare(a.last_message_at));
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function postMessage(chatId: string, senderId: string | null, kind: MessageKind, body: string,
  extra: Partial<Pick<Message, "media_path" | "media_ms" | "plan_id" | "call_id" | "cipher" | "awaiting" | "meta" | "target_id">> = {}): Promise<Message> {
  const store = getStore();
  const at = stamp();
  const chat = await store.get("chats", chatId);
  // Disappearing messages: everything new (except system notes) gets an expiry.
  const secs = kind !== "system" && !extra.meta ? chat?.disappear_secs ?? null : null;
  const msg = await store.insert("messages", {
    id: randomUUID(), chat_id: chatId, sender_id: senderId, kind, body: body.slice(0, 4000),
    media_path: extra.media_path ?? null, media_ms: extra.media_ms ?? null, plan_id: extra.plan_id ?? null,
    call_id: extra.call_id ?? null, cipher: extra.cipher ?? null, awaiting: extra.awaiting ?? [], created_at: at, updated_at: null,
    meta: extra.meta ?? null, target_id: extra.target_id ?? null, opened_by: [],
    expires_at: secs ? new Date(Date.parse(at) + secs * 1000).toISOString() : null,
  });
  // Reactions, edits and votes don't move the chat up the list.
  if (!extra.meta) await store.update("chats", chatId, { last_message_at: at });
  if (senderId) {
    const [me] = await store.list("chat_members", { chat_id: chatId, person_id: senderId });
    if (me && !extra.meta) await store.update("chat_members", me.id, { last_read_at: at, last_delivered_at: at, hidden_at: null });
  }
  if (kind !== "system" && kind !== "call" && (!extra.meta || extra.meta === "react")) await notifyMembers(msg);
  return msg;
}

/** Muted until a time in the future (or always). */
export const isMuted = (m: Pick<ChatMember, "muted_until">, now = new Date().toISOString()) => !!m.muted_until && m.muted_until > now;

/** Pop-ups on members' Android phones when the app is closed. */
async function notifyMembers(msg: Message) {
  const { pushMessage } = await import("./push");
  const store = getStore();
  const chat = await store.get("chats", msg.chat_id);
  if (!chat) return;
  const members = await chatMembers(msg.chat_id);
  const sender = msg.sender_id ? members.find((m) => m.person.id === msg.sender_id)?.person.name ?? "Someone" : "Afriheart";
  // Encrypted messages: the server can't see what they say, so neither can the pop-up.
  const text = msg.meta === "react" ? "Reacted to your message" : msg.kind === "encrypted" ? "🔒 New message" : msg.kind === "plan" ? `📅 New plan: ${msg.body}` : msg.body;
  const title = chat.kind === "group" ? chat.name ?? "Group" : sender;
  const body = chat.kind === "group" && msg.sender_id ? `${sender.split(" ")[0]}: ${text}` : text;
  // A reaction only tells the person whose message it was.
  let to = members.filter((m) => m.person.id !== msg.sender_id && !isMuted(m.member));
  if (msg.meta === "react") {
    const target = msg.target_id ? await store.get("messages", msg.target_id) : null;
    to = to.filter((m) => m.person.id === target?.sender_id);
  }
  if (to.length) pushMessage(to.map((m) => m.person.id), msg.chat_id, title, body);
}

export async function companionPlan(chatId: string, personId: string, spark: string) {
  const { createPlanFromSpark } = await import("./domain");
  if (spark.trim().length < 3) {
    await postMessage(chatId, null, "companion", "Tell me what you want to make happen, e.g. \"@afri braai on Saturday\".");
    return null;
  }
  const plan = await createPlanFromSpark(personId, spark, null, chatId);
  await postMessage(chatId, null, "plan", plan.title, { plan_id: plan.id });
  return plan;
}

/** Like WhatsApp: "Delete for everyone" works for about two days after sending. */
export const DELETE_FOR_EVERYONE_MS = 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;

export async function deleteMessage(chatId: string, personId: string, messageId: string) {
  await membership(chatId, personId);
  const store = getStore();
  const msg = await store.get("messages", messageId);
  if (!msg || msg.chat_id !== chatId || msg.sender_id !== personId || msg.meta) throw new DomainError("You can only delete your own messages.");
  if (Date.now() - Date.parse(msg.created_at) > DELETE_FOR_EVERYONE_MS) throw new DomainError("It's too late to delete this for everyone. You can still delete it for yourself.");
  await purgeMessage(msg, "This message was deleted");
}

/** Removes a message's content, its encrypted file and its reactions, edits and votes. */
export async function purgeMessage(msg: Message, note: string | null) {
  const store = getStore();
  if (msg.media_path) {
    const { deleteOwnedMedia } = await import("./media");
    await deleteOwnedMedia(msg.media_path).catch(() => undefined);
  }
  for (const h of (await store.list("messages", { chat_id: msg.chat_id })).filter((m) => m.target_id === msg.id)) await store.remove("messages", h.id);
  for (const st of await store.list("stars", { message_id: msg.id })) await store.remove("stars", st.id);
  if (note === null) await store.remove("messages", msg.id);
  else await store.update("messages", msg.id, { kind: "system", body: note, media_path: null, media_ms: null, cipher: null, updated_at: stamp() });
}

/** Disappearing messages that have run out are deleted for good. */
export async function purgeExpired(chatId: string, messages: Message[]): Promise<Message[]> {
  const now = new Date().toISOString();
  const gone = messages.filter((m) => m.expires_at && m.expires_at <= now);
  for (const m of gone) await purgeMessage(m, null).catch(() => undefined);
  if (!gone.length) return messages;
  const ids = new Set(gone.map((m) => m.id));
  return messages.filter((m) => !ids.has(m.id) && !(m.target_id && ids.has(m.target_id)));
}

/** What this person sees of a chat's messages: without ones they deleted for themselves or cleared. */
async function visibleTo(personId: string, member: ChatMember, messages: Message[], kind: Chat["kind"]): Promise<Message[]> {
  const hidden = new Set((await getStore().list("message_hides", { person_id: personId, chat_id: member.chat_id })).map((h) => h.message_id));
  // Like WhatsApp, someone added to a group sees messages from when they joined (older ones weren't encrypted for them anyway).
  const from = kind === "group" ? member.joined_at : null;
  return messages.filter((m) => !hidden.has(m.id) && !(m.target_id && hidden.has(m.target_id))
    && (!member.cleared_at || m.created_at > member.cleared_at) && (!from || m.created_at >= from));
}

export async function markRead(chatId: string, personId: string) {
  const { member } = await membership(chatId, personId);
  const at = stamp();
  await getStore().update("chat_members", member.id, { last_read_at: at, last_delivered_at: at, marked_unread: false });
}

export interface PlanCard {
  id: string;
  slug: string;
  title: string;
  state: string;
  organiser: string;
  is_organiser: boolean;
  deadline: string | null;
  options: { id: string; what: string; where: string; starts_at: string; cost: number | null; votes: number; mine: boolean }[];
  counts: Record<Response, number>;
  my_response: Response | null;
  locked: { what: string; where: string; starts_at: string } | null;
  can_check_in: boolean;
  checked_in: number;
  checked_in_me: boolean;
}

export function planCard(b: PlanBundle, viewerId: string, organiserName: string): PlanCard {
  const locked = M.lockedOption(b);
  const tally = new Map(M.tally(b).map((t) => [t.option.id, t.votes]));
  return {
    id: b.plan.id, slug: b.plan.slug, title: b.plan.title, state: b.plan.state, organiser: organiserName,
    is_organiser: b.plan.organiser_id === viewerId, deadline: b.plan.decision_deadline,
    options: b.options.map((o) => ({
      id: o.id, what: o.what, where: o.where_name, starts_at: o.starts_at, cost: o.est_cost_per_person,
      votes: tally.get(o.id) ?? 0, mine: b.votes.some((v) => v.option_id === o.id && v.person_id === viewerId),
    })),
    counts: { in: M.respondents(b, "in").length, maybe: M.respondents(b, "maybe").length, out: M.respondents(b, "out").length },
    my_response: b.commitments.find((c) => c.person_id === viewerId)?.response ?? null,
    locked: locked ? { what: locked.what, where: locked.where_name, starts_at: locked.starts_at } : null,
    can_check_in: M.canCheckIn(b, viewerId, new Date()),
    checked_in: b.checkins.length,
    checked_in_me: b.checkins.some((c) => c.person_id === viewerId),
  };
}

export interface ThreadData {
  chat: {
    id: string; kind: Chat["kind"]; title: string; is_admin: boolean; is_match: boolean; is_double: boolean;
    description: string; disappear_secs: number | null; admins_only_send: boolean; admins_only_info: boolean;
    can_send: boolean; can_edit_info: boolean; muted: boolean; pinned: boolean; archived: boolean;
  };
  members: { id: string; name: string; phone: string; role: ChatMember["role"] }[];
  messages: (Message & { sender_name: string | null; status: "sent" | "delivered" | "read" | null })[];
  /** Messages I starred. */
  starred: string[];
  /** Direct chats: whether the other person is online, or when they were last seen (null if either hides it). */
  presence: { online: boolean; last_seen: string | null } | null;
  plans: Record<string, PlanCard>;
  active_call: { id: string; kind: "voice" | "video"; participants: number } | null;
  server_time: string;
}

/** Messages after a cursor (or the latest 150), with ticks, live plan cards and any call in progress. */
export async function thread(chatId: string, personId: string, after?: string): Promise<ThreadData> {
  // Taken before reading, so a change that lands while we read is picked up next time, never skipped.
  const asOf = stamp();
  const { chat, member } = await membership(chatId, personId);
  const store = getStore();
  const members = await chatMembers(chatId);
  const others = members.filter((m) => m.person.id !== personId).map((m) => m.member);
  const all = await visibleTo(personId, member, await purgeExpired(chatId, (await store.list("messages", { chat_id: chatId })).sort((a, b) => a.created_at.localeCompare(b.created_at))), chat.kind);
  const visible = all.filter((m) => !m.meta);
  // Plan cards and ticks change after a message is sent, so a refresh re-sends the recent window.
  let messages = after
    ? visible.filter((m) => m.created_at >= after || (m.updated_at && m.updated_at >= after) || m.plan_id || m.sender_id === personId).slice(-150)
    : visible.slice(-150);
  // Reactions, edits and votes for the messages being sent (or any new ones).
  const ids = new Set(messages.map((m) => m.id));
  const windowIds = new Set(visible.slice(-150).map((m) => m.id));
  messages = [...messages, ...all.filter((m) => m.meta && m.target_id && (after ? m.created_at >= after || ids.has(m.target_id) : windowIds.has(m.target_id)))];
  const names = new Map(members.map((m) => [m.person.id, m.person.name]));
  const me = members.find((m) => m.person.id === personId)?.person;
  // Read receipts off (direct chats): no blue ticks either way.
  const noReceipts = chat.kind === "direct" && (me?.read_receipts_off || members.some((m) => m.person.id !== personId && m.person.read_receipts_off));
  const status = (m: Message) => {
    if (m.sender_id !== personId || others.length === 0 || m.meta) return null;
    if (!noReceipts && others.every((o) => o.last_read_at && o.last_read_at >= m.created_at)) return "read" as const;
    if (others.every((o) => o.last_delivered_at && o.last_delivered_at >= m.created_at)) return "delivered" as const;
    return "sent" as const;
  };

  const { getBundleBySlug } = await import("./domain");
  const plans: Record<string, PlanCard> = {};
  for (const id of new Set(messages.map((m) => m.plan_id).filter((x): x is string => !!x))) {
    const plan = await store.get("plans", id);
    const b = plan && (await getBundleBySlug(plan.slug));
    if (b) plans[id] = planCard(b, personId, names.get(b.plan.organiser_id) ?? "Someone");
  }
  const calls = (await store.list("calls", { chat_id: chatId })).filter((c) => c.state !== "ended");
  // Only record "delivered" when someone else sent something new: no database write on every check.
  const newest = messages.filter((m) => m.sender_id && m.sender_id !== personId).at(-1);
  if (newest && (!member.last_delivered_at || newest.created_at > member.last_delivered_at)) {
    await store.update("chat_members", member.id, { last_delivered_at: stamp() });
  }
  const isAdmin = member.role === "admin";
  const other = chat.kind === "direct" ? members.find((m) => m.person.id !== personId)?.person : undefined;
  const presence = other ? presenceOf(other, me) : null;
  const starred = (await store.list("stars", { person_id: personId, chat_id: chatId })).map((x) => x.message_id);
  return {
    chat: {
      id: chat.id, kind: chat.kind, title: chatTitle(chat, members, personId), is_admin: isAdmin, is_match: chat.origin === "match", is_double: chat.origin === "double",
      description: chat.description ?? "", disappear_secs: chat.disappear_secs ?? null,
      admins_only_send: !!chat.admins_only_send, admins_only_info: !!chat.admins_only_info,
      can_send: chat.kind !== "group" || !chat.admins_only_send || isAdmin,
      can_edit_info: chat.kind !== "group" || !chat.admins_only_info || isAdmin,
      muted: isMuted(member), pinned: !!member.pinned_at, archived: !!member.archived,
    },
    starred,
    presence,
    // Dating matches never see each other's phone numbers.
    members: members.map((m) => ({ id: m.person.id, name: m.person.name, phone: (chat.origin === "match" || chat.origin === "double") && m.person.id !== personId ? "" : m.person.phone, role: m.member.role })),
    messages: messages.map((m) => ({ ...m, sender_name: m.sender_id ? names.get(m.sender_id) ?? "Someone" : null, status: status(m) })),
    plans,
    active_call: calls[0] ? { id: calls[0].id, kind: calls[0].kind, participants: calls[0].participants.length } : null,
    server_time: asOf,
  };
}

/** Seen within this long = "online" (phones refresh their realtime connection every minute). */
export const ONLINE_MS = 75_000;

/** "online" / "last seen": hidden if either person hides theirs. */
export function presenceOf(other: Person, viewer: Person | undefined): { online: boolean; last_seen: string | null } | null {
  if (other.hide_last_seen || viewer?.hide_last_seen || !other.last_seen_at || other.is_guest) return null;
  return { online: Date.now() - Date.parse(other.last_seen_at) < ONLINE_MS, last_seen: other.last_seen_at };
}

/** The companion speaks in a plan's chat, if it has one. */
export async function announce(chatId: string | null, text: string) {
  if (chatId) await postMessage(chatId, null, "companion", text);
}

export async function unreadTotal(personId: string): Promise<number> {
  return (await listChats(personId)).reduce((n, c) => n + c.unread, 0);
}
