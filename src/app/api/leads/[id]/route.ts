import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, assertLeadAccess, HttpError, isStaffAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { activity, audit } from "@/lib/log";
import { LEAD_STATUSES, PROPERTY_TYPES, type Lead } from "@/lib/types";
import { cancelFollowUps, scheduleFollowUp } from "@/lib/followups";
import { scoreLead } from "@/lib/ai/score";
import { nowIso } from "@/lib/util";

type P = { params: Promise<{ id: string }> };

export const GET = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const store = await getStore();
  const lead = await store.get("leads", id);
  if (!lead) throw new HttpError(404, "Lead not found");
  assertLeadAccess(user, lead);
  const [conversations, notes, activities, assignments, visits, tasks, consents, execs, projects] = await Promise.all([
    store.list("conversations", { where: { lead_id: id }, order: { column: "created_at" } }),
    store.list("notes", { where: { lead_id: id }, order: { column: "created_at", ascending: false } }),
    store.list("activities", { where: { lead_id: id }, order: { column: "created_at", ascending: false } }),
    store.list("assignments", { where: { lead_id: id }, order: { column: "created_at", ascending: false } }),
    store.list("site_visits", { where: { lead_id: id }, order: { column: "scheduled_at" } }),
    store.list("follow_up_tasks", { where: { lead_id: id }, order: { column: "due_at" } }),
    store.list("consents", { where: { lead_id: id }, order: { column: "created_at", ascending: false } }),
    store.list("executives"),
    store.list("projects"),
  ]);
  const messages = conversations.length ? await store.list("messages", { where: { conversation_id: conversations.map((c) => c.id) }, order: { column: "created_at" } }) : [];
  const duplicates = lead.phone ? (await store.list("leads", { where: { phone: lead.phone } })).filter((l) => l.id !== id).map((l) => ({ id: l.id, created_at: l.created_at, status: l.status })) : [];
  const execName = new Map(execs.map((e) => [e.id, e.name]));
  return json({
    lead,
    executive: execs.find((e) => e.id === lead.assigned_executive_id) ?? null,
    conversations,
    messages,
    notes,
    activities,
    assignments: assignments.map((a) => ({ ...a, executive_name: a.executive_id ? execName.get(a.executive_id) ?? null : null })),
    visits,
    tasks,
    consents,
    duplicates,
    matchedProjects: projects.filter((p) => lead.matched_project_ids.includes(p.id)),
  });
});

const Patch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  name: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  property_type: z.enum(PROPERTY_TYPES).nullable().optional(),
  preferred_location: z.string().max(120).nullable().optional(),
  budget_text: z.string().max(60).nullable().optional(),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  configuration: z.string().max(60).nullable().optional(),
  timeline: z.string().max(60).nullable().optional(),
  purpose: z.enum(["investment", "personal"]).nullable().optional(),
  deal_value: z.number().nonnegative().nullable().optional(),
  lost_reason: z.string().max(300).nullable().optional(),
  qualified: z.boolean().optional(),
  followUpAt: z.string().datetime().optional(),
});

export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const store = await getStore();
  const lead = await store.get("leads", id);
  if (!lead) throw new HttpError(404, "Lead not found");
  assertLeadAccess(user, lead);
  const body = Patch.parse(await req.json());
  if (body.deal_value !== undefined && !isStaffAdmin(user) && body.status !== "CONVERTED") throw new HttpError(403, "Only admins can edit deal value outside conversion");
  const { qualified, followUpAt, ...fields } = body;
  const patch: Partial<Lead> = { ...fields } as Partial<Lead>;
  if (patch.email === "") patch.email = null;
  const now = nowIso();
  if (qualified === true && lead.status === "NEW") Object.assign(patch, { status: "QUALIFIED", qualified_at: now });
  if (qualified === false) Object.assign(patch, { status: "LOST", lost_reason: body.lost_reason ?? "Marked unqualified" });
  if (patch.status === "CONTACTED" && !lead.contacted_at) patch.contacted_at = now;
  if (patch.status === "CONVERTED") patch.converted_at = now;
  if (patch.status && patch.status !== "NEW" && !lead.qualified_at) patch.qualified_at = now;
  const merged = { ...lead, ...patch };
  const sc = scoreLead(merged);
  const updated = await store.update("leads", id, { ...patch, score: sc.score, priority: sc.priority, score_reasons: sc.reasons });
  if (patch.status && patch.status !== lead.status) {
    await activity(id, "status_changed", `Status ${lead.status} → ${patch.status}`, user.email);
    if (["CONTACTED", "CONVERTED", "LOST"].includes(patch.status)) await cancelFollowUps(id, ["assigned_not_contacted", "awaiting_callback", "new_unassigned"]);
    if (["CONVERTED", "LOST"].includes(patch.status)) await cancelFollowUps(id);
  }
  if (followUpAt) {
    await scheduleFollowUp("later_follow_up", updated, updated.assigned_executive_id, { dueAt: new Date(followUpAt), title: `Follow up with ${updated.name ?? "customer"}` });
    if (updated.status !== "FOLLOW_UP" && !["CONVERTED", "LOST"].includes(updated.status)) await store.update("leads", id, { status: "FOLLOW_UP" });
  }
  await audit(user.email, "lead.update", "leads", id, { fields: Object.keys(body) });
  return json({ lead: await store.get("leads", id) });
});

/** Data deletion (right to erasure). Admin only; cascades in Postgres. */
export const DELETE = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin"]);
  const store = await getStore();
  for (const t of ["messages", "notes", "activities", "assignments", "site_visits", "follow_up_tasks", "consents", "notifications"] as const) {
    for (const r of await store.list(t, { where: { lead_id: id } as never })) await store.remove(t, r.id);
  }
  for (const c of await store.list("conversations", { where: { lead_id: id } })) await store.remove("conversations", c.id);
  await store.remove("leads", id);
  await audit(user.email, "lead.delete", "leads", id);
  return json({ deleted: true });
});
