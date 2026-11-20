import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DatingProfile, TableName, Tables } from "../types";
import type { CandidateFilter, Store } from "./index";

/** Supabase returns at most 1,000 rows per request, so reads page through everything. */
const PAGE = 1000;

/**
 * Production store on Supabase Postgres. It runs only on the server with the
 * service-role key, because the app enforces access in src/lib/domain.ts.
 * RLS is still enabled on every table (see supabase/migrations) so a leaked
 * anon key can't read anything.
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  private fail(op: string, table: string, error: { message: string } | null): never {
    throw new Error(`Supabase ${op} on ${table} failed: ${error?.message ?? "unknown error"}`);
  }

  async list<T extends TableName>(table: T, match?: Partial<Tables[T]>) {
    const out: Tables[T][] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.db.from(table).select("*").order("id").range(from, from + PAGE - 1);
      if (match) q = q.match(match as Record<string, unknown>);
      const { data, error } = await q;
      if (error) this.fail("list", table, error);
      out.push(...((data ?? []) as Tables[T][]));
      if (!data || data.length < PAGE) return out;
    }
  }

  async listIn<T extends TableName>(table: T, column: keyof Tables[T] & string, values: string[]) {
    if (values.length === 0) return [];
    const out: Tables[T][] = [];
    // Keep each request's URL short, and page each chunk.
    for (let i = 0; i < values.length; i += 200) {
      const chunk = values.slice(i, i + 200);
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.db.from(table).select("*").in(column, chunk as never).order("id").range(from, from + PAGE - 1);
        if (error) this.fail("listIn", table, error);
        out.push(...((data ?? []) as Tables[T][]));
        if (!data || data.length < PAGE) break;
      }
    }
    return out;
  }

  async listContaining<T extends TableName>(table: T, column: keyof Tables[T] & string, value: string) {
    const { data, error } = await this.db.from(table).select("*").contains(column, [value]).limit(PAGE);
    if (error) this.fail("listContaining", table, error);
    return (data ?? []) as Tables[T][];
  }

  async candidates(f: CandidateFilter, page: number, pageSize: number) {
    let q = this.db.from("dating_profiles").select("*")
      .in("gender", f.genders).gt("birthdate", f.bornAfter).lte("birthdate", f.bornBefore)
      .eq("paused", false).is("removed_at", null);
    if (f.box) {
      const b = f.box;
      q = q.or(`lat.is.null,and(lat.gte.${b.minLat},lat.lte.${b.maxLat},lng.gte.${b.minLng},lng.lte.${b.maxLng})`);
    }
    const { data, error } = await q.order("updated_at", { ascending: false }).order("id").range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) this.fail("candidates", "dating_profiles", error);
    return (data ?? []) as DatingProfile[];
  }

  async get<T extends TableName>(table: T, id: string) {
    const { data, error } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail("get", table, error);
    return (data as Tables[T] | null) ?? null;
  }

  async insert<T extends TableName>(table: T, row: Tables[T]) {
    const { data, error } = await this.db.from(table).insert(row).select().single();
    if (error) this.fail("insert", table, error);
    return data as Tables[T];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    const { data, error } = await this.db.from(table).update(patch as never).eq("id", id).select().single();
    if (error) this.fail("update", table, error);
    return data as Tables[T];
  }

  async remove<T extends TableName>(table: T, id: string) {
    const { error } = await this.db.from(table).delete().eq("id", id);
    if (error) this.fail("remove", table, error);
  }
}
