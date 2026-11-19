import { describe, it, expect } from "vitest";
import { KeyedMutex, Semaphore, BackpressureError } from "@/lib/queue/mutex";
import { sleep } from "@/lib/util";

describe("KeyedMutex", () => {
  it("serialises same key, parallelises different keys", async () => {
    const m = new KeyedMutex();
    const log: string[] = [];
    const task = (k: string, i: number, ms: number) => m.run(k, async () => { log.push(`${k}${i}:start`); await sleep(ms); log.push(`${k}${i}:end`); });
    const t0 = Date.now();
    await Promise.all([task("A", 1, 60), task("A", 2, 10), task("B", 1, 60)]);
    const elapsed = Date.now() - t0;
    expect(log.indexOf("A1:end")).toBeLessThan(log.indexOf("A2:start")); // order kept per customer
    expect(log.indexOf("B1:start")).toBeLessThan(log.indexOf("A1:end")); // B not blocked by A
    expect(elapsed).toBeLessThan(130);
  });
  it("continues after a failure", async () => {
    const m = new KeyedMutex();
    await expect(m.run("k", async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(m.run("k", async () => 5)).resolves.toBe(5);
  });
});

describe("Semaphore", () => {
  it("bounds concurrency and applies backpressure", async () => {
    const s = new Semaphore(2, 1);
    let active = 0, peak = 0;
    const job = () => s.use(async () => { active++; peak = Math.max(peak, active); await sleep(30); active--; });
    const p = [job(), job(), job()];
    await expect(job()).rejects.toBeInstanceOf(BackpressureError);
    await Promise.all(p);
    expect(peak).toBe(2);
  });
});
