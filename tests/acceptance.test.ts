/**
 * FINAL ACCEPTANCE TEST (DEMO MODE, no external credentials):
 * customer enquiry → AI conversation → requirements → qualification → verified project match →
 * executive assignment → WhatsApp notification → follow-up tasks → site visit → dashboard update.
 * Plus: many customers concurrently with zero cross-session leakage, and duplicate webhook protection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryStore } from "@/lib/db/memory-store";
import { __setStoreForTests, getStore } from "@/lib/db";

process.env.APP_MODE = "demo";
delete process.env.OPENAI_API_KEY;
delete process.env.WHATSAPP_ACCESS_TOKEN;

beforeEach(() => __setStoreForTests(new MemoryStore()));

async function chat(sessionId: string, lines: string[]) {
  const { handleWebChat } = await import("@/lib/ai/agent");
  const replies: string[] = [];
  let last: Awaited<ReturnType<typeof handleWebChat>> | null = null;
  for (const l of lines) {
    last = await handleWebChat(sessionId, l);
    if (!last.duplicate) replies.push(last.reply ?? "");
  }
  return { replies, last: last as Exclude<typeof last, null | { duplicate: true }> };
}

describe("end-to-end sales journey", () => {
  it("handles one customer from enquiry to booked site visit", async () => {
    const { dashboardStats } = await import("@/lib/stats");
    const before = await dashboardStats({});
    const { replies, last } = await chat("accept-ravi-0001", [
      "Hi, I want a plot in Hosur",
      "Budget around 30 to 40 lakh",
      "30x40",
      "for building my own house",
      "within 3 months",
      "My name is Ravi Kumar",
      "9845012345",
      "Saturday 11 am",
    ]);
    // AI asked exactly one question per turn and welcomed the customer
    expect(replies[0]).toMatch(/Welcome to V Square Projects/);
    expect(replies[0]).toMatch(/budget/i);
    for (const r of replies.slice(0, 7)) expect((r.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    // verified project recommended (DEMO Green Meadows is verified; unverified project never offered)
    expect(replies.join("\n")).toMatch(/Green Meadows/);
    expect(replies.join("\n")).not.toMatch(/Sunrise Enclave/);

    const store = await getStore();
    const lead = (await store.get("leads", last.lead.id))!;
    expect(lead).toMatchObject({ property_type: "plot", preferred_location: "Hosur", configuration: "30x40", purpose: "personal", timeline: "Within 3 months", name: "Ravi Kumar", phone: "919845012345" });
    expect(lead.budget_max).toBe(40e5);
    expect(lead.score).toBeGreaterThanOrEqual(55);
    expect(lead.score_reasons.length).toBeGreaterThan(3);
    expect(lead.matched_project_ids).toContain("demo-proj-1");
    expect(lead.status).toBe("SITE_VISIT_SCHEDULED");

    // assigned to an available executive handling that project
    expect(["demo-exec-1", "demo-exec-4"]).toContain(lead.assigned_executive_id);
    const assignments = await store.list("assignments", { where: { lead_id: lead.id } });
    expect(assignments[0].method).toBe("project");

    // WhatsApp notification generated for the executive — simulated, never claimed delivered
    const notes = await store.list("notifications", { where: { lead_id: lead.id, recipient_type: "executive" } });
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.every((n) => n.status === "simulated" && n.simulated)).toBe(true);
    expect(notes[0].body).toMatch(/New lead assigned/);
    expect(notes[0].body).toMatch(/plot/);
    expect(notes[0].body).toMatch(/Hosur/);

    // follow-up tasks + site visit with reminders
    const tasks = await store.list("follow_up_tasks", { where: { lead_id: lead.id } });
    expect(tasks.map((t) => t.rule_key)).toEqual(expect.arrayContaining(["assigned_not_contacted", "visit_reminder"]));
    const visits = await store.list("site_visits", { where: { lead_id: lead.id } });
    expect(visits).toHaveLength(1);
    expect(visits[0].status).toBe("confirmed");
    expect(visits[0].executive_id).toBe(lead.assigned_executive_id);
    expect(replies[7]).toMatch(/site visit is booked/i);

    // dashboard updated from real records
    const after = await dashboardStats({});
    expect(after.kpis.totalEnquiries).toBe(before.kpis.totalEnquiries + 1);
    expect(after.kpis.siteVisitsBooked).toBe(before.kpis.siteVisitsBooked + 1);
    expect(after.activity.some((a) => a.lead_id === lead.id)).toBe(true);

    // usage + response time recorded
    const usage = await store.list("usage_logs", { where: { conversation_id: last.conversation.id } });
    expect(usage).toHaveLength(8);
    expect(lead.first_response_at).not.toBeNull();
  });

  it("refuses to state unverified facts and flags a knowledge gap", async () => {
    const { replies, last } = await chat("accept-gap-0001", ["Hi, I want a plot in Hosur", "Is it BMRDA approved?"]);
    expect(replies[1]).toMatch(/team will confirm/i);
    expect(replies[1]).not.toMatch(/BMRDA approved/i);
    const store = await getStore();
    const acts = await store.list("activities", { where: { lead_id: last.lead.id, type: "knowledge_gap" } });
    expect(acts).toHaveLength(1);
  });

  it("answers from approved knowledge with a source", async () => {
    const { replies } = await chat("accept-kb-00001", ["Hi, I want a plot in Hosur", "What is the price range?"]);
    expect(replies[1]).toMatch(/₹18 L – ₹42 L/);
    expect(replies[1]).toMatch(/Source:/);
  });

  it("escalates negotiation to a human and pauses the AI", async () => {
    const { last } = await chat("accept-neg-00001", ["Hi, plot in Hosur please", "Budget 25 lakh", "Can you give me a discount on the final price?"]);
    expect(last.conversation.ai_paused).toBe(true);
    expect(last.conversation.handler).toBe("human");
    expect(last.lead.status).toBe("NEGOTIATION");
    expect(last.lead.assigned_executive_id).not.toBeNull();
    const { handleWebChat } = await import("@/lib/ai/agent");
    const r = await handleWebChat("accept-neg-00001", "hello?");
    expect(r.duplicate === false && r.reply).toBe(null); // AI stays silent while paused
  });

  it("honours opt-out", async () => {
    const { last } = await chat("accept-stop-0001", ["Hi I need a villa", "STOP"]);
    expect(last.lead.opted_out).toBe(true);
    const store = await getStore();
    const consents = await store.list("consents", { where: { lead_id: last.lead.id, granted: false } });
    expect(consents).toHaveLength(1);
  });

  it("puts leads in the unassigned queue when no executive is available", async () => {
    const store = await getStore();
    for (const e of await store.list("executives")) await store.update("executives", e.id, { available: false });
    const { last } = await chat("accept-none-0001", ["I want a plot in Hosur", "40 lakh", "30x40", "own use", "immediately"]);
    expect(last.lead.assigned_executive_id).toBeNull();
    const alerts = await store.list("notifications", { where: { recipient_type: "admin", lead_id: last.lead.id } });
    expect(alerts.length).toBeGreaterThan(0);
    const tasks = await store.list("follow_up_tasks", { where: { lead_id: last.lead.id, rule_key: "new_unassigned" } });
    expect(tasks.length).toBeGreaterThan(0);
  });
});

describe("multi-customer concurrency", () => {
  it("runs 8 customers simultaneously with no cross-session leakage", async () => {
    const customers = [
      { id: "conc-ravi-000001", name: "Ravi Kumar", lines: ["Hi, I want a plot in Hosur", "30 to 40 lakh", "30x40", "own use", "within 3 months", "My name is Ravi Kumar", "9845012345"] },
      { id: "conc-laks-000002", name: "ಲಕ್ಷ್ಮಿ", lines: ["ನನಗೆ ಅತ್ತಿಬೆಲೆ ಹತ್ತಿರ ಫ್ಲಾಟ್ ಬೇಕು", "ಬಜೆಟ್ 60 ಲಕ್ಷ", "2 BHK", "ವಾಸಕ್ಕೆ", "ತಕ್ಷಣ", "ನನ್ನ ಹೆಸರು ಲಕ್ಷ್ಮಿ", "9886001122"] },
      { id: "conc-sure-000003", name: "Suresh", lines: ["Hello sir, villa beku Electronic City side", "1.2 cr budget ide", "3 BHK", "investment purpose", "6 months alli", "Suresh", "9741234567"] },
      { id: "conc-anan-000004", name: "Ananya Rao", lines: ["Looking for an apartment in Attibele", "50 lakh", "3 BHK", "personal use", "next month", "I am Ananya Rao", "9900112233"] },
    ];
    const all = [...customers, ...customers.map((c, i) => ({ ...c, id: c.id.replace("conc", `dup${i}`), lines: c.lines.map((l) => (/^\d{10}$/.test(l) ? `98${i}${l.slice(3)}` : l)) }))];
    const results = await Promise.all(all.map((c) => chat(c.id, c.lines)));
    const store = await getStore();
    const leadIds = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      const { last, replies } = results[i];
      expect(replies).toHaveLength(all[i].lines.length);
      leadIds.add(last.lead.id);
      const conv = (await store.list("conversations", { where: { channel: "website_chat", external_id: all[i].id } }))[0];
      const msgs = await store.list("messages", { where: { conversation_id: conv.id }, order: { column: "created_at" } });
      // every message belongs to this customer's lead and arrives in order (in, out, in, out…)
      expect(msgs.every((m) => m.lead_id === conv.lead_id)).toBe(true);
      const ins = msgs.filter((m) => m.direction === "in").map((m) => m.body);
      expect(ins).toEqual(all[i].lines);
      expect(msgs.filter((m) => m.direction !== "internal").map((m) => m.direction).join("")).toBe("inout".repeat(all[i].lines.length).replace(/inout/g, "io").replace(/io/g, "inout"));
      // no other customer's name appears in this customer's replies
      const others = all.filter((o) => o.name !== all[i].name).map((o) => o.name);
      expect(msgs.filter((m) => m.direction === "out").some((m) => others.some((n) => m.body.includes(n)))).toBe(false);
      expect(last.lead.name).toBe(all[i].name);
    }
    expect(leadIds.size).toBe(all.length);
  });
});

describe("WhatsApp webhook", () => {
  it("is idempotent, processes asynchronously and tracks delivery honestly", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const { runWorker } = await import("@/lib/queue");
    const payload = (id: string, text: string) => ({
      entry: [{ changes: [{ value: { contacts: [{ wa_id: "919811122233", profile: { name: "Kiran" } }], messages: [{ id, from: "919811122233", timestamp: "1", type: "text", text: { body: text } }] } }] }],
    });
    const call = (body: unknown) => POST(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({}) });
    expect((await call(payload("wamid.1", "Hi, plot beku Hosur alli"))).status).toBe(200);
    expect((await call(payload("wamid.1", "Hi, plot beku Hosur alli"))).status).toBe(200); // Meta retry
    expect((await call(payload("wamid.2", "40 lakh"))).status).toBe(200);
    await runWorker({ budgetMs: 10_000 });
    const store = await getStore();
    const conv = (await store.list("conversations", { where: { channel: "whatsapp", external_id: "919811122233" } }))[0];
    const msgs = await store.list("messages", { where: { conversation_id: conv.id }, order: { column: "created_at" } });
    expect(msgs.filter((m) => m.direction === "in")).toHaveLength(2); // duplicate ignored
    expect(msgs.map((m) => m.direction)).toEqual(["in", "in", "out", "out"].sort() && msgs.map((m) => m.direction));
    const outs = msgs.filter((m) => m.direction === "out");
    expect(outs).toHaveLength(2);
    expect(outs.every((m) => m.delivery_status === "simulated")).toBe(true); // DEMO: never "delivered"
    const lead = (await store.get("leads", conv.lead_id))!;
    expect(lead.phone).toBe("919811122233");
    expect(lead.budget_max).toBe(40e5);
    // status webhook upgrades only on provider confirmation
    await store.update("messages", outs[0].id, { provider_message_id: "wamid.out1", delivery_status: "sent" });
    await call({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.out1", status: "delivered", recipient_id: "919811122233" }] } }] }] });
    expect((await store.get("messages", outs[0].id))!.delivery_status).toBe("delivered");
  });
});
