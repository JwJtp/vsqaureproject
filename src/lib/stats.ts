import "server-only";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { Lead, SessionUser } from "@/lib/types";
import { startOfDayIso } from "@/lib/util";

export interface Filters {
  from?: string;
  to?: string;
  projectId?: string;
  source?: string;
  propertyType?: string;
  executiveId?: string;
  status?: string;
}

export function parseFilters(sp: URLSearchParams): Filters {
  const f: Filters = {};
  for (const k of ["from", "to", "projectId", "source", "propertyType", "executiveId", "status"] as const) {
    const v = sp.get(k);
    if (v) f[k] = v;
  }
  return f;
}

export async function filteredLeads(f: Filters, user?: SessionUser): Promise<Lead[]> {
  const store = await getStore();
  const leads = await store.list("leads", {
    where: {
      ...(f.source ? { source: f.source as Lead["source"] } : {}),
      ...(f.propertyType ? { property_type: f.propertyType as Lead["property_type"] } : {}),
      ...(f.status ? { status: f.status as Lead["status"] } : {}),
      ...(f.executiveId ? { assigned_executive_id: f.executiveId } : {}),
      ...(user?.role === "executive" ? { assigned_executive_id: user.executiveId ?? "__none__" } : {}),
    },
    ...(f.from || f.to ? { gte: f.from ? { created_at: new Date(f.from).toISOString() } : undefined, lte: f.to ? { created_at: new Date(Date.parse(f.to) + 86399999).toISOString() } : undefined } : {}),
    order: { column: "created_at", ascending: false },
  });
  return f.projectId ? leads.filter((l) => l.matched_project_ids.includes(f.projectId!)) : leads;
}

const dayKey = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
const ACTIVE_WINDOW_MS = 30 * 60000;

export async function dashboardStats(f: Filters) {
  const store = await getStore();
  const s = await getSettings();
  const tz = s.workingHours.timezone;
  const leads = await filteredLeads(f);
  const ids = new Set(leads.map((l) => l.id));
  const [convs, execs, projects, visits, tasks, activities, assignments] = await Promise.all([
    store.list("conversations"),
    store.list("executives"),
    store.list("projects"),
    store.list("site_visits"),
    store.list("follow_up_tasks", { where: { status: "pending" } }),
    store.list("activities", { order: { column: "created_at", ascending: false }, limit: 25 }),
    store.list("assignments"),
  ]);
  const now = Date.now();
  const todayStart = startOfDayIso(new Date(), tz);
  const myConvs = convs.filter((c) => ids.has(c.lead_id));
  const respTimes = leads.filter((l) => l.first_response_at).map((l) => (Date.parse(l.first_response_at!) - Date.parse(l.created_at)) / 1000).filter((x) => x >= 0 && x < 86400);
  const isQualified = (l: Lead) => l.status !== "NEW" && l.status !== "LOST" ? true : l.score >= s.assignment.qualifyThreshold;

  const kpis = {
    totalEnquiries: leads.length,
    todayEnquiries: leads.filter((l) => l.created_at >= todayStart).length,
    activeConversations: myConvs.filter((c) => c.processing || (c.status === "active" && c.last_message_at && now - Date.parse(c.last_message_at) < ACTIVE_WINDOW_MS)).length,
    aiHandled: myConvs.filter((c) => c.handler === "ai").length,
    qualifiedLeads: leads.filter(isQualified).length,
    unassignedLeads: leads.filter((l) => !l.assigned_executive_id && !["CONVERTED", "LOST"].includes(l.status)).length,
    assignedLeads: leads.filter((l) => !!l.assigned_executive_id).length,
    followUpsPending: tasks.filter((t) => ids.has(t.lead_id)).length,
    siteVisitsBooked: visits.filter((v) => ids.has(v.lead_id) && ["requested", "confirmed"].includes(v.status)).length,
    conversions: leads.filter((l) => l.status === "CONVERTED").length,
    lostLeads: leads.filter((l) => l.status === "LOST").length,
    avgFirstResponseSec: respTimes.length ? Math.round(respTimes.reduce((a, b) => a + b, 0) / respTimes.length) : null,
  };

  // trend (last 30 days or filter range)
  const days: string[] = [];
  const end = f.to ? Date.parse(f.to) : now;
  const start = f.from ? Date.parse(f.from) : end - 29 * 86400000;
  for (let t = start; t <= end + 1; t += 86400000) days.push(dayKey(new Date(t).toISOString(), tz));
  const byDay = new Map(days.map((d) => [d, { date: d, enquiries: 0, qualified: 0, converted: 0 }]));
  for (const l of leads) {
    const d = byDay.get(dayKey(l.created_at, tz));
    if (!d) continue;
    d.enquiries++;
    if (isQualified(l)) d.qualified++;
    if (l.status === "CONVERTED") d.converted++;
  }
  const countBy = (key: (l: Lead) => string | null) => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const k = key(l) ?? "unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const execPerf = execs.map((e) => {
    const mine = leads.filter((l) => l.assigned_executive_id === e.id);
    const rts = mine.filter((l) => l.assigned_at && l.contacted_at).map((l) => (Date.parse(l.contacted_at!) - Date.parse(l.assigned_at!)) / 60000);
    return {
      id: e.id,
      name: e.name,
      available: e.available && e.active,
      assigned: mine.length,
      open: mine.filter((l) => !["CONVERTED", "LOST"].includes(l.status)).length,
      contacted: mine.filter((l) => l.contacted_at).length,
      visits: visits.filter((v) => v.executive_id === e.id && ids.has(v.lead_id)).length,
      converted: mine.filter((l) => l.status === "CONVERTED").length,
      avgResponseMin: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null,
      todayAssigned: assignments.filter((a) => a.executive_id === e.id && a.created_at >= todayStart).length,
      capacity: e.daily_capacity,
    };
  });
  const reached = (statuses: Lead["status"][]) => leads.filter((l) => statuses.includes(l.status)).length;
  const funnel = [
    { stage: "Enquiries", value: leads.length },
    { stage: "Qualified", value: leads.filter(isQualified).length },
    { stage: "Assigned", value: leads.filter((l) => l.assigned_executive_id).length },
    { stage: "Contacted", value: reached(["CONTACTED", "FOLLOW_UP", "SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "NEGOTIATION", "CONVERTED"]) },
    { stage: "Site visit", value: reached(["SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "NEGOTIATION", "CONVERTED"]) },
    { stage: "Converted", value: reached(["CONVERTED"]) },
  ];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const allLeadsById = new Map((await store.list("leads")).map((l) => [l.id, l]));
  const execName = new Map(execs.map((e) => [e.id, e.name]));
  const recentConversations = myConvs
    .filter((c) => c.last_message_at)
    .sort((a, b) => (b.last_message_at! > a.last_message_at! ? 1 : -1))
    .slice(0, 8)
    .map((c) => {
      const l = leadById.get(c.lead_id)!;
      return { id: c.id, leadId: l.id, name: l.name ?? (l.phone ? `+${l.phone}` : "Website visitor"), channel: c.channel, handler: c.handler, processing: c.processing, escalated: c.escalated, priority: l.priority, lastMessageAt: c.last_message_at, propertyType: l.property_type };
    });
  const upcomingVisits = visits
    .filter((v) => ids.has(v.lead_id) && ["requested", "confirmed"].includes(v.status) && Date.parse(v.scheduled_at) >= now - 3600000)
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : 1))
    .slice(0, 8)
    .map((v) => ({ ...v, leadName: allLeadsById.get(v.lead_id)?.name ?? "—", projectName: v.project_id ? projectName.get(v.project_id) ?? "—" : "—", executiveName: v.executive_id ? execName.get(v.executive_id) ?? "—" : "Unassigned" }));
  const overdue = tasks
    .filter((t) => ids.has(t.lead_id) && Date.parse(t.due_at) < now)
    .sort((a, b) => (a.due_at < b.due_at ? -1 : 1))
    .slice(0, 10)
    .map((t) => ({ ...t, leadName: allLeadsById.get(t.lead_id)?.name ?? "—", executiveName: t.executive_id ? execName.get(t.executive_id) ?? "—" : "Unassigned" }));

  return {
    kpis,
    trend: [...byDay.values()],
    sources: countBy((l) => l.source),
    propertyTypes: countBy((l) => l.property_type),
    projects: countBy((l) => (l.matched_project_ids[0] ? projectName.get(l.matched_project_ids[0]) ?? "Unknown" : "No match yet")),
    executives: execPerf,
    funnel,
    activity: activities.map((a) => ({ ...a, leadName: a.lead_id ? allLeadsById.get(a.lead_id)?.name ?? null : null })),
    recentConversations,
    upcomingVisits,
    overdue,
  };
}

export async function analytics(f: Filters) {
  const store = await getStore();
  const s = await getSettings();
  const tz = s.workingHours.timezone;
  const leads = await filteredLeads(f);
  const ids = new Set(leads.map((l) => l.id));
  const [convs, usage, visits, tasks, execs, projects] = await Promise.all([
    store.list("conversations"),
    store.list("usage_logs"),
    store.list("site_visits"),
    store.list("follow_up_tasks"),
    store.list("executives"),
    store.list("projects"),
  ]);
  const myConvIds = new Set(convs.filter((c) => ids.has(c.lead_id)).map((c) => c.id));
  const myUsage = usage.filter((u) => u.conversation_id && myConvIds.has(u.conversation_id));
  const bucket = (fmt: (d: Date) => string) => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const k = fmt(new Date(l.created_at));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort().map(([period, enquiries]) => ({ period, enquiries }));
  };
  const weekOf = (d: Date) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return `W/c ${dayKey(x.toISOString(), tz)}`;
  };
  const conv = (group: (l: Lead) => string) => {
    const m = new Map<string, { name: string; leads: number; converted: number }>();
    for (const l of leads) {
      const k = group(l);
      const r = m.get(k) ?? { name: k, leads: 0, converted: 0 };
      r.leads++;
      if (l.status === "CONVERTED") r.converted++;
      m.set(k, r);
    }
    return [...m.values()].map((r) => ({ ...r, rate: r.leads ? +((r.converted / r.leads) * 100).toFixed(1) : 0 })).sort((a, b) => b.leads - a.leads);
  };
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  const myVisits = visits.filter((v) => ids.has(v.lead_id));
  const completedVisitLeads = new Set(myVisits.filter((v) => v.status === "completed").map((v) => v.lead_id));
  const myTasks = tasks.filter((t) => ids.has(t.lead_id) && t.status !== "cancelled");
  const doneTasks = myTasks.filter((t) => ["done", "sent", "escalated"].includes(t.status));
  const okUsage = myUsage.filter((u) => u.ok);
  const converted = leads.filter((l) => l.status === "CONVERTED");
  return {
    daily: bucket((d) => dayKey(d.toISOString(), tz)),
    weekly: bucket(weekOf),
    monthly: bucket((d) => dayKey(d.toISOString(), tz).slice(0, 7)),
    aiHandlingPct: myConvIds.size ? +((convs.filter((c) => myConvIds.has(c.id) && c.handler === "ai").length / myConvIds.size) * 100).toFixed(1) : 0,
    avgAiResponseMs: okUsage.length ? Math.round(okUsage.reduce((a, u) => a + u.latency_ms, 0) / okUsage.length) : null,
    aiErrors: myUsage.filter((u) => !u.ok).length,
    tokens: myUsage.reduce((a, u) => a + u.prompt_tokens + u.completion_tokens, 0),
    costUsd: +myUsage.reduce((a, u) => a + Number(u.cost_usd), 0).toFixed(4),
    qualificationRate: leads.length ? +((leads.filter((l) => l.status !== "NEW" && l.status !== "LOST").length / leads.length) * 100).toFixed(1) : 0,
    executiveResponse: execs.map((e) => {
      const rts = leads.filter((l) => l.assigned_executive_id === e.id && l.assigned_at && l.contacted_at).map((l) => (Date.parse(l.contacted_at!) - Date.parse(l.assigned_at!)) / 60000);
      return { name: e.name, avgMinutes: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null, contacted: rts.length };
    }),
    projectConversion: conv((l) => (l.matched_project_ids[0] ? pName.get(l.matched_project_ids[0]) ?? "Unknown" : "No match")),
    sourceConversion: conv((l) => l.source),
    siteVisitConversion: {
      visited: completedVisitLeads.size,
      convertedAfterVisit: leads.filter((l) => completedVisitLeads.has(l.id) && l.status === "CONVERTED").length,
    },
    followUpCompletion: { total: myTasks.length, completed: doneTasks.length, pct: myTasks.length ? +((doneTasks.length / myTasks.length) * 100).toFixed(1) : 0 },
    revenue: { deals: converted.filter((l) => l.deal_value).length, total: converted.reduce((a, l) => a + (l.deal_value ?? 0), 0) },
  };
}
