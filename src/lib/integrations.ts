import "server-only";
import { getStore } from "@/lib/db";
import { env, dataMode } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { testOpenAI } from "@/lib/ai/openai";
import { testWhatsApp } from "@/lib/whatsapp";
import { canEncrypt } from "@/lib/crypto";
import { nowIso } from "@/lib/util";

export interface IntegrationStatus {
  id: string;
  name: string;
  mode: "live" | "demo" | "not_configured";
  configured: { key: string; set: boolean }[];
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastWebhookAt: string | null;
  setup: string[];
  webhookUrl?: string;
}

export async function integrationStatuses(): Promise<IntegrationStatus[]> {
  const store = await getStore();
  const s = await getSettings();
  const rows = new Map((await store.list("integrations")).map((r) => [r.id, r]));
  const base = (id: string) => ({
    lastSuccessAt: rows.get(id)?.last_success_at ?? null,
    lastError: rows.get(id)?.last_error ?? null,
    lastErrorAt: rows.get(id)?.last_error_at ?? null,
    lastWebhookAt: rows.get(id)?.last_webhook_at ?? null,
  });
  const has = (k: keyof typeof env) => ({ key: k, set: !!env[k] });
  return [
    {
      id: "openai",
      name: "OpenAI",
      mode: env.OPENAI_API_KEY && !s.ai.forceSimulation ? "live" : "demo",
      configured: [has("OPENAI_API_KEY")],
      ...base("openai"),
      setup: ["Create an API key at platform.openai.com → API keys.", "Set OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables.", "Choose the model and budgets in AI Agent Settings."],
    },
    {
      id: "whatsapp",
      name: "WhatsApp Business Cloud API",
      mode: env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && !s.whatsapp.forceSimulation ? "live" : "demo",
      configured: [has("WHATSAPP_ACCESS_TOKEN"), has("WHATSAPP_PHONE_NUMBER_ID"), has("WHATSAPP_BUSINESS_ACCOUNT_ID"), has("WHATSAPP_VERIFY_TOKEN"), has("META_APP_SECRET")],
      ...base("whatsapp"),
      webhookUrl: `${env.APP_URL}/api/webhooks/whatsapp`,
      setup: [
        "Meta Business Manager → create an app (type Business) and add the WhatsApp product.",
        "Add and verify the business phone number; copy the Phone number ID and WhatsApp Business Account ID.",
        "Create a System User with a permanent access token (whatsapp_business_messaging, whatsapp_business_management).",
        "Webhook: set Callback URL below and the same WHATSAPP_VERIFY_TOKEN; subscribe to 'messages'.",
        "Submit the message templates listed in Admin Settings for approval.",
      ],
    },
    {
      id: "supabase",
      name: "Supabase (database & auth)",
      mode: dataMode() === "live" ? "live" : "demo",
      configured: [has("SUPABASE_URL"), has("SUPABASE_ANON_KEY"), has("SUPABASE_SERVICE_ROLE_KEY"), { key: "ENCRYPTION_KEY", set: canEncrypt() }],
      ...base("supabase"),
      setup: ["Create a Supabase project.", "Run the SQL files in supabase/migrations in order.", "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.", "Create the first admin user (see README)."],
    },
    {
      id: "website_webhook",
      name: "Website enquiry webhook",
      mode: env.LEAD_WEBHOOK_SECRET ? "live" : "not_configured",
      configured: [has("LEAD_WEBHOOK_SECRET")],
      ...base("website_webhook"),
      webhookUrl: `${env.APP_URL}/api/webhooks/lead`,
      setup: ["POST JSON to the URL below with header X-Signature: sha256=HMAC(body, LEAD_WEBHOOK_SECRET).", "Or embed the chat widget: <script src=\"" + env.APP_URL + "/widget.js\" async></script>"],
    },
    {
      id: "meta_leads",
      name: "Facebook lead forms & Instagram",
      mode: env.META_PAGE_ACCESS_TOKEN && env.META_APP_SECRET ? "live" : "demo",
      configured: [has("META_PAGE_ACCESS_TOKEN"), has("META_APP_SECRET")],
      ...base("meta_leads"),
      webhookUrl: `${env.APP_URL}/api/webhooks/meta`,
      setup: ["In your Meta app add Webhooks → Page → subscribe to 'leadgen' (and Instagram → 'messages').", "Grant leads_retrieval, pages_manage_metadata, instagram_manage_messages via App Review.", "Set META_PAGE_ACCESS_TOKEN (long-lived Page token)."],
    },
    {
      id: "email",
      name: "Email notifications (Resend)",
      mode: env.RESEND_API_KEY ? "live" : "not_configured",
      configured: [has("RESEND_API_KEY"), has("NOTIFY_EMAIL_FROM"), has("ADMIN_ALERT_EMAIL")],
      ...base("email"),
      setup: ["Create a Resend account and verify your sending domain.", "Set RESEND_API_KEY, NOTIFY_EMAIL_FROM and ADMIN_ALERT_EMAIL."],
    },
  ];
}

export async function markIntegration(id: string, patch: { success?: boolean; error?: string | null; webhook?: boolean }) {
  try {
    const store = await getStore();
    const now = nowIso();
    await store.upsert("integrations", {
      id,
      ...(patch.success ? { last_success_at: now } : {}),
      ...(patch.error ? { last_error: patch.error.slice(0, 500), last_error_at: now } : {}),
      ...(patch.webhook ? { last_webhook_at: now } : {}),
    });
  } catch {
    /* non-critical */
  }
}

export async function testIntegration(id: string): Promise<{ ok: boolean; detail: string }> {
  let r: { ok: boolean; detail: string };
  switch (id) {
    case "openai": r = await testOpenAI(); break;
    case "whatsapp": r = await testWhatsApp(); break;
    case "supabase":
      try {
        const store = await getStore();
        await store.count("leads");
        r = { ok: true, detail: store.kind === "supabase" ? "Database reachable" : "DEMO MODE — in-memory store (no Supabase configured)" };
      } catch (e) {
        r = { ok: false, detail: (e as Error).message };
      }
      break;
    default:
      r = { ok: false, detail: "No active test for this integration — send a test webhook instead" };
  }
  await markIntegration(id, r.ok ? { success: true } : { error: r.detail });
  return r;
}
