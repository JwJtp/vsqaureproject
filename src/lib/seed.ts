import type { Store } from "@/lib/db/store";
import type { Lead, LeadSource, LeadStatus, PropertyType, Project, Executive, FollowUpRule } from "@/lib/types";
import { chunkText } from "@/lib/knowledge/chunk";

/**
 * DEMO seed data. Every person, phone number, project, price and statistic below is
 * FICTIONAL and flagged is_demo = true. Real V Square project data must be entered by an
 * admin in the Knowledge Base and marked verified before the AI may use it.
 */

export const DEFAULT_FOLLOW_UP_RULES: Omit<FollowUpRule, "id" | "created_at" | "updated_at">[] = [
  {
    key: "new_unassigned",
    name: "New lead not assigned",
    description: "Alert admins if a lead remains unassigned.",
    delay_minutes: 15,
    escalate_after_minutes: 60,
    channel: "internal",
    template: "Lead {{name}} ({{property_type}}) has been unassigned for {{delay}} minutes.",
    respect_working_hours: false,
    active: true,
  },
  {
    key: "assigned_not_contacted",
    name: "Assigned lead not contacted",
    description: "Remind the executive, then escalate to management.",
    delay_minutes: 60,
    escalate_after_minutes: 240,
    channel: "whatsapp_executive",
    template: "Reminder: please contact {{name}} ({{phone}}) — {{property_type}} in {{location}}, budget {{budget}}.",
    respect_working_hours: true,
    active: true,
  },
  {
    key: "awaiting_callback",
    name: "Interested customer awaiting callback",
    description: "Customer asked for a call back.",
    delay_minutes: 30,
    escalate_after_minutes: 180,
    channel: "whatsapp_executive",
    template: "{{name}} is waiting for your call back about {{property_type}} in {{location}}.",
    respect_working_hours: true,
    active: true,
  },
  {
    key: "visit_pending_confirmation",
    name: "Site visit pending confirmation",
    description: "Visit requested but not confirmed by the team.",
    delay_minutes: 120,
    escalate_after_minutes: 480,
    channel: "whatsapp_executive",
    template: "Please confirm the site visit requested by {{name}} on {{visit_time}}.",
    respect_working_hours: true,
    active: true,
  },
  {
    key: "visit_reminder",
    name: "Site visit reminder",
    description: "Reminder to customer and executive before the visit.",
    delay_minutes: 0,
    escalate_after_minutes: null,
    channel: "whatsapp_customer",
    template: "Hi {{name}}, a reminder of your V Square Projects site visit on {{visit_time}}. Reply here to reschedule.",
    respect_working_hours: false,
    active: true,
  },
  {
    key: "visit_completed",
    name: "Site visit completed",
    description: "Thank the customer and ask for feedback the day after the visit.",
    delay_minutes: 1440,
    escalate_after_minutes: null,
    channel: "whatsapp_customer",
    template: "Hi {{name}}, thank you for visiting with V Square Projects. Do you have any questions we can help with?",
    respect_working_hours: true,
    active: true,
  },
  {
    key: "later_follow_up",
    name: "Customer requested later follow-up",
    description: "Customer asked to be contacted later.",
    delay_minutes: 4320,
    escalate_after_minutes: null,
    channel: "whatsapp_executive",
    template: "Follow up with {{name}} — they asked to be contacted later about {{property_type}}.",
    respect_working_hours: true,
    active: true,
  },
];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function seedFollowUpRules(store: Store) {
  const existing = await store.list("follow_up_rules");
  for (const r of DEFAULT_FOLLOW_UP_RULES) {
    if (!existing.find((e) => e.key === r.key)) await store.insert("follow_up_rules", { ...r, id: `rule_${r.key}` });
  }
}

export async function seedDemo(store: Store) {
  if (store.kind !== "memory") return; // never seed production
  const rand = rng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  await seedFollowUpRules(store);

  const projects: Partial<Project>[] = [
    {
      id: "demo-proj-1",
      name: "DEMO · Green Meadows Layout",
      location: "Hosur",
      property_type: "plot",
      plot_dimensions: "30x40, 30x50, 40x60 (DEMO)",
      price_range: "₹18 L – ₹42 L (DEMO figure)",
      inventory: "Limited plots (DEMO)",
      amenities: ["Gated entry", "Avenue trees", "Children's park", "Underground drainage"],
      specifications: "Black-top roads, street lights, water connection (DEMO)",
      approvals: "DEMO: approval details to be entered by admin",
      faqs: [{ q: "Is bank loan available?", a: "DEMO: Loan assistance is available through partner banks." }],
      sales_contact: "DEMO sales desk",
      configurations: null,
    },
    {
      id: "demo-proj-2",
      name: "DEMO · Silver Oak Villas",
      location: "Electronic City",
      property_type: "villa",
      configurations: "3 BHK and 4 BHK villas (DEMO)",
      plot_dimensions: null,
      price_range: "₹95 L – ₹1.6 Cr (DEMO figure)",
      inventory: "Phase 1 open (DEMO)",
      amenities: ["Clubhouse", "Swimming pool", "Gym", "24x7 security"],
      specifications: "Vitrified flooring, modular kitchen provision (DEMO)",
      approvals: "DEMO: approval details to be entered by admin",
      faqs: [],
      sales_contact: "DEMO sales desk",
    },
    {
      id: "demo-proj-3",
      name: "DEMO · Skyline Residency",
      location: "Attibele",
      property_type: "apartment",
      configurations: "2 BHK and 3 BHK (DEMO)",
      plot_dimensions: null,
      price_range: "₹48 L – ₹82 L (DEMO figure)",
      inventory: "Few units left (DEMO)",
      amenities: ["Lift", "Power backup", "Covered parking", "Rooftop garden"],
      specifications: "RCC framed structure (DEMO)",
      approvals: "DEMO: approval details to be entered by admin",
      faqs: [],
      sales_contact: "DEMO sales desk",
    },
    {
      id: "demo-proj-4",
      name: "DEMO · Sunrise Enclave (unverified)",
      location: "Sarjapur",
      property_type: "plot",
      plot_dimensions: "Pending verification",
      price_range: null,
      inventory: null,
      amenities: [],
      specifications: null,
      approvals: null,
      faqs: [],
      sales_contact: null,
      configurations: null,
      verified: false,
    },
  ];
  for (const p of projects) {
    await store.insert("projects", {
      verified: true,
      verified_by: "demo-admin",
      version: 1,
      is_demo: true,
      instructions: null,
      ...p,
    });
  }

  const execs: Partial<Executive>[] = [
    { id: "demo-exec-1", name: "Arjun Rao", phone: "919900000001", email: "arjun.demo@example.com", project_ids: ["demo-proj-1"], expertise: ["plot", "investment"], locations: ["Hosur"] },
    { id: "demo-exec-2", name: "Priya Shetty", phone: "919900000002", email: "priya.demo@example.com", project_ids: ["demo-proj-2"], expertise: ["villa"], locations: ["Electronic City"] },
    { id: "demo-exec-3", name: "Kiran Gowda", phone: "919900000003", email: "kiran.demo@example.com", project_ids: ["demo-proj-3"], expertise: ["apartment"], locations: ["Attibele", "Hosur"] },
    { id: "demo-exec-4", name: "Meera Nair", phone: "919900000004", email: "meera.demo@example.com", project_ids: ["demo-proj-1", "demo-proj-3"], expertise: ["plot", "apartment"], locations: ["Hosur"] },
    { id: "demo-exec-5", name: "Sanjay Kumar", phone: "919900000005", email: "sanjay.demo@example.com", project_ids: [], expertise: ["investment", "villa"], locations: [], available: false },
  ];
  for (const e of execs) {
    await store.insert("executives", { user_id: null, available: true, active: true, daily_capacity: 12, is_demo: true, ...e });
  }

  // Knowledge documents
  const docs = [
    {
      id: "doc-company",
      title: "Company overview & contact (from public website)",
      project_id: null,
      status: "approved" as const,
      content:
        "V Square Projects deals in residential plots, villas and apartments. Office: Shop No: 2, GRK Complex, Next to John Bosco School, Shanti Nagar, Hosur – 635109. Phone: +91 87545 88991. Email: sales@vsquareprojects.in. Services include property discovery and site visits, approval and compliance management support, home loan assistance and post-sales customer support.",
    },
    {
      id: "doc-claims",
      title: "Website marketing claims — PENDING VERIFICATION",
      project_id: null,
      status: "draft" as const,
      content:
        "The public website mentions RERA-approved properties, 11+ years of experience, 8+ layout projects, 250+ plots delivered and 500+ happy customers. These claims must be verified by V Square management (with RERA registration numbers per project) before approval. Draft documents are never used by the AI.",
    },
    {
      id: "doc-gm",
      title: "DEMO · Green Meadows Layout brochure",
      project_id: "demo-proj-1",
      status: "approved" as const,
      content:
        "DEMO DOCUMENT. Green Meadows Layout is a fictional gated plotted development in Hosur used for demonstration. Plot sizes: 30x40, 30x50 and 40x60. Amenities: gated entry, avenue trees, children's park, underground drainage. Site visits available every day 10 AM to 5 PM. Bank loan assistance available through partner banks.",
    },
  ];
  for (const d of docs) {
    await store.insert("documents", {
      ...d,
      filename: null,
      version: 1,
      parent_id: d.id,
      approved_by: d.status === "approved" ? "demo-admin" : null,
      chunk_count: 0,
      is_demo: true,
    });
    const chunks = chunkText(d.content);
    for (let i = 0; i < chunks.length; i++) {
      await store.insert("document_chunks", { document_id: d.id, project_id: d.project_id, idx: i, text: chunks[i] });
    }
    await store.update("documents", d.id, { chunk_count: chunks.length });
  }

  // Leads with history across the last 30 days
  const firstNames = ["Ravi", "Lakshmi", "Suresh", "Divya", "Manjunath", "Kavya", "Naveen", "Pooja", "Harish", "Ananya", "Vinay", "Shruti", "Rahul", "Deepa", "Girish", "Sneha", "Prakash", "Rekha", "Ajay", "Bhavya"];
  const lastNames = ["Reddy", "Hegde", "Patil", "Iyer", "Gowda", "Kulkarni", "Naik", "Murthy", "Sharma", "Rao"];
  const sources: LeadSource[] = ["whatsapp", "whatsapp", "website_chat", "website_form", "facebook_lead", "instagram", "webhook", "manual"];
  const statuses: LeadStatus[] = ["NEW", "QUALIFIED", "ASSIGNED", "ASSIGNED", "CONTACTED", "FOLLOW_UP", "SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "NEGOTIATION", "CONVERTED", "LOST"];
  const typeProject: Record<PropertyType, string> = { plot: "demo-proj-1", villa: "demo-proj-2", apartment: "demo-proj-3", investment: "demo-proj-1" };
  const typeExec: Record<PropertyType, string[]> = { plot: ["demo-exec-1", "demo-exec-4"], villa: ["demo-exec-2"], apartment: ["demo-exec-3", "demo-exec-4"], investment: ["demo-exec-1"] };
  const locs: Record<PropertyType, string> = { plot: "Hosur", villa: "Electronic City", apartment: "Attibele", investment: "Hosur" };

  for (let i = 0; i < 64; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.4) * 30);
    const created = now - daysAgo * 86400000 - Math.floor(rand() * 10 * 3600000);
    const type = pick(["plot", "plot", "villa", "apartment", "apartment", "investment"] as const);
    let status = pick(statuses);
    if (daysAgo === 0 && rand() < 0.5) status = "NEW";
    const assigned = !["NEW", "QUALIFIED"].includes(status);
    const exec = assigned ? pick(typeExec[type]) : null;
    const name = `${pick(firstNames)} ${pick(lastNames)}`;
    const budgetL = type === "villa" ? 90 + Math.floor(rand() * 70) : type === "apartment" ? 45 + Math.floor(rand() * 40) : 15 + Math.floor(rand() * 35);
    const score = status === "NEW" ? 20 + Math.floor(rand() * 30) : 55 + Math.floor(rand() * 45);
    const leadId = `demo-lead-${i + 1}`;
    const source = pick(sources);
    const firstResp = created + (2 + Math.floor(rand() * 20)) * 1000;
    const lead: Partial<Lead> = {
      id: leadId,
      name,
      phone: `9198${String(10000000 + Math.floor(rand() * 89999999))}`,
      email: null,
      source,
      source_detail: source === "facebook_lead" ? "DEMO FB campaign" : null,
      status,
      property_type: type,
      preferred_location: locs[type],
      budget_min: Math.round(budgetL * 0.85) * 1e5,
      budget_max: budgetL * 1e5,
      budget_text: budgetL >= 100 ? `${+(budgetL / 100).toFixed(2)} cr` : `${budgetL} lakh`,
      configuration: type === "plot" || type === "investment" ? pick(["30x40", "30x50", "40x60"]) : type === "villa" ? "3 BHK" : pick(["2 BHK", "3 BHK"]),
      purpose: type === "investment" || rand() < 0.3 ? "investment" : "personal",
      timeline: pick(["Immediately", "Within 3 months", "3–6 months", "Next year"]),
      site_visit_preference: rand() < 0.5 ? "Weekend" : null,
      language: pick(["en", "en", "mixed", "kn"] as const),
      score,
      score_reasons: ["DEMO seeded score"],
      priority: score >= 75 ? "hot" : score >= 50 ? "warm" : "cold",
      matched_project_ids: status === "NEW" ? [] : [typeProject[type]],
      assigned_executive_id: exec,
      consent_whatsapp: true,
      opted_out: false,
      duplicate_of: null,
      deal_value: status === "CONVERTED" ? budgetL * 1e5 : null,
      lost_reason: status === "LOST" ? pick(["Budget mismatch", "Bought elsewhere", "Not responding"]) : null,
      is_demo: true,
      first_response_at: iso(firstResp),
      last_interaction_at: iso(Math.min(now, created + Math.floor(rand() * 3) * 86400000)),
      qualified_at: status !== "NEW" ? iso(created + 300000) : null,
      assigned_at: assigned ? iso(created + 360000) : null,
      contacted_at: assigned && status !== "ASSIGNED" ? iso(created + 3600000 * (1 + rand() * 5)) : null,
      converted_at: status === "CONVERTED" ? iso(Math.min(now, created + 5 * 86400000)) : null,
      created_at: iso(created),
      updated_at: iso(created),
    };
    await store.insert("leads", lead);
    const conv = await store.insert("conversations", {
      lead_id: leadId,
      channel: source,
      external_id: source === "whatsapp" ? lead.phone! : `web-${leadId}`,
      status: ["CONVERTED", "LOST"].includes(status) ? "closed" : daysAgo === 0 ? "active" : "waiting",
      handler: ["NEGOTIATION"].includes(status) ? "human" : "ai",
      ai_paused: status === "NEGOTIATION",
      escalated: status === "NEGOTIATION",
      escalation_reason: status === "NEGOTIATION" ? "Price negotiation requested" : null,
      processing: false,
      last_customer_message_at: iso(created + 60000),
      last_message_at: iso(created + 90000),
      last_asked_field: null,
      is_demo: true,
      created_at: iso(created),
    });
    const script: [("in" | "out"), string][] = [
      ["in", type === "villa" ? "Hi, looking for a villa near Electronic City" : type === "apartment" ? "Namaskara, 2BHK flat beku Attibele side" : "Hello, plot details please in Hosur"],
      ["out", "Namaskara! Thank you for contacting V Square Projects. What budget range do you have in mind?"],
      ["in", `Around ${budgetL} lakh`],
      ["out", "Thank you! Is this for your own use or as an investment?"],
    ];
    for (let m = 0; m < script.length; m++) {
      const [dir, body] = script[m];
      await store.insert("messages", {
        conversation_id: conv.id,
        lead_id: leadId,
        direction: dir,
        sender: dir === "in" ? "customer" : "ai",
        sender_name: dir === "in" ? name : "AI agent",
        body,
        provider_message_id: null,
        delivery_status: dir === "in" ? "received" : "simulated",
        meta: dir === "out" ? { demo: true, latency_ms: 900 + Math.floor(rand() * 1800) } : { demo: true },
        created_at: iso(created + m * 20000),
      });
    }
    await store.insert("activities", { lead_id: leadId, type: "lead_created", description: `Lead captured from ${source} (DEMO)`, actor: "system", meta: {}, created_at: iso(created) });
    if (exec) {
      await store.insert("assignments", { lead_id: leadId, executive_id: exec, previous_executive_id: null, method: "project", reason: "DEMO: project match", assigned_by: "system", created_at: iso(created + 360000) });
      await store.insert("activities", { lead_id: leadId, type: "assigned", description: `Assigned to ${execs.find((e) => e.id === exec)!.name} (DEMO)`, actor: "system", meta: {}, created_at: iso(created + 360000) });
    }
    if (["SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED", "NEGOTIATION", "CONVERTED"].includes(status)) {
      const when = status === "SITE_VISIT_SCHEDULED" ? now + (1 + Math.floor(rand() * 6)) * 86400000 : created + 2 * 86400000;
      const d = new Date(when);
      d.setUTCHours(4 + Math.floor(rand() * 6), 30, 0, 0); // 10:00–15:30 IST
      await store.insert("site_visits", {
        lead_id: leadId,
        project_id: typeProject[type],
        executive_id: exec,
        scheduled_at: d.toISOString(),
        duration_minutes: 60,
        status: status === "SITE_VISIT_SCHEDULED" ? "confirmed" : "completed",
        notes: null,
        is_demo: true,
      });
    }
    if (["ASSIGNED", "FOLLOW_UP", "CONTACTED"].includes(status)) {
      const due = status === "ASSIGNED" ? created + 3600000 : now + (rand() < 0.4 ? -1 : 1) * Math.floor(rand() * 48) * 3600000;
      await store.insert("follow_up_tasks", {
        lead_id: leadId,
        executive_id: exec,
        rule_key: status === "ASSIGNED" ? "assigned_not_contacted" : "later_follow_up",
        title: status === "ASSIGNED" ? `Call ${name} — new assignment` : `Follow up with ${name}`,
        due_at: iso(due),
        status: "pending",
        result: null,
        is_demo: true,
      });
    }
    await store.insert("usage_logs", {
      conversation_id: conv.id,
      provider: "simulator",
      model: "demo-simulator",
      prompt_tokens: 600 + Math.floor(rand() * 900),
      completion_tokens: 60 + Math.floor(rand() * 140),
      cost_usd: 0,
      latency_ms: 900 + Math.floor(rand() * 1800),
      ok: true,
      error: null,
      created_at: iso(created + 30000),
    });
  }

  for (const k of ["openai", "whatsapp", "supabase", "website_webhook", "meta_leads", "email"]) {
    await store.insert("integrations", { id: k, config_encrypted: null, last_success_at: null, last_error: null, last_error_at: null, last_webhook_at: null });
  }
  await store.insert("system_logs", { level: "info", source: "demo", message: "DEMO MODE initialised with fictional seed data", meta: {} });
}
