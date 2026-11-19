import "server-only";
import { getStore } from "@/lib/db";
import { getSettings, updateSettings } from "@/lib/settings";
import { activity, audit, syslog } from "@/lib/log";
import { notifyAdmins, notifyExecutiveAssignment, messageCustomer, leadVars, fill } from "@/lib/notify";
import { scheduleFollowUp, cancelFollowUps } from "@/lib/followups";
import { pickExecutive, type ExecLoad } from "./engine";
import type { AssignmentMethod, Executive, Lead } from "@/lib/types";
import { startOfDayIso, nowIso } from "@/lib/util";
import { KeyedMutex } from "@/lib/queue/mutex";

const OPEN = ["ASSIGNED", "CONTACTED", "FOLLOW_UP", "SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "NEGOTIATION"] as const;
// Serialises assignment decisions so concurrent leads don't over-fill one executive's capacity.
const assignLock = new KeyedMutex();

export async function executiveLoads(): Promise<Map<string, ExecLoad>> {
  const store = await getStore();
  const s = await getSettings();
  const [open, today] = await Promise.all([
    store.list("leads", { where: { status: [...OPEN] } }),
    store.list("assignments", { gte: { created_at: startOfDayIso(new Date(), s.workingHours.timezone) } }),
  ]);
  const m = new Map<string, ExecLoad>();
  const get = (id: string) => m.get(id) ?? (m.set(id, { openLeads: 0, assignedToday: 0 }), m.get(id)!);
  for (const l of open) if (l.assigned_executive_id) get(l.assigned_executive_id).openLeads++;
  for (const a of today) if (a.executive_id && a.method !== "unassigned") get(a.executive_id).assignedToday++;
  return m;
}

export async function assignLead(
  leadId: string,
  opts: { executiveId?: string; actor?: string; notifyCustomer?: boolean; lastCustomerMessageAt?: string | null } = {},
): Promise<{ lead: Lead; executive: Executive | null; reason: string }> {
  return assignLock.run("assign", async () => {
    const store = await getStore();
    const s = await getSettings();
    const actor = opts.actor ?? "system";
    const lead = await store.get("leads", leadId);
    if (!lead) throw new Error("Lead not found");
    const executives = await store.list("executives");
    const loads = await executiveLoads();

    let exec: Executive | null = null;
    let method: AssignmentMethod = "manual";
    let reason = "";
    if (opts.executiveId) {
      exec = executives.find((e) => e.id === opts.executiveId) ?? null;
      if (!exec) throw new Error("Executive not found");
      if (!exec.active) throw new Error(`${exec.name} is inactive`);
      if (!exec.available) throw new Error(`${exec.name} is marked unavailable`);
      reason = `Manually assigned by ${actor}`;
    } else {
      const r = pickExecutive(lead, executives, loads, s.assignment.strategy, s.assignment.roundRobinPointer);
      exec = r.executive;
      method = r.method;
      reason = r.reason;
      if (r.rrPointer !== undefined) await updateSettings("assignment", { roundRobinPointer: r.rrPointer });
    }

    await store.insert("assignments", {
      lead_id: lead.id,
      executive_id: exec?.id ?? null,
      previous_executive_id: lead.assigned_executive_id,
      method: exec ? method : "unassigned",
      reason,
      assigned_by: actor,
    });

    if (!exec) {
      await activity(lead.id, "unassigned", `No suitable executive: ${reason}`, actor);
      await syslog("warn", "assignment", `Lead ${lead.id} placed in unassigned queue: ${reason}`);
      await notifyAdmins(`⚠️ Lead ${lead.name ?? lead.phone ?? lead.id} could not be assigned: ${reason}`, lead.id);
      await scheduleFollowUp("new_unassigned", lead, null);
      return { lead, executive: null, reason };
    }

    const updated = await store.update("leads", lead.id, {
      assigned_executive_id: exec.id,
      assigned_at: nowIso(),
      status: ["NEW", "QUALIFIED"].includes(lead.status) ? "ASSIGNED" : lead.status,
    });
    await cancelFollowUps(lead.id, ["new_unassigned"]);
    if (lead.assigned_executive_id && lead.assigned_executive_id !== exec.id) {
      await cancelFollowUps(lead.id, ["assigned_not_contacted"]);
    }
    await activity(lead.id, "assigned", `Assigned to ${exec.name} (${method}): ${reason}`, actor);
    await audit(actor, "lead.assign", "leads", lead.id, { executive_id: exec.id, method });

    const projects = await store.list("projects", { where: { id: updated.matched_project_ids } });
    await notifyExecutiveAssignment(exec, updated, projects.map((p) => p.name));
    await scheduleFollowUp("assigned_not_contacted", updated, exec.id);

    if (opts.notifyCustomer) {
      const tpl = s.whatsapp.templates.customerConfirmation;
      const text = fill("Thank you {{name}}! Your enquiry is confirmed. Our property advisor " + exec.name + " will contact you shortly. — V Square Projects", leadVars(updated));
      await messageCustomer(updated, { text, template: tpl, params: [updated.name ?? "Customer", exec.name], lastCustomerMessageAt: opts.lastCustomerMessageAt ?? null });
    }
    return { lead: updated, executive: exec, reason };
  });
}
