import "server-only";
import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./store";
import type { TableName, Tables } from "./types";

// Realtime nudges.
//
// When something in a chat changes (a message, a read receipt, a plan vote, a
// call), everyone in that chat gets a tiny nudge: { chat } or { call }. Their
// phone then fetches the update the way it always has, so end-to-end
// encryption and access checks are untouched and a nudge reveals nothing but
// "something changed". Phones receive nudges over one Server-Sent Events
// connection (/api/events); polling stays on as a slow backup.
//
// With Supabase configured, nudges travel over Supabase Realtime broadcast so
// they reach phones connected to any server instance. Topics are an HMAC of
// the person's id, so they can't be guessed. Without Supabase (development, or
// a single server), they stay in memory.

/** typing + who: someone is typing in that chat (never stored, never fetched). */
export interface Nudge { chat?: string; call?: string; typing?: string; who?: string }
type Listener = (n: Nudge) => void;

interface Hub {
  publish(personId: string, n: Nudge): void;
  subscribe(personId: string, fn: Listener): () => void;
}

class MemoryHub implements Hub {
  private bus = new EventEmitter().setMaxListeners(0);
  publish(personId: string, n: Nudge) { this.bus.emit(personId, n); }
  subscribe(personId: string, fn: Listener) {
    this.bus.on(personId, fn);
    return () => { this.bus.off(personId, fn); };
  }
}

class SupabaseHub implements Hub {
  private db: SupabaseClient;
  private local = new MemoryHub(); // phones on this instance hear their own nudges straight away
  private channels = new Map<string, { ch: RealtimeChannel; count: number }>();
  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 50 } } });
  }
  private topic(personId: string) {
    const secret = process.env.SESSION_SECRET || "common-dev";
    return `p:${createHmac("sha256", secret).update(personId).digest("hex").slice(0, 32)}`;
  }
  publish(personId: string, n: Nudge) {
    this.local.publish(personId, n);
    // Sent over HTTP when this instance isn't subscribed to the topic; other instances deliver it to their phones.
    this.db.channel(this.topic(personId)).send({ type: "broadcast", event: "nudge", payload: { ...n, from: INSTANCE } })
      .catch((e) => console.error("[realtime] publish failed", e));
  }
  subscribe(personId: string, fn: Listener) {
    const off = this.local.subscribe(personId, fn);
    const t = this.topic(personId);
    let entry = this.channels.get(t);
    if (!entry) {
      const ch = this.db.channel(t).on("broadcast", { event: "nudge" }, ({ payload }) => {
        if (payload?.from !== INSTANCE) this.local.publish(personId, { chat: payload?.chat, call: payload?.call, typing: payload?.typing, who: payload?.who });
      });
      ch.subscribe();
      entry = { ch, count: 0 };
      this.channels.set(t, entry);
    }
    entry.count++;
    return () => {
      off();
      const e = this.channels.get(t);
      if (e && --e.count <= 0) {
        this.channels.delete(t);
        this.db.removeChannel(e.ch).catch(() => undefined);
      }
    };
  }
}

const INSTANCE = Math.random().toString(36).slice(2);
const g = globalThis as unknown as { __commonHub?: Hub };

export function hub(): Hub {
  if (g.__commonHub) return g.__commonHub;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__commonHub = url && key && process.env.REALTIME !== "memory" ? new SupabaseHub(url, key) : new MemoryHub();
  return g.__commonHub;
}

// ── Working out who to nudge after a write ───────────────────────────────────

/** Nudges for the same person and chat within 40 ms are sent once. */
const pending = new Map<string, Nudge>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function queue(personId: string, n: Nudge) {
  pending.set(`${personId}|${n.chat ?? ""}|${n.call ?? ""}`, n);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = [...pending.entries()];
    pending.clear();
    for (const [key, nudge] of batch) hub().publish(key.split("|")[0], nudge);
  }, 40);
}

async function nudgeChat(base: Store, chatId: string, extra: Nudge = {}, alsoPerson?: string) {
  const members = await base.list("chat_members", { chat_id: chatId });
  const people = new Set(members.map((m) => m.person_id));
  if (alsoPerson) people.add(alsoPerson); // e.g. someone who just left still needs their chat list updated
  for (const p of people) queue(p, { chat: chatId, ...extra });
}

const PLAN_CHILDREN = new Set<TableName>(["votes", "commitments", "plan_options", "checkins"]);

async function afterWrite<T extends TableName>(base: Store, table: T, row: Tables[T] | null) {
  if (!row) return;
  const r = row as unknown as Record<string, string | null>;
  switch (table) {
    case "messages": case "az_dates": case "matches": if (r.chat_id) await nudgeChat(base, r.chat_id); return;
    case "chat_members": if (r.chat_id) await nudgeChat(base, r.chat_id, {}, r.person_id ?? undefined); return;
    case "chats": await nudgeChat(base, r.id!); return;
    case "az_albums": await nudgeChat(base, r.id!); return;
    case "card_games": await nudgeChat(base, r.id!); return;
    case "couples": await nudgeChat(base, r.id!); return;
    case "couple_answers": if (r.chat_id) await nudgeChat(base, r.chat_id); return;
    case "calls": if (r.chat_id) await nudgeChat(base, r.chat_id, { call: r.id! }); return;
    case "call_signals": if (r.to_id) queue(r.to_id, { call: r.call_id! }); return;
    case "plans": if (r.chat_id) await nudgeChat(base, r.chat_id); return;
    case "devices": {
      // A new phone needs keys for messages already waiting for it: nudge everyone it chats with,
      // so their phones re-send those keys straight away.
      if (!r.person_id) return;
      for (const m of await base.list("chat_members", { person_id: r.person_id })) await nudgeChat(base, m.chat_id);
      return;
    }
    default:
      if (PLAN_CHILDREN.has(table) && r.plan_id) {
        const plan = await base.get("plans", r.plan_id);
        if (plan?.chat_id) await nudgeChat(base, plan.chat_id);
      }
  }
}

const WATCHED = new Set<TableName>(["messages", "az_dates", "matches", "chat_members", "chats", "az_albums", "calls", "call_signals", "plans", "devices", "card_games", "couples", "couple_answers", ...PLAN_CHILDREN]);

/** Wraps a store so writes to chat data nudge the people in that chat. A failed nudge never fails the write. */
export function withNudges(base: Store): Store {
  const after = <T extends TableName>(table: T, row: Tables[T] | null) => {
    if (!WATCHED.has(table)) return;
    afterWrite(base, table, row).catch((e) => console.error("[realtime] nudge failed", e));
  };
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "insert") return async <T extends TableName>(table: T, row: Tables[T]) => { const out = await target.insert(table, row); after(table, out); return out; };
      if (prop === "update") return async <T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) => { const out = await target.update(table, id, patch); after(table, out); return out; };
      if (prop === "remove") return async <T extends TableName>(table: T, id: string) => {
        const before = WATCHED.has(table) ? await target.get(table, id) : null;
        await target.remove(table, id);
        after(table, before);
      };
      return Reflect.get(target, prop, receiver);
    },
  });
}
