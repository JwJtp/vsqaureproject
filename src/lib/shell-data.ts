import "server-only";
import { getSessionUser } from "@/lib/auth";
import { dataMode } from "@/lib/env";
import { aiMode } from "@/lib/ai/agent";
import { whatsappMode } from "@/lib/whatsapp";
import { getStore } from "@/lib/db";

export async function shellData() {
  const user = await getSessionUser();
  const mode = dataMode();
  const store = await getStore();
  const executives = mode === "demo" ? (await store.list("executives", { where: { active: true }, order: { column: "name" } })).map((e) => ({ id: e.id, name: e.name })) : [];
  return { user, mode, ai: await aiMode(), whatsapp: await whatsappMode(), executives };
}
