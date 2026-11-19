import type { Job, TableName, Tables } from "@/lib/types";
import { matchesWhere, type ListOptions, type Store } from "./store";
import { uid, nowIso } from "@/lib/util";

/**
 * In-memory store used ONLY in DEMO MODE. All rows here are fictional seed data or
 * data typed into the demo. It is never written to the production database.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private tables = new Map<TableName, Map<string, Record<string, unknown>>>();

  private t(table: TableName) {
    let m = this.tables.get(table);
    if (!m) {
      m = new Map();
      this.tables.set(table, m);
    }
    return m;
  }

  reset() {
    this.tables.clear();
  }

  async list<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<Tables[T][]> {
    let rows = [...this.t(table).values()].filter((r) => matchesWhere(r as unknown as Tables[T], opts)) as unknown as Tables[T][];
    if (opts?.order) {
      const { column, ascending = true } = opts.order;
      rows.sort((a, b) => {
        const x = (a as unknown as Record<string, unknown>)[column] as string | number | null;
        const y = (b as unknown as Record<string, unknown>)[column] as string | number | null;
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return rows.map((r) => structuredClone(r));
  }

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    const r = this.t(table).get(id);
    return r ? (structuredClone(r) as unknown as Tables[T]) : null;
  }

  async insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
    const now = nowIso();
    const r = { created_at: now, updated_at: now, ...row, id: (row as { id?: string }).id ?? uid() } as Record<string, unknown>;
    if (this.t(table).has(r.id as string)) throw new Error(`duplicate key ${table}.${r.id}`);
    this.t(table).set(r.id as string, structuredClone(r));
    return r as unknown as Tables[T];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]> {
    const cur = this.t(table).get(id);
    if (!cur) throw new Error(`${table}.${id} not found`);
    const next = { ...cur, ...structuredClone(patch), id, updated_at: nowIso() };
    this.t(table).set(id, next);
    return structuredClone(next) as unknown as Tables[T];
  }

  async upsert<T extends TableName>(table: T, row: Partial<Tables[T]> & { id: string }): Promise<Tables[T]> {
    if (this.t(table).has(row.id)) return this.update(table, row.id, row);
    return this.insert(table, row);
  }

  async remove(table: TableName, id: string): Promise<void> {
    this.t(table).delete(id);
  }

  async count<T extends TableName>(table: T, opts?: ListOptions<Tables[T]>): Promise<number> {
    return (await this.list(table, { ...opts, limit: undefined })).length;
  }

  async claimEvent(id: string, source: string): Promise<boolean> {
    const m = this.t("processed_events");
    if (m.has(id)) return false;
    m.set(id, { id, source, created_at: nowIso() });
    return true;
  }

  async claimJobs(limit: number, staleLockMs: number): Promise<Job[]> {
    // JS is single-threaded: this whole function runs without interleaving, so it is atomic.
    const jobs = [...this.t("jobs").values()] as unknown as Job[];
    const now = Date.now();
    const busyKeys = new Set(
      jobs
        .filter((j) => j.status === "running" && j.locked_at && now - Date.parse(j.locked_at) < staleLockMs)
        .map((j) => j.key),
    );
    const runnable = jobs
      .filter(
        (j) =>
          (j.status === "queued" ||
            (j.status === "running" && j.locked_at && now - Date.parse(j.locked_at) >= staleLockMs)) &&
          Date.parse(j.run_at) <= now,
      )
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    const picked: Job[] = [];
    for (const j of runnable) {
      if (picked.length >= limit) break;
      if (busyKeys.has(j.key)) continue;
      busyKeys.add(j.key);
      const updated = { ...j, status: "running" as const, locked_at: nowIso(), attempts: j.attempts + 1, updated_at: nowIso() };
      this.t("jobs").set(j.id, updated as unknown as Record<string, unknown>);
      picked.push(structuredClone(updated));
    }
    return picked;
  }
}
