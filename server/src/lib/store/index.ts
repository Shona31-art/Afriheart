import "server-only";
import type { DatingProfile, Gender, TableName, Tables } from "../types";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import { withNudges } from "../realtime";

/**
 * A deliberately small storage contract. Domain logic (src/lib/domain.ts) is written
 * against this, so the same code runs on the local JSON file and on Supabase Postgres.
 */
export interface Store {
  readonly kind: "local" | "supabase";
  list<T extends TableName>(table: T, match?: Partial<Tables[T]>): Promise<Tables[T][]>;
  listIn<T extends TableName>(table: T, column: keyof Tables[T] & string, values: string[]): Promise<Tables[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  insert<T extends TableName>(table: T, row: Tables[T]): Promise<Tables[T]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  /** Rows whose array column contains a value (e.g. the profile that owns a photo). */
  listContaining<T extends TableName>(table: T, column: keyof Tables[T] & string, value: string): Promise<Tables[T][]>;
  /** A page of dating profiles that could show in Discover, filtered in the database. The caller applies the exact rules. */
  candidates(filter: CandidateFilter, page: number, pageSize: number): Promise<DatingProfile[]>;
}

export interface CandidateFilter {
  genders: Gender[];
  /** Born after this date (YYYY-MM-DD): no older than my maximum age. */
  bornAfter: string;
  /** Born on or before this date: at least my minimum age. */
  bornBefore: string;
  /** A box around me (km radius already converted); people without a location are always included. */
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
}

// One store per server process. Kept on globalThis because Next.js can load this
// module more than once (route handlers and server actions are bundled
// separately), and two local stores writing the same file would lose updates.
const g = globalThis as unknown as { __commonStore?: Store };

export function getStore(): Store {
  if (g.__commonStore) return g.__commonStore;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    g.__commonStore = withNudges(new SupabaseStore(url, key));
  } else {
    // The local JSON file is for development. In production it would sit on a disk
    // that hosting providers wipe, losing everyone's data, so refuse to use it
    // unless someone has deliberately chosen it (ALLOW_LOCAL_STORE=yes).
    const building = process.env.NEXT_PHASE === "phase-production-build";
    if (process.env.NODE_ENV === "production" && !building && process.env.ALLOW_LOCAL_STORE !== "yes") {
      throw new Error("No database configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ALLOW_LOCAL_STORE=yes for a single server with a persistent disk).");
    }
    g.__commonStore = withNudges(new LocalStore(process.env.LOCAL_DB_PATH || ".data/common.json"));
  }
  return g.__commonStore;
}
