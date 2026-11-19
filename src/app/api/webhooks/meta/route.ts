import "@/lib/runtime";
import { NextResponse } from "next/server";
import { route, json } from "@/lib/api";
import { env } from "@/lib/env";
import { verifyMetaSignature, safeEqual } from "@/lib/crypto";
import { getStore } from "@/lib/db";
import { ingestLead } from "@/lib/leads";
import { assignLead } from "@/lib/assignment";
import { enqueueInbound } from "@/lib/ai/agent";
import { markIntegration } from "@/lib/integrations";
import { syslog } from "@/lib/log";
import { withTimeout } from "@/lib/util";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && safeEqual(sp.get("hub.verify_token") ?? "", env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return json({ error: "Verification failed" }, 403);
});

interface MetaBody {
  object?: string;
  entry?: {
    changes?: { field: string; value: { leadgen_id?: string; form_id?: string; page_id?: string; ad_id?: string } }[];
    messaging?: { sender: { id: string }; message?: { mid: string; text?: string; is_echo?: boolean } }[];
  }[];
}

async function fetchLead(leadgenId: string) {
  const r = await withTimeout(fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${leadgenId}?access_token=${encodeURIComponent(env.META_PAGE_ACCESS_TOKEN!)}`), 10_000, "Meta lead fetch");
  if (!r.ok) throw new Error(`Meta lead fetch HTTP ${r.status}`);
  const j = (await r.json()) as { field_data?: { name: string; values: string[] }[]; created_time?: string };
  const f = Object.fromEntries((j.field_data ?? []).map((x) => [x.name.toLowerCase(), x.values?.[0] ?? ""]));
  return {
    name: f.full_name ?? f.name ?? ([f.first_name, f.last_name].filter(Boolean).join(" ") || null),
    phone: f.phone_number ?? f.phone ?? null,
    email: f.email || null,
    message: Object.entries(f).filter(([k]) => !["full_name", "name", "phone_number", "phone", "email", "first_name", "last_name"].includes(k)).map(([k, v]) => `${k}: ${v}`).join("\n") || null,
  };
}

/** Facebook Lead Ads (leadgen) + Instagram messaging webhooks. */
export const POST = route(async (req) => {
  const raw = await req.text();
  if (!env.META_APP_SECRET || !verifyMetaSignature(env.META_APP_SECRET, raw, req.headers.get("x-hub-signature-256"))) {
    return json({ error: "Invalid or missing signature (META_APP_SECRET required)" }, 401);
  }
  const body = JSON.parse(raw) as MetaBody;
  const store = await getStore();
  await markIntegration("meta_leads", { webhook: true });
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "leadgen" || !ch.value.leadgen_id) continue;
      if (!(await store.claimEvent(`fb-lead:${ch.value.leadgen_id}`, "meta"))) continue;
      try {
        if (!env.META_PAGE_ACCESS_TOKEN) throw new Error("META_PAGE_ACCESS_TOKEN missing — cannot retrieve lead details");
        const d = await fetchLead(ch.value.leadgen_id);
        const r = await ingestLead({ source: "facebook_lead", source_detail: `form ${ch.value.form_id ?? ""} ad ${ch.value.ad_id ?? ""}`.trim(), ...d, consent: true, consent_text: "Submitted via Facebook Lead Ad form" }, "meta");
        if (r.created) await assignLead(r.lead.id, { actor: "meta", notifyCustomer: true });
        await markIntegration("meta_leads", { success: true });
      } catch (e) {
        await markIntegration("meta_leads", { error: (e as Error).message });
        await syslog("error", "meta", `Lead ${ch.value.leadgen_id} failed: ${(e as Error).message}`);
      }
    }
    for (const m of entry.messaging ?? []) {
      if (!m.message?.text || m.message.is_echo) continue;
      if (!(await store.claimEvent(`ig:${m.message.mid}`, "instagram"))) continue;
      await enqueueInbound("instagram", m.sender.id, m.message.text, m.message.mid, null);
    }
  }
  return json({ ok: true });
});
