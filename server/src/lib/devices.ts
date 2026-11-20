import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { chatMembers, membership, postMessage, stamp } from "./chat";
import type { Device, Message, MessageMeta } from "./types";

// The server's part in end-to-end encryption: it keeps each device's PUBLIC
// keys, hands them to chat members, and stores envelopes it can't open.

const MAX_DEVICES = 5;
const MAX_ENVELOPE_BYTES = 200_000;
const RAW_P256 = /^[A-Za-z0-9+/]{86}[A-Za-z0-9+/=]{2}$/; // 65 bytes, base64

export class DevicesChanged extends DomainError {}

export async function registerDevice(personId: string, encPub: string, sigPub: string, label: string): Promise<Device> {
  if (!RAW_P256.test(encPub) || !RAW_P256.test(sigPub)) throw new DomainError("Invalid device keys.");
  const store = getStore();
  const active = (await store.list("devices", { person_id: personId })).filter((d) => !d.revoked_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  // The same phone asking again (it was closed or reloaded before it saved its id): same device.
  const same = active.find((d) => d.enc_pub === encPub && d.sig_pub === sigPub);
  if (same) return same;
  // Oldest devices make way, so a person can't be locked out by old phones.
  const { revokeSessions } = await import("./session");
  for (const old of active.slice(0, Math.max(0, active.length - (MAX_DEVICES - 1)))) {
    await store.update("devices", old.id, { revoked_at: new Date().toISOString() });
    await revokeSessions(personId, { deviceId: old.id });
  }
  return store.insert("devices", {
    id: randomUUID(), person_id: personId, enc_pub: encPub, sig_pub: sigPub,
    label: label.slice(0, 60) || "Phone", created_at: new Date().toISOString(), revoked_at: null,
  });
}

export async function revokeDevice(personId: string, deviceId: string) {
  const d = await getStore().get("devices", deviceId);
  if (!d || d.person_id !== personId) throw new DomainError("Not found.");
  if (!d.revoked_at) await getStore().update("devices", deviceId, { revoked_at: new Date().toISOString() });
  // Removing a linked device also signs it out.
  const { revokeSessions, getSession } = await import("./session");
  const mine = await getSession();
  await revokeSessions(personId, { deviceId, except: mine?.id });
}

export async function myDevices(personId: string) {
  return (await getStore().list("devices", { person_id: personId })).filter((d) => !d.revoked_at);
}

export type PublicDevice = Pick<Device, "id" | "person_id" | "enc_pub" | "sig_pub" | "created_at" | "label"> & { revoked: boolean };
const pub = (d: Device): PublicDevice => ({ id: d.id, person_id: d.person_id, enc_pub: d.enc_pub, sig_pub: d.sig_pub, created_at: d.created_at, label: d.label, revoked: !!d.revoked_at });

/** Every active device of every member: who a new message must be encrypted for. */
export async function chatDevices(chatId: string, viewerId: string): Promise<PublicDevice[]> {
  await membership(chatId, viewerId);
  const members = await chatMembers(chatId);
  const devices = await getStore().listIn("devices", "person_id", members.map((m) => m.person.id));
  return devices.filter((d) => !d.revoked_at).map(pub);
}

/** One device's public keys (also old ones, to check signatures on old messages), for people sharing a chat with it. */
export async function deviceKeys(deviceId: string, viewerId: string): Promise<PublicDevice> {
  const store = getStore();
  const d = await store.get("devices", deviceId);
  if (!d) throw new DomainError("Unknown device.");
  if (d.person_id !== viewerId) {
    const mine = new Set((await store.list("chat_members", { person_id: viewerId })).map((m) => m.chat_id));
    const theirs = await store.list("chat_members", { person_id: d.person_id });
    if (!theirs.some((m) => mine.has(m.chat_id))) throw new DomainError("Unknown device.");
  }
  return pub(d);
}

/**
 * Stores an encrypted message. The server can't read it, but it does check
 * that it came from one of the sender's own devices and that it was encrypted
 * for exactly the chat's current devices, so nobody is silently left out.
 */
async function checkEnvelope(chatId: string, personId: string, raw: unknown): Promise<{ text: string; awaiting: string[] }> {
  const text = JSON.stringify(raw ?? null);
  if (text.length > MAX_ENVELOPE_BYTES) throw new DomainError("That message is too big.");
  const e = raw as { v?: number; chat?: string; sd?: string; keys?: Record<string, unknown>; ct?: string; sig?: string };
  if (e?.v !== 1 || e.chat !== chatId || typeof e.ct !== "string" || typeof e.sig !== "string" || !e.keys || typeof e.sd !== "string") {
    throw new DomainError("Messages must be end-to-end encrypted.");
  }
  const sender = await getStore().get("devices", e.sd);
  if (!sender || sender.person_id !== personId || sender.revoked_at) throw new DomainError("This device isn't registered. Reload the app.");
  const expected = (await chatDevices(chatId, personId)).map((d) => d.id).sort();
  const got = Object.keys(e.keys).sort();
  if (expected.join(",") !== got.join(",")) throw new DevicesChanged("devices_changed");
  const members = await chatMembers(chatId);
  const withDevices = new Set((await chatDevices(chatId, personId)).map((d) => d.person_id));
  return { text, awaiting: members.map((m) => m.person.id).filter((id) => !withDevices.has(id)) };
}

/** Edits are allowed for 15 minutes after sending, like WhatsApp. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
const METAS = new Set<MessageMeta>(["react", "edit", "vote"]);

/**
 * Stores an encrypted message. Optional, visible to the server: `meta` + `target` for a reaction,
 * edit or poll vote on another message, and `media` for the encrypted file it carries (so the
 * file can be deleted with the message).
 */
export async function sendEncrypted(chatId: string, personId: string, raw: unknown, opts: { meta?: unknown; target?: unknown; media?: unknown } = {}): Promise<Message> {
  const { chat, member } = await membership(chatId, personId);
  if (chat.kind === "direct") {
    const { isBlockedBetween } = await import("./dating");
    const other = (await chatMembers(chatId)).find((m) => m.person.id !== personId);
    if (other && (await isBlockedBetween(personId, other.person.id))) throw new DomainError("You can't message this person.");
  }
  const store = getStore();
  let meta: MessageMeta | null = null;
  let target: Message | null = null;
  if (opts.meta != null) {
    if (typeof opts.meta !== "string" || !METAS.has(opts.meta as MessageMeta)) throw new DomainError("Unknown message type.");
    meta = opts.meta as MessageMeta;
    target = typeof opts.target === "string" ? await store.get("messages", opts.target) : null;
    if (!target || target.chat_id !== chatId || target.meta || target.kind !== "encrypted") throw new DomainError("That message isn't available any more.");
    if (meta === "edit") {
      if (target.sender_id !== personId) throw new DomainError("You can only edit your own messages.");
      if (Date.now() - Date.parse(target.created_at) > EDIT_WINDOW_MS) throw new DomainError("Messages can only be edited for 15 minutes after sending.");
    }
  }
  // Groups where only admins can send (reactions and votes still work).
  if (chat.kind === "group" && chat.admins_only_send && member.role !== "admin" && (!meta || meta === "edit")) {
    throw new DomainError("Only admins can send messages in this group.");
  }
  let media: string | null = null;
  if (typeof opts.media === "string" && opts.media) {
    const f = await store.get("media_files", opts.media);
    if (!f || f.owner_id !== personId || f.chat_id !== chatId) throw new DomainError("That file isn't available.");
    media = f.id;
  }
  const { text, awaiting } = await checkEnvelope(chatId, personId, raw);
  return postMessage(chatId, personId, "encrypted", "", { cipher: text, awaiting, meta, target_id: target?.id ?? null, media_path: media });
}

/** My messages that someone couldn't read yet but now can (they've set up a phone since). */
export async function pendingRekeys(personId: string) {
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const msgs = (await store.listIn("messages", "chat_id", mine.map((m) => m.chat_id)))
    .filter((m) => m.sender_id === personId && m.kind === "encrypted" && m.awaiting?.length);
  if (!msgs.length) return [];
  const waiting = [...new Set(msgs.flatMap((m) => m.awaiting))];
  const ready = new Set((await store.listIn("devices", "person_id", waiting)).filter((d) => !d.revoked_at).map((d) => d.person_id));
  return msgs.filter((m) => m.awaiting.some((p) => ready.has(p))).slice(0, 50).map((m) => ({ id: m.id, chat_id: m.chat_id, cipher: m.cipher! }));
}

/** The sender's phone re-encrypted one of its messages for everyone's current devices. */
export async function rekey(personId: string, messageId: string, raw: unknown) {
  const store = getStore();
  const msg = await store.get("messages", messageId);
  if (!msg || msg.sender_id !== personId || msg.kind !== "encrypted") throw new DomainError("Not found.");
  await membership(msg.chat_id, personId);
  const { text, awaiting } = await checkEnvelope(msg.chat_id, personId, raw);
  await store.update("messages", messageId, { cipher: text, awaiting, updated_at: stamp() });
}
