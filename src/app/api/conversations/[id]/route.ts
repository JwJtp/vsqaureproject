import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, assertLeadAccess, HttpError, isStaffAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { activity, audit } from "@/lib/log";
import { sendOutbound, conversationLock } from "@/lib/ai/agent";
import { withinServiceWindow } from "@/lib/whatsapp";
import { notifyAdmins } from "@/lib/notify";
import { nowIso } from "@/lib/util";

type P = { params: Promise<{ id: string }> };

async function load(id: string) {
  const store = await getStore();
  const conv = await store.get("conversations", id);
  if (!conv) throw new HttpError(404, "Conversation not found");
  const lead = (await store.get("leads", conv.lead_id))!;
  return { store, conv, lead };
}

export const GET = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const { store, conv, lead } = await load(id);
  assertLeadAccess(user, lead);
  const messages = await store.list("messages", { where: { conversation_id: id }, order: { column: "created_at" } });
  const notes = await store.list("notes", { where: { lead_id: lead.id }, order: { column: "created_at", ascending: false } });
  const exec = lead.assigned_executive_id ? await store.get("executives", lead.assigned_executive_id) : null;
  return json({ conversation: conv, lead, messages, notes, executive: exec, serviceWindowOpen: withinServiceWindow(conv.last_customer_message_at) });
});

const Action = z.object({
  action: z.enum(["takeover", "pause", "resume", "send", "close", "escalate", "note"]),
  text: z.string().trim().max(4000).optional(),
});

export const POST = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const { store, conv, lead } = await load(id);
  assertLeadAccess(user, lead);
  const { action, text } = Action.parse(await req.json());
  const now = nowIso();
  switch (action) {
    case "takeover":
      await store.update("conversations", id, { handler: "human", ai_paused: true });
      await activity(lead.id, "human_takeover", `${user.name} took over the conversation`, user.email);
      break;
    case "pause":
      await store.update("conversations", id, { ai_paused: true });
      await activity(lead.id, "ai_paused", `AI paused by ${user.name}`, user.email);
      break;
    case "resume":
      await store.update("conversations", id, { ai_paused: false, handler: "ai", escalated: false, escalation_reason: null });
      await activity(lead.id, "ai_resumed", `AI resumed by ${user.name}`, user.email);
      break;
    case "close":
      await store.update("conversations", id, { status: "closed" });
      break;
    case "escalate":
      if (!isStaffAdmin(user) && user.role !== "executive") throw new HttpError(403, "Not allowed");
      await store.update("conversations", id, { escalated: true, escalation_reason: text || `Escalated by ${user.name}` });
      await notifyAdmins(`🚩 ${user.name} escalated ${lead.name ?? "a customer"} to management: ${text ?? ""}`, lead.id);
      await activity(lead.id, "escalated", `Escalated to management by ${user.name}${text ? `: ${text}` : ""}`, user.email);
      break;
    case "note":
      if (!text) throw new HttpError(400, "Note text required");
      await store.insert("notes", { lead_id: lead.id, author: user.name, body: text });
      await store.insert("messages", { conversation_id: id, lead_id: lead.id, direction: "internal", sender: "executive", sender_name: user.name, body: text, provider_message_id: null, delivery_status: "sent", meta: { internal_note: true } });
      break;
    case "send": {
      if (!text) throw new HttpError(400, "Message text required");
      if (lead.opted_out) throw new HttpError(409, "Customer has opted out — messages cannot be sent");
      if (conv.channel === "whatsapp" && !withinServiceWindow(conv.last_customer_message_at)) {
        throw new HttpError(409, "Outside WhatsApp 24-hour window — use an approved template (Follow-up Automation) instead");
      }
      // Sending as a human automatically pauses the AI to avoid double replies.
      await conversationLock.run(id, async () => {
        await store.update("conversations", id, { handler: "human", ai_paused: true });
        await sendOutbound(conv, lead, text, "executive", { by: user.email, by_name: user.name });
        await store.update("conversations", id, { last_message_at: now });
      });
      if (!lead.contacted_at) await store.update("leads", lead.id, { contacted_at: now, ...(lead.status === "ASSIGNED" ? { status: "CONTACTED" as const } : {}) });
      await activity(lead.id, "human_message", `${user.name} replied to the customer`, user.email);
      break;
    }
  }
  await audit(user.email, `conversation.${action}`, "conversations", id);
  const fresh = await load(id);
  return json({ conversation: fresh.conv });
});
