import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";

type P = { params: Promise<{ id: string }> };
export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin", "manager"]);
  const b = z.object({
    delay_minutes: z.number().int().min(0).max(60 * 24 * 60).optional(),
    escalate_after_minutes: z.number().int().min(1).max(60 * 24 * 60).nullable().optional(),
    template: z.string().min(5).max(1000).optional(),
    respect_working_hours: z.boolean().optional(),
    active: z.boolean().optional(),
  }).parse(await req.json());
  const store = await getStore();
  const rule = await store.update("follow_up_rules", id, b);
  await audit(user.email, "follow_up_rule.update", "follow_up_rules", id, b);
  return json({ rule });
});
