import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Job, TableName, Tables } from "@/lib/types";
import type { ListOptions, Store } from "./store";

/**
 * LIVE MODE store. Uses the Supabase service-role key, which must only ever be used
 * server-side (this module is never imported by client components).
 * Row Level Security still protects the tables from direct browser access.
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private apply(q: any, opts?: ListOptions<any>) {
    if (!opts) return q;
    for (const [k, v] of Object.entries(opts.where ?? {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) q = q.in(k, v);
      else if (v === null) q = q.is(k, null);
      else q = q.eq(k, v);
    }
    for (const [k, v] of Object.entries(opts.gte ?? {})) if (v !== undefined) q = q.gte(k, v);
    for (const [k, v] of Object.entries(opts.lte ?? {})) if (v !== undefined) q = q.lte(k, v);
    return q;
  }

  async list<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<Tables[T][]> {
    let q = this.apply(this.db.from(table).select("*"), opts);
    if (opts?.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
    q = q.limit(opts?.limit ?? 5000);
    const { data, error } = await q;
    if (error) throw new Error(`[db] list ${table}: ${error.message}`);
    return (data ?? []) as Tables[T][];
  }

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    const { data, error } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[db] get ${table}: ${error.message}`);
    return (data as Tables[T]) ?? null;
  }

  async insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
    const { data, error } = await this.db.from(table).insert(row as never).select("*").single();
    if (error) throw new Error(`[db] insert ${table}: ${error.message}`);
    return data as Tables[T];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]> {
    const { data, error } = await this.db
      .from(table)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`[db] update ${table}: ${error.message}`);
    return data as Tables[T];
  }

  async upsert<T extends TableName>(table: T, row: Partial<Tables[T]> & { id: string }): Promise<Tables[T]> {
    const { data, error } = await this.db.from(table).upsert(row as never).select("*").single();
    if (error) throw new Error(`[db] upsert ${table}: ${error.message}`);
    return data as Tables[T];
  }

  async remove(table: TableName, id: string): Promise<void> {
    const { error } = await this.db.from(table).delete().eq("id", id);
    if (error) throw new Error(`[db] delete ${table}: ${error.message}`);
  }

  async count<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<number> {
    const q = this.apply(this.db.from(table).select("id", { count: "exact", head: true }), opts);
    const { count, error } = await q;
    if (error) throw new Error(`[db] count ${table}: ${error.message}`);
    return count ?? 0;
  }

  async claimEvent(id: string, source: string): Promise<boolean> {
    const { error } = await this.db.from("processed_events").insert({ id, source });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation => duplicate webhook
    throw new Error(`[db] claimEvent: ${error.message}`);
  }

  async claimJobs(limit: number, staleLockMs: number): Promise<Job[]> {
    // claim_jobs() uses FOR UPDATE SKIP LOCKED and per-key exclusion; see migrations.
    const { data, error } = await this.db.rpc("claim_jobs", { p_limit: limit, p_stale_seconds: Math.ceil(staleLockMs / 1000) });
    if (error) throw new Error(`[db] claim_jobs: ${error.message}`);
    return (data ?? []) as Job[];
  }
}
