import "server-only";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { sendTemplate, sendText, withinServiceWindow, type SendResult } from "@/lib/whatsapp";
import { syslog } from "@/lib/log";
import { env } from "@/lib/env";
import type { Executive, Lead, Notification } from "@/lib/types";
import { formatINR } from "@/lib/util";

export function fill(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] === null || vars[k] === undefined || vars[k] === "" ? "—" : String(vars[k])));
}

export function leadVars(l: Lead) {
  return {
    name: l.name ?? "Customer",
    phone: l.phone ? `+${l.phone}` : "—",
    property_type: l.property_type ?? "property",
    location: l.preferred_location ?? "—",
    budget: l.budget_max ? `${l.budget_min ? formatINR(l.budget_min) + "–" : "up to "}${formatINR(l.budget_max)}` : l.budget_text ?? "—",
    configuration: l.configuration ?? "—",
    timeline: l.timeline ?? "—",
    score: l.score,
    priority: l.priority.toUpperCase(),
    source: l.source,
  };
}

async function record(n: Partial<Notification>, r: SendResult) {
  const store = await getStore();
  const row = await store.insert("notifications", {
    ...n,
    status: r.status,
    provider_message_id: r.providerMessageId,
    error: r.error ?? null,
    simulated: r.simulated,
  });
  if (!r.ok) await syslog("error", "whatsapp", `Send failed to ${n.recipient_type}: ${r.error}`, { notification_id: row.id, lead_id: n.lead_id });
  return row;
}

/** Structured WhatsApp notification to an executive when a lead is assigned. */
export async function notifyExecutiveAssignment(exec: Executive, lead: Lead, projectNames: string[]) {
  const s = await getSettings();
  const v = leadVars(lead);
  const body = [
    "🏠 *New lead assigned — V Square Projects*",
    `Customer: ${v.name}`,
    `Phone: ${v.phone}`,
    `Looking for: ${v.property_type}${lead.configuration ? ` (${lead.configuration})` : ""}`,
    `Location: ${v.location}`,
    `Budget: ${v.budget}`,
    `Timeline: ${v.timeline}`,
    `Priority: ${v.priority} (score ${lead.score})`,
    projectNames.length ? `Matching projects: ${projectNames.join(", ")}` : null,
    `Source: ${lead.source}`,
    `Open: ${env.APP_URL}/portal?lead=${lead.id}`,
  ]
    .filter(Boolean)
    .join("\n");
  // Business-initiated messages to staff need an approved template outside the 24h window.
  const r = await sendTemplate(exec.phone, s.whatsapp.templates.executiveAssignment, s.whatsapp.templateLanguage, [
    v.name, v.phone, `${v.property_type} ${lead.configuration ?? ""}`.trim(), v.location, v.budget, v.priority,
  ]);
  return record({ lead_id: lead.id, recipient_type: "executive", recipient: exec.phone, channel: "whatsapp", template: s.whatsapp.templates.executiveAssignment, body }, r);
}

/**
 * Message a customer. Free-form text inside the 24h service window; otherwise an approved
 * template is required. Opted-out customers are never messaged.
 */
export async function messageCustomer(lead: Lead, opts: { text: string; template?: string; params?: string[]; lastCustomerMessageAt: string | null }) {
  if (lead.opted_out) return null;
  if (!lead.phone) return null;
  const s = await getSettings();
  let r: SendResult;
  let template: string | null = null;
  if (withinServiceWindow(opts.lastCustomerMessageAt)) r = await sendText(lead.phone, opts.text);
  else if (opts.template) {
    template = opts.template;
    r = await sendTemplate(lead.phone, opts.template, s.whatsapp.templateLanguage, opts.params ?? []);
  } else {
    r = { ok: false, simulated: false, providerMessageId: null, status: "failed", error: "Outside 24h window and no approved template configured" };
  }
  return record({ lead_id: lead.id, recipient_type: "customer", recipient: lead.phone, channel: "whatsapp", template, body: opts.text }, r);
}

export async function notifyAdmins(text: string, leadId: string | null) {
  const store = await getStore();
  await store.insert("notifications", {
    lead_id: leadId, recipient_type: "admin", recipient: "admins", channel: "in_app", template: null, body: text,
    status: "simulated", provider_message_id: null, error: null, simulated: false,
  });
  if (env.ADMIN_ALERT_WHATSAPP) {
    const s = await getSettings();
    const r = await sendTemplate(env.ADMIN_ALERT_WHATSAPP, s.whatsapp.templates.followUp, s.whatsapp.templateLanguage, [text.slice(0, 500)]);
    await record({ lead_id: leadId, recipient_type: "admin", recipient: env.ADMIN_ALERT_WHATSAPP, channel: "whatsapp", template: s.whatsapp.templates.followUp, body: text }, r);
  }
  if (env.RESEND_API_KEY && env.ADMIN_ALERT_EMAIL && env.NOTIFY_EMAIL_FROM) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.NOTIFY_EMAIL_FROM, to: env.ADMIN_ALERT_EMAIL, subject: "V Square AI — admin alert", text }),
      });
      if (!res.ok) await syslog("warn", "email", `Admin email failed: HTTP ${res.status}`);
    } catch (e) {
      await syslog("warn", "email", `Admin email failed: ${(e as Error).message}`);
    }
  }
}
