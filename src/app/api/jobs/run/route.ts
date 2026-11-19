import "@/lib/runtime";
import { route, json } from "@/lib/api";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { HttpError, getSessionUser } from "@/lib/auth";
import { runWorker } from "@/lib/queue";
import { runDueFollowUps } from "@/lib/followups";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { syslog } from "@/lib/log";

export const maxDuration = 60;

/**
 * Scheduler entry point. Call every minute from Vercel Cron, Supabase pg_cron or any external
 * cron with header `Authorization: Bearer <CRON_SECRET>`. Admins may also trigger it manually.
 */
async function handle(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const cronOk = !!env.CRON_SECRET && auth.startsWith("Bearer ") && safeEqual(auth.slice(7), env.CRON_SECRET);
  if (!cronOk) {
    const u = await getSessionUser();
    if (!u || u.role !== "admin") throw new HttpError(401, "Unauthorized");
  }
  const followups = await runDueFollowUps();
  const worker = await runWorker({ budgetMs: 45_000 });
  // Data retention (live DB only; demo memory resets on restart)
  const store = await getStore();
  if (store.kind === "supabase" && new Date().getUTCMinutes() === 0) {
    const s = await getSettings();
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await sb.rpc("apply_retention", { p_message_days: s.retention.messageRetentionDays, p_log_days: s.retention.logRetentionDays });
    if (error) await syslog("error", "retention", error.message);
  }
  return json({ followups, worker });
}

export const GET = route(async (req) => handle(req));
export const POST = route(async (req) => handle(req));
