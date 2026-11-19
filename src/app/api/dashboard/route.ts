import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dashboardStats, parseFilters } from "@/lib/stats";
import { integrationStatuses } from "@/lib/integrations";
import { queueStats } from "@/lib/queue";
import { dataMode } from "@/lib/env";

export const GET = route(async (req) => {
  await requireUser(["admin", "manager"]);
  const [stats, integrations, queue] = await Promise.all([dashboardStats(parseFilters(req.nextUrl.searchParams)), integrationStatuses(), queueStats()]);
  return json({ ...stats, integrations: integrations.map((i) => ({ id: i.id, name: i.name, mode: i.mode, lastError: i.lastError, lastSuccessAt: i.lastSuccessAt, lastWebhookAt: i.lastWebhookAt })), queue, mode: dataMode() });
});
