import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DatingProfile, TableName, Tables } from "../types";
import type { CandidateFilter, Store } from "./index";
import { GUIDE_ITEMS } from "../guide";

type DB = { [K in TableName]: Tables[K][] };

const empty = (): DB => ({
  people: [],
  plans: [],
  plan_options: [],
  votes: [],
  commitments: [],
  checkins: [],
  circles: [],
  circle_members: [],
  companion_actions: [],
  memories: [],
  guide_items: GUIDE_ITEMS,
  chats: [],
  chat_members: [],
  messages: [],
  calls: [],
  call_signals: [],
  android_devices: [],
  phone_codes: [],
  sms_outbox: [],
  wa_signins: [],
  devices: [],
  dating_profiles: [],
  az_dates: [],
  az_albums: [],
  verifications: [],
  sessions: [],
  rate_limits: [],
  media_files: [],
  quizzes: [],
  quiz_responses: [],
  daily_picks: [],
  duos: [],
  duo_swipes: [],
  duo_matches: [],
  we_met: [],
  card_games: [],
  trial_claims: [],
  chat_lists: [],
  staff: [],
  support_tickets: [],
  support_messages: [],
  admin_audit: [],
  announcements: [],
  stars: [],
  message_hides: [],
  statuses: [],
  status_views: [],
  vouch_invites: [],
  vouches: [],
  couples: [],
  couple_answers: [],
  deal_interest: [],
  venue_leads: [],
  payments: [],
  memberships: [],
  swipes: [],
  matches: [],
  blocks: [],
  reports: [],
});

/**
 * Development store: one JSON file, serialised writes. Not for production
 * (serverless file systems are read-only and it does not scale) — set
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to switch to Postgres.
 */
export class LocalStore implements Store {
  readonly kind = "local" as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = path.resolve(file);
  }

  private async read(): Promise<DB> {
    try {
      const db = JSON.parse(await fs.readFile(this.file, "utf8")) as Partial<DB>;
      return { ...empty(), ...db, guide_items: db.guide_items?.length ? db.guide_items : GUIDE_ITEMS };
    } catch {
      return empty();
    }
  }

  private async write(db: DB) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, this.file);
  }

  /** Serialise read-modify-write cycles so concurrent requests can't clobber each other. */
  private mutate<R>(fn: (db: DB) => R): Promise<R> {
    const run = this.queue.then(async () => {
      const db = await this.read();
      const result = fn(db);
      await this.write(db);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list<T extends TableName>(table: T, match?: Partial<Tables[T]>) {
    await this.queue;
    const rows = (await this.read())[table] as Tables[T][];
    if (!match) return rows;
    const entries = Object.entries(match);
    return rows.filter((r) => entries.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
  }

  async listIn<T extends TableName>(table: T, column: keyof Tables[T] & string, values: string[]) {
    const set = new Set(values);
    return (await this.list(table)).filter((r) => set.has(String((r as unknown as Record<string, unknown>)[column])));
  }

  async listContaining<T extends TableName>(table: T, column: keyof Tables[T] & string, value: string) {
    return (await this.list(table)).filter((r) => {
      const v = (r as unknown as Record<string, unknown>)[column];
      return Array.isArray(v) && v.includes(value);
    });
  }

  async candidates(f: CandidateFilter, page: number, pageSize: number) {
    const rows = (await this.list("dating_profiles")).filter((p) =>
      f.genders.includes(p.gender) && p.birthdate > f.bornAfter && p.birthdate <= f.bornBefore && !p.paused && !p.removed_at
      && (!f.box || p.lat == null || p.lng == null
        || (p.lat >= f.box.minLat && p.lat <= f.box.maxLat && p.lng >= f.box.minLng && p.lng <= f.box.maxLng)));
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
    return rows.slice(page * pageSize, page * pageSize + pageSize) as DatingProfile[];
  }

  async get<T extends TableName>(table: T, id: string) {
    return (await this.list(table)).find((r) => (r as { id: string }).id === id) ?? null;
  }

  insert<T extends TableName>(table: T, row: Tables[T]) {
    return this.mutate((db) => {
      (db[table] as Tables[T][]).push(row);
      return row;
    });
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    return this.mutate((db) => {
      const rows = db[table] as Tables[T][];
      const i = rows.findIndex((r) => (r as { id: string }).id === id);
      if (i < 0) throw new Error(`${table} ${id} not found`);
      rows[i] = { ...rows[i], ...patch };
      return rows[i];
    });
  }

  remove<T extends TableName>(table: T, id: string) {
    return this.mutate((db) => {
      (db[table] as Tables[T][]) = (db[table] as Tables[T][]).filter((r) => (r as { id: string }).id !== id);
    });
  }
}
