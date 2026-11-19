import "server-only";
import { getStore } from "@/lib/db";
import { getSettings, type AppSettings } from "@/lib/settings";
import { activity, audit, syslog } from "@/lib/log";
import type { FollowUpTask, Lead } from "@/lib/types";
import { localParts } from "@/lib/util";
import { fill, leadVars, notifyAdmins, messageCustomer } from "@/lib/notify";
import { sendTemplate } from "@/lib/whatsapp";

/** Move a due time into the next working-hours window if needed. */
export function nextWorkingTime(d: Date, wh: AppSettings["workingHours"]): Date {
  let t = new Date(d);
  for (let i = 0; i < 24 * 8; i++) {
    const p = localParts(t, wh.timezone);
    if (wh.days.includes(p.weekday) && p.hour >= wh.startHour && p.hour < wh.endHour) return t;
    t = new Date(t.getTime() + (60 - p.minute) * 60000); // jump to next full hour
  }
  return d;
}

export async function scheduleFollowUp(ruleKey: string, lead: Lead, executiveId: string | null, opts: { dueAt?: Date; title?: string } = {}) {
  const store = await getStore();
  const s = await getSettings();
  const rule = (await store.list("follow_up_rules", { where: { key: ruleKey } }))[0];
  if (!rule || !rule.active) return null;
  let due = opts.dueAt ?? new Date(Date.now() + rule.delay_minutes * 60000);
  if (rule.respect_working_hours) due = nextWorkingTime(due, s.workingHours);
  const task = await store.insert("follow_up_tasks", {
    lead_id: lead.id,
    executive_id: executiveId,
    rule_key: ruleKey,
    title: opts.title ?? `${rule.name}: ${lead.name ?? lead.phone ?? "customer"}`,
    due_at: due.toISOString(),
    status: "pending",
    result: null,
    is_demo: store.kind === "memory",
  });
  await activity(lead.id, "follow_up_scheduled", `${rule.name} scheduled for ${due.toISOString()}`);
  return task;
}

export async function cancelFollowUps(leadId: string, ruleKeys?: string[]) {
  const store = await getStore();
  const tasks = await store.list("follow_up_tasks", { where: { lead_id: leadId, status: "pending" } });
  for (const t of tasks) if (!ruleKeys || ruleKeys.includes(t.rule_key)) await store.update("follow_up_tasks", t.id, { status: "cancelled", result: "Condition no longer applies" });
}

/** Is the condition that created this task still true? Prevents stale reminders. */
function stillRelevant(task: FollowUpTask, lead: Lead): boolean {
  switch (task.rule_key) {
    case "new_unassigned": return !lead.assigned_executive_id && !["CONVERTED", "LOST"].includes(lead.status);
    case "assigned_not_contacted": return lead.status === "ASSIGNED" && lead.assigned_executive_id === task.executive_id;
    case "visit_pending_confirmation":
    case "visit_reminder": return !["CONVERTED", "LOST"].includes(lead.status);
    default: return !["CONVERTED", "LOST"].includes(lead.status);
  }
}

/** Executed by the background worker (cron → /api/jobs/run), never by browser timers. */
export async function runDueFollowUps(now = new Date()) {
  const store = await getStore();
  const s = await getSettings();
  const due = await store.list("follow_up_tasks", { where: { status: "pending" }, lte: { due_at: now.toISOString() }, limit: 200 });
  const rules = new Map((await store.list("follow_up_rules")).map((r) => [r.key, r]));
  let processed = 0;
  for (const task of due) {
    const lead = await store.get("leads", task.lead_id);
    const rule = rules.get(task.rule_key);
    if (!lead || !rule || !rule.active) {
      await store.update("follow_up_tasks", task.id, { status: "skipped", result: "Lead or rule missing/inactive" });
      continue;
    }
    if (!stillRelevant(task, lead)) {
      await store.update("follow_up_tasks", task.id, { status: "skipped", result: "Condition no longer applies" });
      continue;
    }
    if (rule.respect_working_hours) {
      const next = nextWorkingTime(now, s.workingHours);
      if (next.getTime() > now.getTime() + 60000) {
        await store.update("follow_up_tasks", task.id, { due_at: next.toISOString() });
        continue;
      }
    }
    const visits = await store.list("site_visits", { where: { lead_id: lead.id, status: ["requested", "confirmed"] }, order: { column: "scheduled_at" }, limit: 1 });
    const vars = {
      ...leadVars(lead),
      delay: rule.delay_minutes,
      visit_time: visits[0] ? new Date(visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: s.workingHours.timezone, dateStyle: "medium", timeStyle: "short" }) : "—",
    };
    const text = fill(rule.template, vars);
    const overdueMin = (now.getTime() - Date.parse(task.created_at)) / 60000;
    const shouldEscalate = rule.escalate_after_minutes !== null && overdueMin >= rule.escalate_after_minutes;
    try {
      if (rule.channel === "whatsapp_customer") {
        if (lead.opted_out) {
          await store.update("follow_up_tasks", task.id, { status: "skipped", result: "Customer opted out" });
          continue;
        }
        const conv = (await store.list("conversations", { where: { lead_id: lead.id }, order: { column: "last_message_at", ascending: false }, limit: 1 }))[0];
        await messageCustomer(lead, {
          text,
          template: task.rule_key === "visit_reminder" ? s.whatsapp.templates.visitReminder : s.whatsapp.templates.followUp,
          params: [lead.name ?? "Customer", vars.visit_time],
          lastCustomerMessageAt: conv?.last_customer_message_at ?? null,
        });
        await store.update("follow_up_tasks", task.id, { status: "sent", result: "Customer message sent" });
      } else if (rule.channel === "whatsapp_executive" && task.executive_id) {
        const exec = await store.get("executives", task.executive_id);
        if (exec) {
          const r = await sendTemplate(exec.phone, s.whatsapp.templates.followUp, s.whatsapp.templateLanguage, [text]);
          await store.insert("notifications", {
            lead_id: lead.id, recipient_type: "executive", recipient: exec.phone, channel: "whatsapp", template: s.whatsapp.templates.followUp,
            body: text, status: r.status, provider_message_id: r.providerMessageId, error: r.error ?? null, simulated: r.simulated,
          });
        }
        if (shouldEscalate) {
          await notifyAdmins(`⏰ Escalation: ${text}`, lead.id);
          await store.update("follow_up_tasks", task.id, { status: "escalated", result: "Escalated to management" });
        } else {
          // keep the reminder open; re-check at the escalation point
          const nextDue = rule.escalate_after_minutes ? new Date(Date.parse(task.created_at) + rule.escalate_after_minutes * 60000) : null;
          await store.update("follow_up_tasks", task.id, nextDue && nextDue > now ? { due_at: nextDue.toISOString(), result: "Reminder sent" } : { status: "sent", result: "Reminder sent" });
        }
      } else {
        await notifyAdmins(text, lead.id);
        await store.update("follow_up_tasks", task.id, shouldEscalate || rule.escalate_after_minutes === null ? { status: "escalated", result: "Admins alerted" } : { due_at: new Date(Date.parse(task.created_at) + rule.escalate_after_minutes * 60000).toISOString(), result: "Admins alerted" });
      }
      await activity(lead.id, "follow_up_executed", `${rule.name}: ${text}`);
      await audit("scheduler", "follow_up.run", "follow_up_tasks", task.id, { rule: rule.key });
      processed++;
    } catch (e) {
      await syslog("error", "followups", `Follow-up ${task.id} failed: ${(e as Error).message}`);
    }
  }
  return { due: due.length, processed };
}
