import "@/lib/runtime";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { dataMode } from "@/lib/env";
import { resetDemoStore, getStore } from "@/lib/db";
import { handleWebChat, enqueueInbound } from "@/lib/ai/agent";
import { runWorker } from "@/lib/queue";
import { runDueFollowUps } from "@/lib/followups";
import { audit } from "@/lib/log";

const SCRIPTS: { name: string; lines: string[] }[] = [
  { name: "Ravi (English)", lines: ["Hi, I want a plot in Hosur", "Budget around 30 to 40 lakh", "30x40", "for building my own house", "within 3 months", "My name is Ravi Kumar", "9845012345", "Saturday 11 am"] },
  { name: "Lakshmi (Kannada)", lines: ["ನಮಸ್ಕಾರ, ನನಗೆ ಅತ್ತಿಬೆಲೆ ಹತ್ತಿರ ಫ್ಲಾಟ್ ಬೇಕು", "ಬಜೆಟ್ 60 ಲಕ್ಷ", "2 BHK", "ನಮ್ಮ ಮನೆಗೆ ವಾಸಕ್ಕೆ", "ತಕ್ಷಣ", "ನನ್ನ ಹೆಸರು ಲಕ್ಷ್ಮಿ", "9886001122", "ನಾಳೆ 3 pm"] },
  { name: "Suresh (Kanglish)", lines: ["Hello sir, villa beku Electronic City side", "1.2 cr budget ide", "3 BHK", "investment purpose", "6 months alli", "Suresh", "9741234567", "illa, later"] },
  { name: "Divya (negotiation)", lines: ["Hi, plot in Hosur please", "Budget 25 lakh", "Can you give me a discount on the final price?"] },
];

/** DEMO MODE tools: reset, concurrency stress test, simulated WhatsApp inbound. Disabled in LIVE mode. */
export const POST = route(async (req) => {
  const user = await requireUser(["admin"]);
  if (dataMode() !== "demo") throw new HttpError(403, "Demo tools are disabled in LIVE mode");
  const body = z.object({ action: z.enum(["reset", "concurrent", "whatsapp", "followups"]), customers: z.number().int().min(2).max(12).optional(), phone: z.string().optional(), name: z.string().optional(), text: z.string().max(2000).optional() }).parse(await req.json());

  if (body.action === "reset") {
    await resetDemoStore();
    return json({ ok: true });
  }
  if (body.action === "followups") return json(await runDueFollowUps(new Date(Date.now() + 7 * 86400000)));

  if (body.action === "whatsapp") {
    if (!body.phone || !body.text) throw new HttpError(400, "phone and text required");
    const r = await enqueueInbound("whatsapp", body.phone.replace(/\D/g, ""), body.text, `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`, body.name ?? null);
    await runWorker({ budgetMs: 20_000 });
    const store = await getStore();
    const msgs = await store.list("messages", { where: { conversation_id: r.conversationId }, order: { column: "created_at" } });
    return json({ ...r, messages: msgs.slice(-4) });
  }

  // Concurrency test: N customers chat simultaneously; each message waits for its own reply,
  // all customers run in parallel. Afterwards we verify no data crossed between sessions.
  const n = body.customers ?? 4;
  const started = Date.now();
  const runs = Array.from({ length: n }, (_, i) => {
    const script = SCRIPTS[i % SCRIPTS.length];
    const sessionId = `concurrency-${started}-${i}`;
    return (async () => {
      const replies: string[] = [];
      let lead = null;
      for (const line of script.lines) {
        const r = await handleWebChat(sessionId, line);
        if (!r.duplicate) {
          replies.push(r.reply ?? "");
          lead = r.lead;
        }
      }
      return { customer: script.name, sessionId, replies: replies.length, lead };
    })();
  });
  const results = await Promise.all(runs);
  const ms = Date.now() - started;
  // Isolation checks
  const store = await getStore();
  const isolation = [];
  for (const r of results) {
    const conv = (await store.list("conversations", { where: { channel: "website_chat", external_id: r.sessionId } }))[0];
    const msgs = await store.list("messages", { where: { conversation_id: conv.id } });
    const foreign = msgs.filter((m) => m.lead_id !== conv.lead_id).length;
    const otherNames = results.filter((o) => o !== r && o.lead?.name).map((o) => o.lead!.name!);
    const leaked = msgs.filter((m) => m.direction === "out" && otherNames.some((nm) => r.lead?.name !== nm && m.body.includes(nm))).length;
    isolation.push({ customer: r.customer, leadId: conv.lead_id, messages: msgs.length, foreignMessages: foreign, leakedNames: leaked, ok: foreign === 0 && leaked === 0 });
  }
  await audit(user.email, "demo.concurrency_test", "conversations", null, { customers: n, ms });
  return json({ customers: n, totalMs: ms, results: results.map((r) => ({ customer: r.customer, replies: r.replies, name: r.lead?.name, status: r.lead?.status, score: r.lead?.score, assigned: !!r.lead?.assigned_executive_id })), isolation, allIsolated: isolation.every((i) => i.ok) });
});
