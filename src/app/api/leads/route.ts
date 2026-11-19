import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { filteredLeads, parseFilters } from "@/lib/stats";
import { getStore } from "@/lib/db";
import { ingestLead, LeadInputSchema } from "@/lib/leads";
import { assignLead } from "@/lib/assignment";

export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  let leads = await filteredLeads(parseFilters(sp), user);
  const q = sp.get("q")?.toLowerCase().trim();
  if (q) leads = leads.filter((l) => [l.name, l.phone, l.email, l.preferred_location, l.budget_text, l.configuration].some((v) => v?.toLowerCase().includes(q)));
  if (sp.get("unassigned") === "1") leads = leads.filter((l) => !l.assigned_executive_id && !["CONVERTED", "LOST"].includes(l.status));
  if (sp.get("priority")) leads = leads.filter((l) => l.priority === sp.get("priority"));
  const sort = sp.get("sort") ?? "created_at";
  if (sort === "score") leads.sort((a, b) => b.score - a.score);
  if (sort === "last_interaction_at") leads.sort((a, b) => (b.last_interaction_at ?? "").localeCompare(a.last_interaction_at ?? ""));
  const total = leads.length;
  const page = Math.max(1, +(sp.get("page") ?? 1));
  const size = Math.min(500, Math.max(1, +(sp.get("pageSize") ?? 50)));
  const store = await getStore();
  const execs = new Map((await store.list("executives")).map((e) => [e.id, e.name]));
  return json({
    total,
    page,
    pageSize: size,
    leads: leads.slice((page - 1) * size, page * size).map((l) => ({ ...l, executive_name: l.assigned_executive_id ? execs.get(l.assigned_executive_id) ?? null : null })),
  });
});

/** Manual lead entry (admin / manager). */
export const POST = route(async (req) => {
  const user = await requireUser(["admin", "manager"]);
  const body = await req.json();
  const input = LeadInputSchema.parse({ ...body, source: body.source ?? "manual" });
  const r = await ingestLead(input, user.email);
  let assigned = null;
  if (r.created && body.autoAssign !== false) assigned = (await assignLead(r.lead.id, { actor: user.email, executiveId: body.executiveId || undefined })).executive?.name ?? null;
  return json({ lead: r.lead, created: r.created, duplicate: r.duplicate, assignedTo: assigned }, r.created ? 201 : 200);
});
