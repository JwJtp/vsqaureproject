import "@/lib/runtime";
import { z } from "zod";
import { route, json, rateLimit, clientIp } from "@/lib/api";
import { handleWebChat } from "@/lib/ai/agent";
import { getStore } from "@/lib/db";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  text: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().max(64).optional(),
});

/** Public website chatbot endpoint. Each browser session = its own conversation. */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`chat:${ip}`, 40, 60_000);
  const body = Body.parse(await req.json());
  rateLimit(`chat-s:${body.sessionId}`, 15, 60_000);
  const r = await handleWebChat(body.sessionId, body.text, body.clientMessageId);
  if (r.duplicate) return json({ duplicate: true });
  return json({
    reply: r.reply,
    handledBy: r.handledBy,
    provider: r.provider,
    // Only this session's own captured details are returned (used by the demo panel).
    lead: {
      name: r.lead.name, phone: r.lead.phone, property_type: r.lead.property_type, preferred_location: r.lead.preferred_location,
      budget_text: r.lead.budget_text, budget_max: r.lead.budget_max, configuration: r.lead.configuration, purpose: r.lead.purpose,
      timeline: r.lead.timeline, site_visit_preference: r.lead.site_visit_preference, score: r.lead.score, priority: r.lead.priority,
      score_reasons: r.lead.score_reasons, status: r.lead.status, language: r.lead.language,
    },
    conversationId: r.conversation.id,
    escalated: r.conversation.escalated,
    intent: r.decision?.intent ?? null,
  });
});

/** Chat history for a session (widget reload). */
export const GET = route(async (req) => {
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json({ messages: [] });
  rateLimit(`chat-h:${clientIp(req)}`, 60, 60_000);
  const store = await getStore();
  const conv = (await store.list("conversations", { where: { channel: "website_chat", external_id: sessionId }, limit: 1 }))[0];
  if (!conv) return json({ messages: [] });
  const msgs = await store.list("messages", { where: { conversation_id: conv.id, direction: ["in", "out"] }, order: { column: "created_at" } });
  return json({ messages: msgs.map((m) => ({ id: m.id, direction: m.direction, body: m.body, created_at: m.created_at })) });
});
