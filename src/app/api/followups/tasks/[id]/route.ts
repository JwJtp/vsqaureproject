import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, HttpError, isStaffAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { activity } from "@/lib/log";

type P = { params: Promise<{ id: string }> };
export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const store = await getStore();
  const t = await store.get("follow_up_tasks", id);
  if (!t) throw new HttpError(404, "Task not found");
  if (!isStaffAdmin(user) && t.executive_id !== user.executiveId) throw new HttpError(403, "Not your task");
  const b = z.object({ status: z.enum(["done", "cancelled", "pending"]).optional(), dueAt: z.string().datetime().optional(), result: z.string().max(500).optional() }).parse(await req.json());
  const task = await store.update("follow_up_tasks", id, { ...(b.status ? { status: b.status } : {}), ...(b.dueAt ? { due_at: b.dueAt } : {}), ...(b.result ? { result: b.result } : {}) });
  await activity(t.lead_id, "follow_up_updated", `Task "${t.title}" ${b.status ?? "rescheduled"} by ${user.name}`, user.email);
  return json({ task });
});
