import { NextResponse } from "next/server";
import { route, json, rateLimit, clientIp } from "@/lib/api";
import { ingestLead, LeadInputSchema } from "@/lib/leads";
import { assignLead } from "@/lib/assignment";
import { markIntegration } from "@/lib/integrations";

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "https://www.vsquareprojects.in,https://vsquareprojects.in").split(",").map((s) => s.trim());
function cors(origin: string | null) {
  const h: Record<string, string> = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (origin && (ALLOWED.includes(origin) || ALLOWED.includes("*"))) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

/** Public website contact/enquiry form endpoint (browser-safe: no secret, rate-limited, honeypot). */
export const POST = route(async (req) => {
  rateLimit(`enq:${clientIp(req)}`, 8, 60_000);
  const body = await req.json();
  if (body.website) return json({ ok: true }); // honeypot field filled => bot
  const input = LeadInputSchema.parse({ ...body, source: "website_form", external_id: undefined });
  if (input.consent !== true) return json({ error: "Please agree to be contacted" }, 400);
  const r = await ingestLead({ ...input, consent_text: input.consent_text ?? "I agree to be contacted by V Square Projects via phone/WhatsApp about my enquiry." }, "website_form");
  if (r.created) await assignLead(r.lead.id, { actor: "website_form", notifyCustomer: true });
  await markIntegration("website_webhook", { success: true, webhook: true });
  const res = json({ ok: true, reference: r.lead.id.slice(0, 8).toUpperCase() }, 201);
  Object.entries(cors(req.headers.get("origin"))).forEach(([k, v]) => res.headers.set(k, v));
  return res;
});
