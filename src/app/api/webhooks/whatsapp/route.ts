import "@/lib/runtime";
import { NextResponse } from "next/server";
import { route, json } from "@/lib/api";
import { env } from "@/lib/env";
import { verifyMetaSignature, safeEqual } from "@/lib/crypto";
import { parseWebhook, whatsappMode } from "@/lib/whatsapp";
import { enqueueInbound } from "@/lib/ai/agent";
import { getStore } from "@/lib/db";
import { syslog } from "@/lib/log";
import { markIntegration } from "@/lib/integrations";

/** Meta webhook verification handshake. */
export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const token = sp.get("hub.verify_token") ?? "";
  if (sp.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && safeEqual(token, env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return json({ error: "Verification failed" }, 403);
});

const RANK = { sent: 1, delivered: 2, read: 3, failed: 4 } as const;

export const POST = route(async (req) => {
  const raw = await req.text();
  const live = (await whatsappMode()) === "live";
  if (env.META_APP_SECRET) {
    if (!verifyMetaSignature(env.META_APP_SECRET, raw, req.headers.get("x-hub-signature-256"))) {
      await syslog("warn", "whatsapp", "Rejected webhook with invalid signature");
      return json({ error: "Invalid signature" }, 401);
    }
  } else if (live) {
    await syslog("error", "whatsapp", "META_APP_SECRET missing: refusing unsigned webhook in live mode");
    return json({ error: "Webhook signing secret not configured" }, 500);
  }
  const body = JSON.parse(raw || "{}");
  const { messages, statuses } = parseWebhook(body);
  const store = await getStore();
  await markIntegration("whatsapp", { webhook: true });

  for (const m of messages) {
    // Duplicate webhook protection: Meta retries deliveries; each message id is processed once.
    if (!(await store.claimEvent(`wa:${m.id}`, "whatsapp"))) continue;
    await enqueueInbound("whatsapp", m.from, m.text, m.id, m.name);
  }
  for (const s of statuses) {
    if (!(await store.claimEvent(`wa-status:${s.id}:${s.status}`, "whatsapp"))) continue;
    const [msg] = await store.list("messages", { where: { provider_message_id: s.id }, limit: 1 });
    if (msg && (RANK[s.status] > (RANK[msg.delivery_status as keyof typeof RANK] ?? 0))) {
      await store.update("messages", msg.id, { delivery_status: s.status, meta: { ...msg.meta, ...(s.error ? { error: s.error } : {}) } });
    }
    const [n] = await store.list("notifications", { where: { provider_message_id: s.id }, limit: 1 });
    if (n && (RANK[s.status] > (RANK[n.status as keyof typeof RANK] ?? 0))) await store.update("notifications", n.id, { status: s.status, error: s.error ?? n.error });
    if (s.status === "failed") await syslog("error", "whatsapp", `Delivery failed for ${s.recipient}: ${s.error ?? "unknown"}`, { provider_message_id: s.id });
  }
  // Always 200 quickly so Meta does not retry; processing continues in the background worker.
  return json({ received: messages.length, statuses: statuses.length });
});
