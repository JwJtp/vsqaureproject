// Server-side environment access. Never import secrets into client components.

export const env = {
  APP_MODE: process.env.APP_MODE ?? "auto", // auto | demo | live
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION ?? "v21.0",
  META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN,
  LEAD_WEBHOOK_SECRET: process.env.LEAD_WEBHOOK_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  NOTIFY_EMAIL_FROM: process.env.NOTIFY_EMAIL_FROM,
  ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL,
  ADMIN_ALERT_WHATSAPP: process.env.ADMIN_ALERT_WHATSAPP,
};

export function isLiveData(): boolean {
  if (env.APP_MODE === "demo") return false;
  const has = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  if (env.APP_MODE === "live" && !has) {
    throw new Error("APP_MODE=live requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return has;
}

export function dataMode(): "demo" | "live" {
  return isLiveData() ? "live" : "demo";
}
