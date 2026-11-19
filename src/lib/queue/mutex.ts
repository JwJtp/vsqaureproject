// In-process concurrency primitives (pure, unit-tested).

/** Runs tasks with the same key strictly one after another; different keys run in parallel. */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tail = prev.then(() => gate);
    this.tails.set(key, tail);
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  get activeKeys() {
    return this.tails.size;
  }
}

/** Counting semaphore with a bounded wait queue (backpressure). */
export class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(public max: number, public maxQueue = Infinity) {}

  get inUse() {
    return this.active;
  }
  get waiting() {
    return this.waiters.length;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return this.releaser();
    }
    if (this.waiters.length >= this.maxQueue) throw new BackpressureError(`Queue full (${this.waiters.length} waiting)`);
    await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    return this.releaser();
  }

  private releaser() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class BackpressureError extends Error {
  readonly status = 429;
}
