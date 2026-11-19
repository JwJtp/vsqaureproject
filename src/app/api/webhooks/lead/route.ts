import { route, json, rateLimit, clientIp } from "@/lib/api";
import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqual, sha256 } from "@/lib/crypto";
import { ingestLead, LeadInputSchema } from "@/lib/leads";
import { assignLead } from "@/lib/assignment";
import { getStore } from "@/lib/db";
import { markIntegration } from "@/lib/integrations";
import { HttpError } from "@/lib/auth";

/**
 * Server-to-server lead webhook for ad platforms, landing-page builders and external CRMs.
 * Auth: header X-Signature: sha256=<hex HMAC of raw body with LEAD_WEBHOOK_SECRET>.
 * Idempotency: header Idempotency-Key (or body.external_id).
 */
export const POST = route(async (req) => {
  rateLimit(`lead-wh:${clientIp(req)}`, 120, 60_000);
  const raw = await req.text();
  if (!env.LEAD_WEBHOOK_SECRET) throw new HttpError(503, "LEAD_WEBHOOK_SECRET is not configured");
  const sig = req.headers.get("x-signature") ?? "";
  if (!sig.startsWith("sha256=") || !safeEqual(sig.slice(7), hmacSha256Hex(env.LEAD_WEBHOOK_SECRET, raw))) {
    await markIntegration("website_webhook", { error: "Invalid signature received" });
    throw new HttpError(401, "Invalid signature");
  }
  const body = JSON.parse(raw);
  const input = LeadInputSchema.parse({ source: "webhook", ...body });
  const idem = req.headers.get("idempotency-key") ?? input.external_id ?? sha256(raw);
  const store = await getStore();
  if (!(await store.claimEvent(`lead:${idem}`, "lead_webhook"))) return json({ duplicate: true }, 200);
  const r = await ingestLead(input, `webhook:${input.source_detail ?? "external"}`);
  if (r.created) await assignLead(r.lead.id, { actor: "webhook", notifyCustomer: !!input.consent });
  await markIntegration("website_webhook", { success: true, webhook: true });
  return json({ leadId: r.lead.id, created: r.created, duplicate: r.duplicate }, r.created ? 201 : 200);
});
