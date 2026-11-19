import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, assertLeadAccess, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { bookVisit, BookingError, confirmVisitToCustomer } from "@/lib/visits";

export const GET = route(async (req) => {
  const user = await requireUser();
  const store = await getStore();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const to = sp.get("to") ?? new Date(Date.now() + 60 * 86400000).toISOString();
  const visits = await store.list("site_visits", {
    where: user.role === "executive" ? { executive_id: user.executiveId ?? "__none__" } : {},
    gte: { scheduled_at: from }, lte: { scheduled_at: to }, order: { column: "scheduled_at" },
  });
  const [leads, execs, projects] = await Promise.all([store.list("leads"), store.list("executives"), store.list("projects")]);
  const L = new Map(leads.map((l) => [l.id, l]));
  const E = new Map(execs.map((e) => [e.id, e.name]));
  const Pn = new Map(projects.map((p) => [p.id, p.name]));
  return json({
    visits: visits.map((v) => ({ ...v, leadName: L.get(v.lead_id)?.name ?? null, leadPhone: L.get(v.lead_id)?.phone ?? null, executiveName: v.executive_id ? E.get(v.executive_id) ?? null : null, projectName: v.project_id ? Pn.get(v.project_id) ?? null : null })),
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const b = z.object({ leadId: z.string(), projectId: z.string().nullable().optional(), at: z.string().datetime(), notes: z.string().max(500).optional(), notifyCustomer: z.boolean().default(true) }).parse(await req.json());
  const store = await getStore();
  const lead = await store.get("leads", b.leadId);
  if (!lead) throw new HttpError(404, "Lead not found");
  assertLeadAccess(user, lead);
  try {
    const r = await bookVisit({ leadId: b.leadId, projectId: b.projectId ?? lead.matched_project_ids[0] ?? null, at: b.at, actor: user.email, notes: b.notes });
    if (b.notifyCustomer) {
      const conv = (await store.list("conversations", { where: { lead_id: lead.id }, order: { column: "last_message_at", ascending: false }, limit: 1 }))[0];
      await confirmVisitToCustomer(lead.id, r.when, r.project?.name ?? null, conv?.last_customer_message_at ?? null);
    }
    return json({ visit: r.visit }, 201);
  } catch (e) {
    if (e instanceof BookingError) return json({ error: e.message, alternatives: e.alternatives }, 409);
    throw e;
  }
});
