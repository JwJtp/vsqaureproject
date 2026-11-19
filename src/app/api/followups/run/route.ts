import "@/lib/runtime";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { runDueFollowUps } from "@/lib/followups";
import { audit } from "@/lib/log";

/** Manual trigger (admin). The scheduler normally runs this via /api/jobs/run. */
export const POST = route(async () => {
  const user = await requireUser(["admin", "manager"]);
  const r = await runDueFollowUps();
  await audit(user.email, "follow_ups.run_now", "follow_up_tasks", null, r);
  return json(r);
});
