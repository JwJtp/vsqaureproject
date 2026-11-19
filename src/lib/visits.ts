import "server-only";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { activity, audit } from "@/lib/log";
import { KeyedMutex } from "@/lib/queue/mutex";
import { scheduleFollowUp, cancelFollowUps } from "@/lib/followups";
import { messageCustomer, leadVars } from "@/lib/notify";
import { sendTemplate } from "@/lib/whatsapp";
import { localParts } from "@/lib/util";
import type { SiteVisit } from "@/lib/types";

const slotLock = new KeyedMutex();
const ACTIVE: SiteVisit["status"][] = ["requested", "confirmed"];

export interface Slot {
  start: string;
  booked: number;
  capacity: number;
  available: boolean;
}

/** Slots for one business-day (dateStr = YYYY-MM-DD in business timezone). */
export async function getSlots(dateStr: string, projectId: string | null): Promise<Slot[]> {
  const store = await getStore();
  const s = await getSettings();
  const sv = s.siteVisits;
  const dayStartUtc = Date.parse(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(dayStartUtc)) throw new Error("Invalid date");
  const wd = localParts(new Date(dayStartUtc + 12 * 3600000), s.workingHours.timezone).weekday;
  if (!sv.days.includes(wd)) return [];
  const visits = await store.list("site_visits", {
    where: { status: ACTIVE },
    gte: { scheduled_at: new Date(dayStartUtc).toISOString() },
    lte: { scheduled_at: new Date(dayStartUtc + 86400000).toISOString() },
  });
  const slots: Slot[] = [];
  for (let m = sv.startHour * 60; m + sv.slotMinutes <= sv.endHour * 60; m += sv.slotMinutes) {
    const start = new Date(dayStartUtc + m * 60000).toISOString();
    const booked = visits.filter((v) => v.scheduled_at === start && (projectId ? v.project_id === projectId : true)).length;
    slots.push({ start, booked, capacity: sv.capacityPerSlot, available: booked < sv.capacityPerSlot && Date.parse(start) > Date.now() });
  }
  return slots;
}

/** Snap a requested time to the configured slot grid (business tz). */
export async function snapToSlot(iso: string): Promise<string> {
  const s = await getSettings();
  const d = new Date(iso);
  const p = localParts(d, s.workingHours.timezone);
  let minutes = p.hour * 60 + p.minute;
  minutes = Math.max(s.siteVisits.startHour * 60, Math.min((s.siteVisits.endHour * 60) - s.siteVisits.slotMinutes, minutes));
  minutes = Math.floor((minutes - s.siteVisits.startHour * 60) / s.siteVisits.slotMinutes) * s.siteVisits.slotMinutes + s.siteVisits.startHour * 60;
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: s.workingHours.timezone }).format(d);
  return new Date(Date.parse(`${dateStr}T00:00:00+05:30`) + minutes * 60000).toISOString();
}

export class BookingError extends Error {
  constructor(message: string, public alternatives: string[] = []) {
    super(message);
  }
}

export async function bookVisit(input: { leadId: string; projectId: string | null; at: string; actor: string; notes?: string; status?: SiteVisit["status"]; rescheduleOf?: string }) {
  const store = await getStore();
  const s = await getSettings();
  const at = await snapToSlot(input.at);
  if (Date.parse(at) < Date.now()) throw new BookingError("That time is in the past");
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: s.workingHours.timezone }).format(new Date(at));

  return slotLock.run(`slot:${at}`, async () => {
    const lead = await store.get("leads", input.leadId);
    if (!lead) throw new BookingError("Lead not found");
    const slots = await getSlots(dateStr, input.projectId);
    const slot = slots.find((x) => x.start === at);
    if (!slot || !slot.available) {
      const alternatives = slots.filter((x) => x.available).slice(0, 3).map((x) => x.start);
      throw new BookingError(slots.length ? "Selected slot is fully booked" : "No site visits on that day", alternatives);
    }
    const execId = lead.assigned_executive_id;
    if (execId) {
      const clash = await store.list("site_visits", { where: { executive_id: execId, scheduled_at: at, status: ACTIVE } });
      if (clash.filter((c) => c.id !== input.rescheduleOf).length) {
        throw new BookingError("Assigned executive already has a visit at that time", slots.filter((x) => x.available && x.start !== at).slice(0, 3).map((x) => x.start));
      }
    }
    if (input.rescheduleOf) await store.update("site_visits", input.rescheduleOf, { status: "cancelled", notes: `Rescheduled to ${at}` });
    const visit = await store.insert("site_visits", {
      lead_id: lead.id,
      project_id: input.projectId,
      executive_id: execId,
      scheduled_at: at,
      duration_minutes: s.siteVisits.slotMinutes,
      status: input.status ?? "confirmed",
      notes: input.notes ?? null,
      is_demo: store.kind === "memory",
    });
    if (!["NEGOTIATION", "CONVERTED"].includes(lead.status)) await store.update("leads", lead.id, { status: "SITE_VISIT_SCHEDULED" });
    const when = new Date(at).toLocaleString("en-IN", { timeZone: s.workingHours.timezone, dateStyle: "medium", timeStyle: "short" });
    const project = input.projectId ? await store.get("projects", input.projectId) : null;
    await activity(lead.id, input.rescheduleOf ? "visit_rescheduled" : "visit_booked", `Site visit ${input.rescheduleOf ? "rescheduled" : "booked"} for ${when}${project ? ` at ${project.name}` : ""}`, input.actor);
    await audit(input.actor, "visit.book", "site_visits", visit.id, { at });

    // reminders (cancel old ones on reschedule)
    await cancelFollowUps(lead.id, ["visit_reminder", "visit_pending_confirmation"]);
    for (const h of s.siteVisits.reminderHoursBefore) {
      const due = new Date(Date.parse(at) - h * 3600000);
      if (due.getTime() > Date.now()) await scheduleFollowUp("visit_reminder", lead, execId, { dueAt: due, title: `Visit reminder (${h}h before): ${lead.name ?? "customer"}` });
    }
    if (visit.status === "requested") await scheduleFollowUp("visit_pending_confirmation", lead, execId);

    // notify executive + customer
    if (execId) {
      const exec = await store.get("executives", execId);
      if (exec) {
        const body = `📅 Site visit ${input.rescheduleOf ? "rescheduled" : "booked"}: ${leadVars(lead).name} (${leadVars(lead).phone}) — ${when}${project ? `, ${project.name}` : ""}`;
        const r = await sendTemplate(exec.phone, s.whatsapp.templates.visitConfirmation, s.whatsapp.templateLanguage, [leadVars(lead).name, when, project?.name ?? "site"]);
        await store.insert("notifications", { lead_id: lead.id, recipient_type: "executive", recipient: exec.phone, channel: "whatsapp", template: s.whatsapp.templates.visitConfirmation, body, status: r.status, provider_message_id: r.providerMessageId, error: r.error ?? null, simulated: r.simulated });
      }
    }
    return { visit, when, project };
  });
}

export async function confirmVisitToCustomer(leadId: string, when: string, projectName: string | null, lastCustomerMessageAt: string | null) {
  const store = await getStore();
  const s = await getSettings();
  const lead = await store.get("leads", leadId);
  if (!lead) return;
  await messageCustomer(lead, {
    text: `✅ Your site visit is confirmed for ${when}${projectName ? ` at ${projectName}` : ""}. — V Square Projects`,
    template: s.whatsapp.templates.visitConfirmation,
    params: [lead.name ?? "Customer", when, projectName ?? "site"],
    lastCustomerMessageAt,
  });
}

export async function updateVisitStatus(id: string, status: SiteVisit["status"], actor: string, notes?: string) {
  const store = await getStore();
  const v = await store.update("site_visits", id, { status, ...(notes ? { notes } : {}) });
  const lead = await store.get("leads", v.lead_id);
  if (lead) {
    if (status === "completed") {
      await store.update("leads", lead.id, { status: "SITE_VISIT_COMPLETED" });
      await scheduleFollowUp("visit_completed", lead, v.executive_id);
    }
    if (status === "cancelled") await cancelFollowUps(lead.id, ["visit_reminder", "visit_pending_confirmation"]);
    await activity(lead.id, `visit_${status}`, `Site visit marked ${status}`, actor);
  }
  await audit(actor, `visit.${status}`, "site_visits", id);
  return v;
}
