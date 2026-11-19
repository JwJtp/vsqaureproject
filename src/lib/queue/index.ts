import "server-only";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { syslog } from "@/lib/log";
import { Semaphore, BackpressureError } from "./mutex";
import { withTimeout, nowIso } from "@/lib/util";
import type { Job } from "@/lib/types";

export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
const handlers = new Map<string, JobHandler>();
export function registerJobHandler(type: string, h: JobHandler) {
  handlers.set(type, h);
}

const g = globalThis as unknown as {
  __vsSem?: Semaphore;
  __vsWorker?: { running: boolean; again: boolean; processed: number; failed: number; lastRunAt: string | null; current: Promise<unknown> | null };
};
function worker() {
  return (g.__vsWorker ??= { running: false, again: false, processed: 0, failed: 0, lastRunAt: null, current: null });
}

export async function aiSemaphore(): Promise<Semaphore> {
  const s = await getSettings();
  const max = Math.max(1, s.concurrency.maxConcurrentConversations);
  if (!g.__vsSem) g.__vsSem = new Semaphore(max, s.concurrency.maxQueueDepth);
  g.__vsSem.max = max; // live-reconfigurable
  g.__vsSem.maxQueue = s.concurrency.maxQueueDepth;
  return g.__vsSem;
}

/** Durable enqueue. Rejects with 429 when the backlog exceeds the configured depth (backpressure). */
export async function enqueue(type: string, key: string, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number } = {}) {
  const store = await getStore();
  const s = await getSettings();
  const backlog = await store.count("jobs", { where: { status: ["queued", "running"] } });
  if (backlog >= s.concurrency.maxQueueDepth) {
    await syslog("warn", "queue", `Backpressure: backlog ${backlog} >= ${s.concurrency.maxQueueDepth}`);
    throw new BackpressureError("System busy — please retry shortly");
  }
  return store.insert("jobs", {
    type,
    key,
    payload,
    status: "queued",
    attempts: 0,
    max_attempts: opts.maxAttempts ?? s.concurrency.maxAttempts,
    run_at: (opts.runAt ?? new Date()).toISOString(),
    locked_at: null,
    last_error: null,
  });
}

function backoffMs(attempt: number) {
  return Math.min(60_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
}

async function runOne(job: Job, timeoutMs: number) {
  const store = await getStore();
  const h = handlers.get(job.type);
  try {
    if (!h) throw Object.assign(new Error(`No handler for job type ${job.type}`), { permanent: true });
    await withTimeout(h(job.payload, job), timeoutMs, `job ${job.type}`);
    await store.update("jobs", job.id, { status: "done", locked_at: null, last_error: null });
    worker().processed++;
  } catch (e) {
    const err = e as Error & { permanent?: boolean; retryable?: boolean };
    worker().failed++;
    const dead = err.permanent || job.attempts >= job.max_attempts;
    await store.update("jobs", job.id, {
      status: dead ? "dead" : "queued",
      locked_at: null,
      last_error: err.message.slice(0, 1000),
      run_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
    });
    await syslog(dead ? "error" : "warn", "queue", `Job ${job.type} ${dead ? "failed permanently" : "will retry"}: ${err.message}`, { job_id: job.id, attempts: job.attempts });
  }
}

/**
 * Process runnable jobs until none remain or the time budget is used.
 * - Per-key ordering comes from claimJobs (one running job per conversation).
 * - Parallelism across customers is bounded by the AI semaphore.
 */
export async function runWorker(opts: { budgetMs?: number } = {}): Promise<{ started: boolean; processed: number }> {
  const w = worker();
  if (w.running) {
    // A run is already in progress on this instance: ask it to loop again and wait for it.
    w.again = true;
    await w.current;
    return { started: false, processed: w.processed };
  }
  w.running = true;
  const run = runLoop(w, opts);
  w.current = run;
  return run;
}

async function runLoop(w: ReturnType<typeof worker>, opts: { budgetMs?: number }) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 25_000;
  try {
    do {
      w.again = false;
      const store = await getStore();
      const s = await getSettings();
      const sem = await aiSemaphore();
      const inflight = new Set<Promise<void>>();
      while (Date.now() - started < budget) {
        const free = Math.max(0, sem.max - inflight.size);
        if (!free) {
          await Promise.race(inflight);
          continue;
        }
        const jobs = await store.claimJobs(free, s.concurrency.staleLockMs);
        if (!jobs.length) {
          if (!inflight.size) break;
          await Promise.race(inflight); // a finishing job may unblock the next message for that customer
          continue;
        }
        for (const job of jobs) {
          const p: Promise<void> = sem.use(() => runOne(job, s.concurrency.jobTimeoutMs)).finally(() => inflight.delete(p));
          inflight.add(p);
        }
      }
      await Promise.all(inflight);
    } while (w.again && Date.now() - started < budget);
  } finally {
    w.running = false;
    w.lastRunAt = nowIso();
  }
  return { started: true, processed: w.processed };
}

/** Fire-and-forget worker kick (used after webhooks). Errors are logged, never thrown. */
export function kickWorker() {
  runWorker().catch((e) => syslog("error", "queue", `Worker crashed: ${(e as Error).message}`));
}

export async function queueStats() {
  const store = await getStore();
  const sem = await aiSemaphore();
  const [queued, running, dead] = await Promise.all([
    store.count("jobs", { where: { status: "queued" } }),
    store.count("jobs", { where: { status: "running" } }),
    store.count("jobs", { where: { status: "dead" } }),
  ]);
  const w = worker();
  return { queued, running, dead, aiSlotsInUse: sem.inUse, aiSlotsMax: sem.max, aiWaiting: sem.waiting, processed: w.processed, failed: w.failed, lastRunAt: w.lastRunAt };
}
