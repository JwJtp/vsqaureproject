import "server-only";
import type { Store } from "./store";
import { MemoryStore } from "./memory-store";
import { SupabaseStore } from "./supabase-store";
import { env, isLiveData } from "@/lib/env";
import { seedDemo } from "@/lib/seed";

const g = globalThis as unknown as { __vsStore?: Store; __vsSeeded?: Promise<void> };

/**
 * Returns the active store. LIVE when Supabase credentials exist and APP_MODE != demo.
 * DEMO data lives only in the memory store, so demo and production data never mix.
 */
export async function getStore(): Promise<Store> {
  if (!g.__vsStore) {
    g.__vsStore = isLiveData()
      ? new SupabaseStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new MemoryStore();
  }
  if (g.__vsStore.kind === "memory") {
    if (!g.__vsSeeded) g.__vsSeeded = seedDemo(g.__vsStore);
    await g.__vsSeeded;
  }
  return g.__vsStore;
}

/** Demo only: wipe and reseed. */
export async function resetDemoStore() {
  const s = await getStore();
  if (s.kind !== "memory") throw new Error("Reset is only available in DEMO MODE");
  (s as MemoryStore).reset();
  g.__vsSeeded = seedDemo(s);
  await g.__vsSeeded;
}

/** Test helper: use a fresh memory store. */
export function __setStoreForTests(s: Store | undefined) {
  g.__vsStore = s;
  g.__vsSeeded = undefined;
}
