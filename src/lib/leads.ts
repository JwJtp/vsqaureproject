import "server-only";
import { z } from "zod";
import { getStore } from "@/lib/db";
import { activity, audit } from "@/lib/log";
import { LEAD_SOURCES, PROPERTY_TYPES, type Conversation, type Lead, type LeadSource } from "@/lib/types";
import { normalizePhone, nowIso } from "@/lib/util";
import { scoreLead } from "@/lib/ai/score";
import { extract } from "@/lib/ai/extract";

export const LeadInputSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  source_detail: z.string().max(200).optional().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  message: z.string().trim().max(4000).optional().nullable(),
  property_type: z.enum(PROPERTY_TYPES).optional().nullable(),
  preferred_location: z.string().trim().max(120).optional().nullable(),
  budget_text: z.string().trim().max(60).optional().nullable(),
  configuration: z.string().trim().max(60).optional().nullable(),
  timeline: z.string().trim().max(60).optional().nullable(),
  consent: z.boolean().optional(),
  consent_text: z.string().max(500).optional(),
  external_id: z.string().max(200).optional().nullable(),
});
export type LeadInput = z.infer<typeof LeadInputSchema>;

export function emptyLead(source: LeadSource, isDemo: boolean): Partial<Lead> {
  return {
    name: null, phone: null, email: null, source, source_detail: null, status: "NEW", property_type: null,
    preferred_location: null, budget_min: null, budget_max: null, budget_text: null, configuration: null, purpose: null,
    timeline: null, site_visit_preference: null, language: null, score: 0, score_reasons: [], priority: "cold",
    matched_project_ids: [], assigned_executive_id: null, consent_whatsapp: false, opted_out: false, duplicate_of: null,
    deal_value: null, lost_reason: null, is_demo: isDemo, first_response_at: null, last_interaction_at: nowIso(),
    qualified_at: null, assigned_at: null, contacted_at: null, converted_at: null,
  };
}

/** Duplicate detection: same phone or email on a lead from the last 120 days. */
export async function findDuplicate(phone: string | null, email: string | null): Promise<Lead | null> {
  if (!phone && !email) return null;
  const store = await getStore();
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const byPhone = phone ? await store.list("leads", { where: { phone }, gte: { created_at: since }, order: { column: "created_at" } }) : [];
  if (byPhone[0]) return byPhone[0];
  const byEmail = email ? await store.list("leads", { where: { email }, gte: { created_at: since }, order: { column: "created_at" } }) : [];
  return byEmail[0] ?? null;
}

export async function recordConsent(leadId: string, channel: string, granted: boolean, source: string, text: string) {
  const store = await getStore();
  await store.insert("consents", { lead_id: leadId, channel, granted, source, text });
}

/**
 * Unified ingestion for forms, ad platforms, CRMs and manual entry.
 * Returns the lead (existing one when a duplicate is detected) and whether it was new.
 */
export async function ingestLead(input: LeadInput, actor = "system"): Promise<{ lead: Lead; created: boolean; duplicate: boolean }> {
  const store = await getStore();
  const phone = normalizePhone(input.phone);
  const email = input.email ? input.email.toLowerCase() : null;
  if (!phone && !email && input.source !== "website_chat") throw new Error("A valid phone number or email is required");
  const fromText = input.message ? extract(input.message) : {};
  const fields: Partial<Lead> = {
    name: input.name || fromText.name || null,
    phone: phone ?? (fromText.phone ? normalizePhone(fromText.phone) : null),
    email: email ?? fromText.email ?? null,
    property_type: input.property_type ?? fromText.property_type ?? null,
    preferred_location: input.preferred_location ?? fromText.preferred_location ?? null,
    budget_text: input.budget_text ?? fromText.budget_text ?? null,
    budget_min: fromText.budget_min ?? null,
    budget_max: fromText.budget_max ?? null,
    configuration: input.configuration ?? fromText.configuration ?? null,
    timeline: input.timeline ?? fromText.timeline ?? null,
    purpose: fromText.purpose ?? null,
  };
  if (input.budget_text && !fields.budget_max) {
    const b = extract(input.budget_text, { lastAsked: "budget" });
    fields.budget_min = b.budget_min ?? null;
    fields.budget_max = b.budget_max ?? null;
  }

  const dup = await findDuplicate(fields.phone ?? null, fields.email ?? null);
  if (dup) {
    const patch: Partial<Lead> = { last_interaction_at: nowIso() };
    for (const [k, v] of Object.entries(fields)) if (v && !(dup as unknown as Record<string, unknown>)[k]) (patch as Record<string, unknown>)[k] = v;
    const merged = await store.update("leads", dup.id, patch);
    await activity(dup.id, "duplicate_enquiry", `Repeat enquiry via ${input.source}${input.message ? `: "${input.message.slice(0, 140)}"` : ""}`, actor);
    if (input.consent) await recordConsent(dup.id, "whatsapp", true, input.source, input.consent_text ?? "Consent given via enquiry form");
    return { lead: merged, created: false, duplicate: true };
  }

  const base = { ...emptyLead(input.source, store.kind === "memory"), ...fields, source_detail: input.source_detail ?? null, consent_whatsapp: !!input.consent };
  const sc = scoreLead({ ...(base as Lead) });
  const lead = await store.insert("leads", { ...base, score: sc.score, priority: sc.priority, score_reasons: sc.reasons });
  await activity(lead.id, "lead_created", `Lead captured from ${input.source}${input.source_detail ? ` (${input.source_detail})` : ""}`, actor);
  if (input.message) {
    await store.insert("notes", { lead_id: lead.id, author: `${input.source} form`, body: input.message });
  }
  if (input.consent !== undefined) await recordConsent(lead.id, "whatsapp", !!input.consent, input.source, input.consent_text ?? "Consent captured on enquiry");
  await audit(actor, "lead.create", "leads", lead.id, { source: input.source });
  return { lead, created: true, duplicate: false };
}

/** One open conversation per (channel, identity). Different customers can never share one. */
export async function findOrCreateConversation(channel: LeadSource, externalId: string, init: { name?: string | null; phone?: string | null }): Promise<{ conversation: Conversation; lead: Lead; isNew: boolean }> {
  const store = await getStore();
  const existing = (await store.list("conversations", { where: { channel, external_id: externalId, status: ["active", "waiting"] }, limit: 1 }))[0];
  if (existing) {
    const lead = await store.get("leads", existing.lead_id);
    if (lead) return { conversation: existing, lead, isNew: false };
  }
  const phone = normalizePhone(init.phone);
  let lead = phone ? await findDuplicate(phone, null) : null;
  if (!lead) {
    lead = await store.insert("leads", { ...emptyLead(channel, store.kind === "memory"), name: init.name ?? null, phone, consent_whatsapp: channel === "whatsapp" });
    await activity(lead.id, "lead_created", `New ${channel === "whatsapp" ? "WhatsApp" : "website chat"} enquiry`);
    // Inbound WhatsApp = the customer initiated contact; record this as the consent basis.
    if (channel === "whatsapp") await recordConsent(lead.id, "whatsapp", true, "whatsapp_inbound", "Customer initiated WhatsApp conversation");
  }
  const conversation = await store.insert("conversations", {
    lead_id: lead.id, channel, external_id: externalId, status: "active", handler: "ai", ai_paused: false, escalated: false,
    escalation_reason: null, processing: false, last_customer_message_at: null, last_message_at: null, last_asked_field: null,
    is_demo: store.kind === "memory",
  });
  return { conversation, lead, isNew: true };
}
