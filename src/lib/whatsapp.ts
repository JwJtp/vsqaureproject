import "server-only";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { withTimeout } from "@/lib/util";

/**
 * Meta WhatsApp Business Cloud API client.
 * LIVE when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set and simulation is not forced.
 * Otherwise every send returns status "simulated" — it is NEVER reported as delivered.
 * Delivery/read status only changes when Meta's status webhook confirms it.
 */

export async function whatsappMode(): Promise<"live" | "demo"> {
  const s = await getSettings();
  if (s.whatsapp.forceSimulation) return "demo";
  return env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? "live" : "demo";
}

export interface SendResult {
  ok: boolean;
  simulated: boolean;
  providerMessageId: string | null;
  status: "sent" | "simulated" | "failed";
  error?: string;
  retryable?: boolean;
}

type WaPayload =
  | { type: "text"; text: { body: string; preview_url?: boolean } }
  | { type: "template"; template: { name: string; language: { code: string }; components?: unknown[] } }
  | { type: "interactive"; interactive: unknown };

async function send(to: string, payload: WaPayload): Promise<SendResult> {
  if ((await whatsappMode()) === "demo") {
    return { ok: true, simulated: true, providerMessageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, status: "simulated" };
  }
  const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
      }),
      15_000,
      "WhatsApp send",
    );
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string; code: number } };
    if (!res.ok || !json.messages?.[0]?.id) {
      return {
        ok: false,
        simulated: false,
        providerMessageId: null,
        status: "failed",
        error: json.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }
    // "sent" = accepted by Meta. Delivered/read arrive later via the status webhook.
    return { ok: true, simulated: false, providerMessageId: json.messages[0].id, status: "sent" };
  } catch (e) {
    return { ok: false, simulated: false, providerMessageId: null, status: "failed", error: (e as Error).message, retryable: true };
  }
}

export const sendText = (to: string, body: string) => send(to, { type: "text", text: { body: body.slice(0, 4096), preview_url: false } });

export function sendTemplate(to: string, name: string, language: string, bodyParams: string[]) {
  return send(to, {
    type: "template",
    template: {
      name,
      language: { code: language },
      components: bodyParams.length ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t.slice(0, 1000) })) }] : undefined,
    },
  });
}

export function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  });
}

/** The 24-hour customer service window: free-form messages allowed only within 24h of the customer's last message. */
export function withinServiceWindow(lastCustomerMessageAt: string | null, now = Date.now()): boolean {
  if (!lastCustomerMessageAt) return false;
  return now - Date.parse(lastCustomerMessageAt) < 24 * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Webhook parsing
// ---------------------------------------------------------------------------
export interface InboundWaMessage {
  id: string;
  from: string;
  name: string | null;
  timestamp: string;
  text: string;
  type: string;
}
export interface WaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient: string;
  error?: string;
}

interface WaWebhook {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          button?: { text: string };
          interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
        }[];
        statuses?: { id: string; status: WaStatus["status"]; recipient_id: string; errors?: { title?: string; message?: string }[] }[];
      };
    }[];
  }[];
}

export function parseWebhook(body: unknown): { messages: InboundWaMessage[]; statuses: WaStatus[] } {
  const messages: InboundWaMessage[] = [];
  const statuses: WaStatus[] = [];
  for (const entry of (body as WaWebhook)?.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (!v) continue;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type} message]`;
        messages.push({ id: m.id, from: m.from, name: names.get(m.from) ?? null, timestamp: m.timestamp, text, type: m.type });
      }
      for (const s of v.statuses ?? []) {
        statuses.push({ id: s.id, status: s.status, recipient: s.recipient_id, error: s.errors?.[0]?.message ?? s.errors?.[0]?.title });
      }
    }
  }
  return { messages, statuses };
}

/** Instagram Messaging (via the Facebook Page linked to the Instagram professional account). */
export async function sendInstagram(recipientId: string, text: string): Promise<SendResult> {
  if (!env.META_PAGE_ACCESS_TOKEN) {
    return { ok: true, simulated: true, providerMessageId: `sim_ig_${Date.now()}`, status: "simulated" };
  }
  try {
    const res = await withTimeout(
      fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text: text.slice(0, 1000) }, messaging_type: "RESPONSE" }),
      }),
      15_000,
      "Instagram send",
    );
    const j = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message: string } };
    if (!res.ok || !j.message_id) return { ok: false, simulated: false, providerMessageId: null, status: "failed", error: j.error?.message ?? `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 };
    return { ok: true, simulated: false, providerMessageId: j.message_id, status: "sent" };
  } catch (e) {
    return { ok: false, simulated: false, providerMessageId: null, status: "failed", error: (e as Error).message, retryable: true };
  }
}

export async function testWhatsApp(): Promise<{ ok: boolean; detail: string }> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok: false, detail: "WhatsApp credentials not set — running in DEMO MODE" };
  try {
    const r = await withTimeout(
      fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      }),
      10_000,
      "WhatsApp test",
    );
    const j = (await r.json()) as { display_phone_number?: string; verified_name?: string; error?: { message: string } };
    return r.ok ? { ok: true, detail: `Connected: ${j.verified_name ?? ""} ${j.display_phone_number ?? ""}`.trim() } : { ok: false, detail: j.error?.message ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
