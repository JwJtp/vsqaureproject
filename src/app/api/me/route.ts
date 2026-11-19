import { route, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { dataMode } from "@/lib/env";
import { aiMode } from "@/lib/ai/agent";
import { whatsappMode } from "@/lib/whatsapp";
import { getStore } from "@/lib/db";

export const GET = route(async () => {
  const user = await getSessionUser();
  const mode = dataMode();
  const store = await getStore();
  const executives = mode === "demo" ? (await store.list("executives", { where: { active: true } })).map((e) => ({ id: e.id, name: e.name })) : [];
  return json({ user, mode, ai: await aiMode(), whatsapp: await whatsappMode(), executives });
});
