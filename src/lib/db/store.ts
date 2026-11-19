import type { Job, TableName, Tables } from "@/lib/types";

export type Where<T> = { [K in keyof T]?: T[K] | T[K][] | null };

export interface ListOptions<T> {
  where?: Where<T>;
  gte?: { [K in keyof T]?: string | number };
  lte?: { [K in keyof T]?: string | number };
  order?: { column: keyof T & string; ascending?: boolean };
  limit?: number;
}

/**
 * Storage abstraction. Two implementations:
 *  - MemoryStore: DEMO MODE only (seeded fictional data, never persisted to production)
 *  - SupabaseStore: LIVE MODE (PostgreSQL, service role, server-side only)
 */
export interface Store {
  readonly kind: "memory" | "supabase";
  list<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<Tables[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  upsert<T extends TableName>(table: T, row: Partial<Tables[T]> & { id: string }): Promise<Tables[T]>;
  remove(table: TableName, id: string): Promise<void>;
  count<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<number>;
  /** Insert an idempotency key. Returns false if it already existed (duplicate event). */
  claimEvent(id: string, source: string): Promise<boolean>;
  /**
   * Atomically claim runnable jobs. Never returns two jobs with the same key, and never
   * returns a job whose key already has a running job (per-customer ordering).
   */
  claimJobs(limit: number, staleLockMs: number): Promise<Job[]>;
}

export function matchesWhere<T>(row: T, opts?: ListOptions<T>): boolean {
  if (!opts) return true;
  const r = row as Record<string, unknown>;
  if (opts.where) {
    for (const [k, v] of Object.entries(opts.where)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        if (!v.includes(r[k] as never)) return false;
      } else if (v === null) {
        if (r[k] !== null && r[k] !== undefined) return false;
      } else if (r[k] !== v) return false;
    }
  }
  if (opts.gte) {
    for (const [k, v] of Object.entries(opts.gte)) {
      if (v === undefined) continue;
      const x = r[k];
      if (x === null || x === undefined || (x as string | number) < (v as string | number)) return false;
    }
  }
  if (opts.lte) {
    for (const [k, v] of Object.entries(opts.lte)) {
      if (v === undefined) continue;
      const x = r[k];
      if (x === null || x === undefined || (x as string | number) > (v as string | number)) return false;
    }
  }
  return true;
}
