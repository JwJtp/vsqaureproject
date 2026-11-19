import "server-only";
import { getStore } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { activity, syslog } from "@/lib/log";
import { retrieve } from "@/lib/knowledge";
import { assignLead } from "@/lib/assignment";
import { bookVisit, BookingError } from "@/lib/visits";
import { scheduleFollowUp, cancelFollowUps } from "@/lib/followups";
import { sendText, sendInstagram } from "@/lib/whatsapp";
import { notifyAdmins } from "@/lib/notify";
import { recordConsent, findOrCreateConversation } from "@/lib/leads";
import { KeyedMutex } from "@/lib/queue/mutex";
import { aiSemaphore, registerJobHandler, enqueue, kickWorker } from "@/lib/queue";
import { extract, signals, type Extracted, type Field } from "./extract";
import { scoreLead, missingFields, matchProjects } from "./score";
import { simulateAgent, type AgentDecision, type AgentInput } from "./simulator";
import { callOpenAI, estimateCost } from "./openai";
import { guardReply } from "./guard";
import type { Conversation, Lead, LeadSource, Message } from "@/lib/types";
import { nowIso, startOfDayIso, sleep } from "@/lib/util";

/** One lock per conversation: messages from the same customer are processed strictly in order. */
const g = globalThis as unknown as { __vsConvLock?: KeyedMutex };
export const conversationLock = (g.__vsConvLock ??= new KeyedMutex());

export async function aiMode(): Promise<"live" | "demo"> {
  const s = await getSettings();
  return env.OPENAI_API_KEY && !s.ai.forceSimulation ? "live" : "demo";
}

async function withinBudget(): Promise<{ ok: boolean; why?: string }> {
  const store = await getStore();
  const s = await getSettings();
  const today = await store.list("usage_logs", { where: { provider: "openai" }, gte: { created_at: startOfDayIso(new Date(), s.workingHours.timezone) } });
  const tokens = today.reduce((a, u) => a + u.prompt_tokens + u.completion_tokens, 0);
  if (tokens >= s.ai.dailyTokenBudget) return { ok: false, why: `daily token budget reached (${tokens})` };
  const month = new Date();
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);
  const monthCost = (await store.list("usage_logs", { where: { provider: "openai" }, gte: { created_at: month.toISOString() } })).reduce((a, u) => a + Number(u.cost_usd), 0);
  if (monthCost >= s.ai.monthlyCostLimitUsd) return { ok: false, why: `monthly cost limit reached ($${monthCost.toFixed(2)})` };
  return { ok: true };
}

function mergeExtracted(rule: Extracted, llm: Extracted): Extracted {
  // LLM understands free-form text better; the rule extractor fills gaps and validates phone numbers.
  const out: Extracted = { ...rule };
  for (const [k, v] of Object.entries(llm)) if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  if (rule.phone) out.phone = rule.phone;
  return out;
}

function applyExtracted(lead: Lead, e: Extracted): Partial<Lead> {
  const p: Partial<Lead> = {};
  const set = <K extends keyof Lead>(k: K, v: Lead[K] | undefined) => {
    if (v !== undefined && v !== null && v !== "") p[k] = v;
  };
  set("name", e.name);
  if (e.phone && /^\d{10,15}$/.test(e.phone)) set("phone", e.phone);
  set("email", e.email);
  // "investment" alone describes purpose; never let it overwrite a concrete plot/villa/apartment choice.
  if (!(e.property_type === "investment" && lead.property_type && lead.property_type !== "investment")) set("property_type", e.property_type);
  set("preferred_location", e.preferred_location);
  if (e.budget_max) {
    p.budget_max = e.budget_max;
    p.budget_min = e.budget_min ?? null;
    set("budget_text", e.budget_text);
  }
  set("configuration", e.configuration);
  set("purpose", e.purpose);
  set("timeline", e.timeline);
  set("site_visit_preference", e.site_visit_preference);
  return p;
}

export interface TurnResult {
  reply: string | null;
  lead: Lead;
  conversation: Conversation;
  decision: AgentDecision | null;
  handledBy: "ai" | "human" | "none";
  provider: "openai" | "simulator" | null;
}

export async function sendOutbound(conv: Conversation, lead: Lead, body: string, sender: Message["sender"], meta: Record<string, unknown>) {
  const store = await getStore();
  const msg = await store.insert("messages", {
    conversation_id: conv.id, lead_id: lead.id, direction: "out", sender, sender_name: sender === "ai" ? "AI agent" : ((meta.by_name as string | undefined) ?? (sender === "system" ? "System" : null)),
    body, provider_message_id: null, delivery_status: "queued", meta,
  });
  if (conv.channel === "whatsapp" || conv.channel === "instagram") {
    const r = conv.channel === "whatsapp" ? await sendText(conv.external_id, body) : await sendInstagram(conv.external_id, body);
    await store.update("messages", msg.id, { delivery_status: r.status, provider_message_id: r.providerMessageId, meta: { ...meta, ...(r.error ? { error: r.error } : {}) } });
    if (!r.ok && r.retryable) throw Object.assign(new Error(`WhatsApp send failed: ${r.error}`), { retryable: true });
  } else {
    // Website chat replies are returned directly in the HTTP response to the widget.
    await store.update("messages", msg.id, { delivery_status: "sent" });
  }
  return msg;
}

/** Core AI turn for one inbound customer message. Caller must hold the conversation lock. */
export async function processInbound(conversationId: string, messageId: string): Promise<TurnResult> {
  const store = await getStore();
  const s = await getSettings();
  const t0 = Date.now();
  let conv = (await store.get("conversations", conversationId))!;
  let lead = (await store.get("leads", conv.lead_id))!;
  const inbound = (await store.get("messages", messageId))!;
  if (!conv || !lead || !inbound) throw Object.assign(new Error("Conversation, lead or message not found"), { permanent: true });
  if (inbound.meta?.processed) return { reply: null, lead, conversation: conv, decision: null, handledBy: "none", provider: null };

  const sig = signals(inbound.body);
  const markProcessed = () => store.update("messages", inbound.id, { meta: { ...inbound.meta, processed: true } });

  // 1. Consent: opt-out is honoured immediately and permanently.
  if (sig.optOut) {
    lead = await store.update("leads", lead.id, { opted_out: true, consent_whatsapp: false });
    await recordConsent(lead.id, conv.channel, false, conv.channel, `Customer opted out: "${inbound.body.slice(0, 80)}"`);
    await cancelFollowUps(lead.id);
    await activity(lead.id, "opted_out", "Customer opted out of messages");
    const reply = sig.language === "en" ? "You have been unsubscribed and will not receive further messages from us. Thank you." : "ನಿಮ್ಮನ್ನು unsubscribe ಮಾಡಲಾಗಿದೆ. ಇನ್ನು ಮುಂದೆ ಸಂದೇಶ ಕಳುಹಿಸುವುದಿಲ್ಲ. ಧನ್ಯವಾದಗಳು.";
    await sendOutbound(conv, lead, reply, "system", { opt_out_confirmation: true });
    conv = await store.update("conversations", conv.id, { status: "closed", processing: false, last_message_at: nowIso() });
    await markProcessed();
    return { reply, lead, conversation: conv, decision: null, handledBy: "ai", provider: null };
  }
  if (lead.opted_out) {
    // Customer wrote again after opting out: store it, but the AI does not message them.
    await markProcessed();
    return { reply: null, lead, conversation: conv, decision: null, handledBy: "none", provider: null };
  }

  // 2. Human handoff / AI paused: the message waits in the inbox for the executive.
  if (conv.ai_paused || conv.handler === "human") {
    await activity(lead.id, "message_for_human", "Customer message waiting for executive (AI paused)");
    await markProcessed();
    return { reply: null, lead, conversation: conv, decision: null, handledBy: "human", provider: null };
  }

  conv = await store.update("conversations", conv.id, { processing: true });
  try {
    const history = await store.list("messages", { where: { conversation_id: conv.id }, order: { column: "created_at" } });
    const projects = await store.list("projects", { where: { verified: true } });
    const prevMatched = new Set(lead.matched_project_ids);
    const ruleExtract = extract(inbound.body, { lastAsked: conv.last_asked_field as Field | null, knownLocations: projects.map((p) => p.location) });
    const previewLead = { ...lead, ...applyExtracted(lead, ruleExtract), language: sig.language };
    const matchedNow = matchProjects(previewLead, projects);
    const knowledge = sig.question || matchedNow.length ? await retrieve(inbound.body, { projectIds: matchedNow.map((p) => p.id) }) : [];
    const input: AgentInput = {
      agentName: s.ai.agentName,
      companyName: s.company.name,
      lead: previewLead,
      isFirstTurn: history.filter((m) => m.direction === "out").length === 0,
      missing: missingFields(previewLead, conv.channel === "whatsapp"),
      extracted: ruleExtract,
      signals: sig,
      knowledge,
      newlyMatched: matchedNow.filter((p) => !prevMatched.has(p.id)),
      customerText: inbound.body,
    };

    // 3. Decide: OpenAI (live) with retries, falling back to the simulator on failure/budget.
    let decision: AgentDecision | undefined;
    let provider: "openai" | "simulator" = "simulator";
    let usage = { prompt: 0, completion: 0, model: "demo-simulator" };
    let llmError: string | null = null;
    const budget = (await aiMode()) === "live" ? await withinBudget() : { ok: false, why: "demo" };
    if (budget.ok) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await callOpenAI(s, input, history, nowIso());
          provider = "openai";
          usage = { prompt: r.promptTokens, completion: r.completionTokens, model: r.model };
          decision = { ...r.decision, extracted: mergeExtracted(ruleExtract, r.decision.extracted) };
          break;
        } catch (e) {
          llmError = (e as Error).message;
          if (!(e as { retryable?: boolean }).retryable) break;
          await sleep(500 * 2 ** attempt);
        }
      }
      if (llmError && provider !== "openai") await syslog("error", "openai", `LLM failed, using safe fallback: ${llmError}`, { conversation_id: conv.id });
    } else if (budget.why !== "demo") {
      await syslog("warn", "openai", `AI budget guard: ${budget.why}. Using simulator.`);
    }
    if (!decision) decision = simulateAgent(input);

    // 4. Guardrails: block unverified prices/approvals/promises from the LLM.
    if (provider === "openai") {
      const ctx = knowledge.map((k) => k.text).join("\n") + "\n" + matchedNow.map((p) => `${p.name} ${p.location}`).join("\n");
      const gr = guardReply(decision.reply, ctx);
      if (!gr.ok) {
        await syslog("warn", "guardrail", `Blocked unverified claim(s): ${gr.violations.join("; ")}`, { conversation_id: conv.id });
        decision = { ...decision, reply: simulateAgent(input).reply, escalate: decision.escalate ?? { reason: "Guardrail blocked an unverified claim", type: "guardrail" }, confidence: Math.min(decision.confidence, 0.5) };
      }
    }
    if (!decision.escalate && decision.confidence < s.ai.confidenceThreshold) {
      decision.escalate = { reason: `Low AI confidence (${decision.confidence.toFixed(2)})`, type: "low_confidence" };
    }

    // 5. Update the lead record (this customer only).
    const patch = applyExtracted(lead, decision.extracted);
    const matched = matchProjects({ ...lead, ...patch }, projects);
    const sc = scoreLead({ ...lead, ...patch, matchedProjects: matched.length, engagedMessages: history.filter((m) => m.direction === "in").length });
    const now = nowIso();
    const becameQualified = lead.status === "NEW" && sc.score >= s.assignment.qualifyThreshold && !!(patch.property_type ?? lead.property_type);
    lead = await store.update("leads", lead.id, {
      ...patch,
      language: sig.language,
      // Current verified matches only: if the requirement changes, stale matches are dropped.
      matched_project_ids: matched.map((p) => p.id),
      score: sc.score,
      score_reasons: sc.reasons,
      priority: sc.priority,
      last_interaction_at: now,
      ...(becameQualified ? { status: "QUALIFIED" as const, qualified_at: now } : {}),
    });
    const capturedKeys = Object.keys(patch);
    if (capturedKeys.length) await activity(lead.id, "requirements_captured", `AI captured: ${capturedKeys.join(", ")}`, "ai");
    if (becameQualified) await activity(lead.id, "qualified", `Qualified with score ${sc.score}: ${sc.reasons.slice(0, 4).join("; ")}`, "ai");

    let reply = decision.reply;

    // 6. Escalation / handoff
    if (decision.escalate) {
      const hardHandoff = ["complaint", "negotiation", "legal", "human_request"].includes(decision.escalate.type);
      conv = await store.update("conversations", conv.id, {
        escalated: true,
        escalation_reason: decision.escalate.reason,
        ...(hardHandoff ? { handler: "human" as const, ai_paused: true } : {}),
      });
      if (decision.escalate.type === "negotiation" && !["CONVERTED", "LOST"].includes(lead.status)) lead = await store.update("leads", lead.id, { status: "NEGOTIATION" });
      await activity(lead.id, "escalated", `Escalated: ${decision.escalate.reason}`, "ai");
      await notifyAdmins(`🚩 Escalation (${decision.escalate.type}) for ${lead.name ?? lead.phone ?? "customer"}: ${decision.escalate.reason}`, lead.id);
      if (decision.escalate.type === "human_request") await scheduleFollowUp("awaiting_callback", lead, lead.assigned_executive_id);
    }
    if (decision.knowledgeGap) {
      await activity(lead.id, "knowledge_gap", `Customer asked something not in approved knowledge: "${decision.knowledgeGap.slice(0, 200)}"`, "ai");
      await scheduleFollowUp("awaiting_callback", lead, lead.assigned_executive_id, { title: `Answer customer question: ${decision.knowledgeGap.slice(0, 80)}` });
    }

    // 7. Assignment once qualified (or on escalation, so a human owns it)
    if (!lead.assigned_executive_id && (becameQualified || lead.status === "QUALIFIED" || decision.escalate) && s.assignment.enabled) {
      const r = await assignLead(lead.id, { actor: "ai" });
      lead = r.lead;
      if (r.executive && !decision.escalate) {
        reply += sig.language === "en" ? `\n\nYour dedicated property advisor is ${r.executive.name}, who will contact you shortly.` : `\n\nನಿಮ್ಮ property advisor ${r.executive.name} ಶೀಘ್ರದಲ್ಲೇ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.`;
      }
    }

    // 8. Site visit booking
    let visitBooked: { when: string; project: string | null } | null = null;
    if (decision.extracted.visit_at && !decision.escalate) {
      try {
        const projectId = lead.matched_project_ids[0] ?? null;
        const r = await bookVisit({ leadId: lead.id, projectId, at: decision.extracted.visit_at, actor: "ai" });
        visitBooked = { when: r.when, project: r.project?.name ?? null };
        lead = (await store.get("leads", lead.id))!;
        reply = (sig.language === "en" ? `✅ Your site visit is booked for ${r.when}` : `✅ ನಿಮ್ಮ ಸೈಟ್ ವಿಸಿಟ್ ${r.when} ಕ್ಕೆ ಬುಕ್ ಆಗಿದೆ`) + (r.project ? ` — ${r.project.name}` : "") + ". " + (sig.language === "en" ? "We'll send you a reminder before the visit." : "ವಿಸಿಟ್‌ಗೆ ಮೊದಲು reminder ಕಳುಹಿಸುತ್ತೇವೆ.");
      } catch (e) {
        if (e instanceof BookingError) {
          const alts = e.alternatives.map((a) => new Date(a).toLocaleString("en-IN", { timeZone: s.workingHours.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }));
          reply = `${e.message}.${alts.length ? ` Available slots: ${alts.join(", ")}. Which one works for you?` : " Could you suggest another day?"}`;
          decision.askedField = "site_visit_preference";
        } else throw e;
      }
    }
    if (sig.wantsLater && !visitBooked) await scheduleFollowUp("later_follow_up", lead, lead.assigned_executive_id);

    // 9. Send + bookkeeping
    const latency = Date.now() - t0;
    await sendOutbound(conv, lead, reply, "ai", { provider, model: usage.model, latency_ms: latency, confidence: decision.confidence, intent: decision.intent, sources: decision.usedSources, escalated: !!decision.escalate });
    await store.insert("usage_logs", {
      conversation_id: conv.id, provider, model: usage.model, prompt_tokens: usage.prompt, completion_tokens: usage.completion,
      cost_usd: provider === "openai" ? estimateCost(s, usage.prompt, usage.completion) : 0, latency_ms: latency, ok: !llmError || provider === "openai", error: llmError,
    });
    conv = await store.update("conversations", conv.id, { processing: false, last_message_at: nowIso(), last_asked_field: decision.askedField, status: "active" });
    if (!lead.first_response_at) lead = await store.update("leads", lead.id, { first_response_at: nowIso() });
    await markProcessed();
    return { reply, lead, conversation: conv, decision, handledBy: "ai", provider };
  } catch (e) {
    await store.update("conversations", conv.id, { processing: false });
    throw e;
  }
}

/** Store an inbound customer message (idempotent on provider/client message id). */
export async function recordInbound(conv: Conversation, lead: Lead, body: string, providerMessageId: string | null, senderName: string | null) {
  const store = await getStore();
  const now = nowIso();
  const msg = await store.insert("messages", {
    conversation_id: conv.id, lead_id: lead.id, direction: "in", sender: "customer", sender_name: senderName ?? lead.name,
    body: body.slice(0, 4000), provider_message_id: providerMessageId, delivery_status: "received", meta: {},
  });
  await store.update("conversations", conv.id, { last_customer_message_at: now, last_message_at: now, status: conv.status === "closed" ? "active" : conv.status });
  await store.update("leads", lead.id, { last_interaction_at: now });
  return msg;
}

/**
 * Website chat: synchronous reply. Ordered per conversation by the keyed lock; parallel across
 * customers, bounded by the AI semaphore (throws BackpressureError → HTTP 429 when saturated).
 */
export async function handleWebChat(sessionId: string, text: string, clientMessageId?: string) {
  const store = await getStore();
  if (clientMessageId && !(await store.claimEvent(`web:${sessionId}:${clientMessageId}`, "website_chat"))) {
    return { duplicate: true as const };
  }
  const { conversation, lead } = await findOrCreateConversation("website_chat" as LeadSource, sessionId, {});
  return conversationLock.run(conversation.id, async () => {
    const fresh = (await store.get("conversations", conversation.id))!;
    const msg = await recordInbound(fresh, lead, text, null, null);
    const sem = await aiSemaphore();
    const res = await sem.use(() => processInbound(conversation.id, msg.id));
    return { duplicate: false as const, ...res };
  });
}

/** WhatsApp/Instagram inbound → durable queue (webhook returns 200 immediately). */
export async function enqueueInbound(channel: LeadSource, externalId: string, text: string, providerMessageId: string, name: string | null) {
  const { conversation, lead } = await findOrCreateConversation(channel, externalId, { name, phone: channel === "whatsapp" ? externalId : null });
  const msg = await recordInbound(conversation, lead, text, providerMessageId, name);
  await enqueue("inbound_message", conversation.id, { conversationId: conversation.id, messageId: msg.id });
  kickWorker();
  return { conversationId: conversation.id, messageId: msg.id, leadId: lead.id };
}

registerJobHandler("inbound_message", async (payload) => {
  const { conversationId, messageId } = payload as { conversationId: string; messageId: string };
  await conversationLock.run(conversationId, () => processInbound(conversationId, messageId));
});
