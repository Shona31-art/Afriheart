import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { stamp } from "./chat";
import { DevicesChanged, type PublicDevice } from "./devices";
import type { Device, StatusUpdate } from "./types";

// Status updates: text or a photo that lasts 24 hours, for the people you chat with
// one-to-one (your contacts on Afriheart, not dating matches). Like messages, they're
// end-to-end encrypted on the phone for each of those people's devices.

const DAY_MS = 24 * 3600_000;
const MAX_ACTIVE = 30;
const MAX_ENVELOPE_BYTES = 200_000;
export const statusChatId = (personId: string) => `status:${personId}`;

/** Who sees my status: people I have a one-to-one contacts chat with (not matches, not blocked). */
export async function audience(personId: string): Promise<{ person_id: string; chat_id: string }[]> {
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const chats = (await store.listIn("chats", "id", mine.map((m) => m.chat_id))).filter((c) => c.kind === "direct" && (c.origin ?? "contacts") === "contacts");
  const members = await store.listIn("chat_members", "chat_id", chats.map((c) => c.id));
  const { isBlockedBetween } = await import("./dating");
  const out = new Map<string, string>();
  for (const m of members) {
    if (m.person_id === personId || out.has(m.person_id)) continue;
    if (await isBlockedBetween(personId, m.person_id)) continue;
    out.set(m.person_id, m.chat_id);
  }
  return [...out.entries()].map(([person_id, chat_id]) => ({ person_id, chat_id }));
}

const pub = (d: Device): PublicDevice => ({ id: d.id, person_id: d.person_id, enc_pub: d.enc_pub, sig_pub: d.sig_pub, created_at: d.created_at, label: d.label, revoked: !!d.revoked_at });

/** The devices a new status must be encrypted for: mine and my contacts'. */
export async function statusDevices(personId: string): Promise<PublicDevice[]> {
  const people = [personId, ...(await audience(personId)).map((a) => a.person_id)];
  return (await getStore().listIn("devices", "person_id", people)).filter((d) => !d.revoked_at).map(pub);
}

export async function postStatus(personId: string, raw: unknown, media: unknown): Promise<StatusUpdate> {
  const store = getStore();
  const text = JSON.stringify(raw ?? null);
  if (text.length > MAX_ENVELOPE_BYTES) throw new DomainError("That status is too big.");
  const e = raw as { v?: number; chat?: string; sd?: string; keys?: Record<string, unknown>; ct?: string; sig?: string };
  if (e?.v !== 1 || e.chat !== statusChatId(personId) || typeof e.ct !== "string" || typeof e.sig !== "string" || !e.keys || typeof e.sd !== "string") {
    throw new DomainError("Status updates must be end-to-end encrypted.");
  }
  const sender = await store.get("devices", e.sd);
  if (!sender || sender.person_id !== personId || sender.revoked_at) throw new DomainError("This device isn't registered. Reload the app.");
  const expected = (await statusDevices(personId)).map((d) => d.id).sort().join(",");
  if (Object.keys(e.keys).sort().join(",") !== expected) throw new DevicesChanged("devices_changed");
  const now = new Date().toISOString();
  const active = (await store.list("statuses", { person_id: personId })).filter((s) => s.expires_at > now);
  if (active.length >= MAX_ACTIVE) throw new DomainError(`You can have up to ${MAX_ACTIVE} status updates at a time.`);
  let path: string | null = null;
  if (typeof media === "string" && media) {
    const f = await store.get("media_files", media);
    if (!f || f.owner_id !== personId || !media.startsWith(`status-${personId}/`)) throw new DomainError("That photo isn't available.");
    path = f.id;
  }
  const at = stamp();
  const row = await store.insert("statuses", { id: randomUUID(), person_id: personId, cipher: text, media_path: path, created_at: at, expires_at: new Date(Date.parse(at) + DAY_MS).toISOString() });
  // Let contacts' phones know (their chat list shows the new status ring).
  const { hub } = await import("./realtime");
  for (const a of await audience(personId)) hub().publish(a.person_id, { chat: a.chat_id });
  return row;
}

async function purge(rows: StatusUpdate[]) {
  const now = new Date().toISOString();
  const store = getStore();
  const { deleteOwnedMedia } = await import("./media");
  for (const s of rows.filter((r) => r.expires_at <= now)) {
    if (s.media_path) await deleteOwnedMedia(s.media_path).catch(() => undefined);
    for (const v of await store.list("status_views", { status_id: s.id })) await store.remove("status_views", v.id);
    await store.remove("statuses", s.id);
  }
  return rows.filter((r) => r.expires_at > now);
}

export interface StatusFeed {
  mine: { id: string; cipher: string; created_at: string; views: { name: string; at: string }[] }[];
  others: { person_id: string; name: string; chat_id: string; unseen: number; latest: string; items: { id: string; cipher: string; created_at: string; seen: boolean }[] }[];
}

export async function statusFeed(personId: string): Promise<StatusFeed> {
  const store = getStore();
  const contacts = await audience(personId); // the same people whose status I can see (it's mutual)
  const all = await purge(await store.listIn("statuses", "person_id", [personId, ...contacts.map((c) => c.person_id)]));
  const views = await store.listIn("status_views", "status_id", all.map((s) => s.id));
  const people = new Map((await store.listIn("people", "id", [...new Set([...contacts.map((c) => c.person_id), ...views.map((v) => v.person_id)])])).map((p) => [p.id, p]));
  const byTime = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);
  const mine = all.filter((s) => s.person_id === personId).sort(byTime).map((s) => ({
    id: s.id, cipher: s.cipher, created_at: s.created_at,
    views: views.filter((v) => v.status_id === s.id).map((v) => ({ name: people.get(v.person_id)?.name ?? "Someone", at: v.created_at })),
  }));
  const others: StatusFeed["others"] = [];
  for (const c of contacts) {
    // Their status is only for me if I'm in their audience too (always true: chats are shared), and they're still not blocked.
    const items = all.filter((s) => s.person_id === c.person_id).sort(byTime).map((s) => ({ id: s.id, cipher: s.cipher, created_at: s.created_at, seen: views.some((v) => v.status_id === s.id && v.person_id === personId) }));
    if (!items.length) continue;
    others.push({ person_id: c.person_id, name: people.get(c.person_id)?.name ?? "Someone", chat_id: c.chat_id, unseen: items.filter((i) => !i.seen).length, latest: items.at(-1)!.created_at, items });
  }
  others.sort((a, b) => (a.unseen ? 0 : 1) - (b.unseen ? 0 : 1) || b.latest.localeCompare(a.latest));
  return { mine, others };
}

async function visibleStatus(personId: string, id: string) {
  const s = await getStore().get("statuses", id);
  if (!s || s.expires_at <= new Date().toISOString()) throw new DomainError("This status has gone.", 404);
  if (s.person_id !== personId && !(await audience(s.person_id)).some((a) => a.person_id === personId)) throw new DomainError("This status has gone.", 404);
  return s;
}

export async function viewStatus(personId: string, id: string) {
  const s = await visibleStatus(personId, id);
  if (s.person_id === personId) return;
  const store = getStore();
  if ((await store.list("status_views", { status_id: id, person_id: personId })).length) return;
  await store.insert("status_views", { id: randomUUID(), status_id: id, person_id: personId, created_at: stamp() });
}

export async function deleteStatus(personId: string, id: string) {
  const s = await getStore().get("statuses", id);
  if (!s || s.person_id !== personId) throw new DomainError("Not found.", 404);
  await purge([{ ...s, expires_at: new Date(0).toISOString() }]);
}

/** Can this person load a status photo stored in "status-<owner>/…"? */
export async function canSeeStatusMedia(viewerId: string, folder: string) {
  const owner = folder.slice("status-".length);
  if (owner === viewerId) return true;
  return (await audience(owner)).some((a) => a.person_id === viewerId);
}

export async function deleteStatusesOf(personId: string) {
  const store = getStore();
  for (const s of await store.list("statuses", { person_id: personId })) await purge([{ ...s, expires_at: new Date(0).toISOString() }]);
  for (const v of await store.list("status_views", { person_id: personId })) await store.remove("status_views", v.id);
}
