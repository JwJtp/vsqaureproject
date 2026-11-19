import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { filteredLeads, parseFilters } from "@/lib/stats";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";
import { csvEscape } from "@/lib/util";

/** CSV export — admin/manager only (export permission), audited. */
export const GET = route(async (req) => {
  const user = await requireUser(["admin", "manager"]);
  const leads = await filteredLeads(parseFilters(req.nextUrl.searchParams));
  const store = await getStore();
  const execs = new Map((await store.list("executives")).map((e) => [e.id, e.name]));
  const cols = ["id", "created_at", "name", "phone", "email", "source", "status", "priority", "score", "property_type", "preferred_location", "budget_text", "budget_min", "budget_max", "configuration", "purpose", "timeline", "site_visit_preference", "executive", "deal_value", "lost_reason", "opted_out"] as const;
  const rows = leads.map((l) => cols.map((c) => csvEscape(c === "executive" ? (l.assigned_executive_id ? execs.get(l.assigned_executive_id) : "") : (l as unknown as Record<string, unknown>)[c])).join(","));
  await audit(user.email, "leads.export", "leads", null, { count: leads.length });
  return new NextResponse([cols.join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vsquare-leads-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
