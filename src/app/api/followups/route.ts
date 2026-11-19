import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();
  const store = await getStore();
  const status = req.nextUrl.searchParams.get("status");
  const [tasks, rules, leads, execs] = await Promise.all([
    store.list("follow_up_tasks", {
      where: { ...(status ? { status: status as "pending" } : {}), ...(user.role === "executive" ? { executive_id: user.executiveId ?? "__none__" } : {}) },
      order: { column: "due_at" }, limit: 1000,
    }),
    store.list("follow_up_rules", { order: { column: "delay_minutes" } }),
    store.list("leads"),
    store.list("executives"),
  ]);
  const L = new Map(leads.map((l) => [l.id, l]));
  const E = new Map(execs.map((e) => [e.id, e.name]));
  const audit = user.role === "executive" ? [] : await store.list("activities", { where: { type: ["follow_up_executed", "follow_up_scheduled"] }, order: { column: "created_at", ascending: false }, limit: 50 });
  return json({
    tasks: tasks.map((t) => ({ ...t, leadName: L.get(t.lead_id)?.name ?? null, leadPhone: L.get(t.lead_id)?.phone ?? null, executiveName: t.executive_id ? E.get(t.executive_id) ?? null : null, overdue: t.status === "pending" && Date.parse(t.due_at) < Date.now() })),
    rules,
    history: audit,
  });
});
