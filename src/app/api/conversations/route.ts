import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();
  const store = await getStore();
  const sp = req.nextUrl.searchParams;
  const [convs, leads, execs] = await Promise.all([
    store.list("conversations", { order: { column: "last_message_at", ascending: false } }),
    store.list("leads", user.role === "executive" ? { where: { assigned_executive_id: user.executiveId ?? "__none__" } } : undefined),
    store.list("executives"),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const execName = new Map(execs.map((e) => [e.id, e.name]));
  const filter = sp.get("filter") ?? "all";
  const q = sp.get("q")?.toLowerCase();
  const lastMsgs = await store.list("messages", { order: { column: "created_at", ascending: false }, limit: 3000 });
  const lastByConv = new Map<string, (typeof lastMsgs)[number]>();
  for (const m of lastMsgs) if (!lastByConv.has(m.conversation_id) && m.direction !== "internal") lastByConv.set(m.conversation_id, m);
  const rows = convs
    .filter((c) => leadById.has(c.lead_id))
    .map((c) => {
      const l = leadById.get(c.lead_id)!;
      const last = lastByConv.get(c.id);
      return {
        id: c.id, leadId: l.id, name: l.name, phone: l.phone, channel: c.channel, status: c.status, handler: c.handler, aiPaused: c.ai_paused,
        escalated: c.escalated, escalationReason: c.escalation_reason, processing: c.processing, lastMessageAt: c.last_message_at,
        lastMessage: last ? { body: last.body.slice(0, 120), direction: last.direction } : null, propertyType: l.property_type, budget: l.budget_text,
        location: l.preferred_location, priority: l.priority, score: l.score, leadStatus: l.status, executive: l.assigned_executive_id ? execName.get(l.assigned_executive_id) ?? null : null,
        isDemo: c.is_demo,
      };
    })
    .filter((r) => {
      if (filter === "ai") return r.handler === "ai" && !r.aiPaused;
      if (filter === "human") return r.handler === "human" || r.aiPaused;
      if (filter === "escalated") return r.escalated;
      if (filter === "active") return r.status === "active";
      return true;
    })
    .filter((r) => !q || [r.name, r.phone, r.location].some((v) => v?.toLowerCase().includes(q)));
  return json({ conversations: rows.slice(0, 300), total: rows.length });
});
