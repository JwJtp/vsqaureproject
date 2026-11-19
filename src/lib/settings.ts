import "server-only";
import { getStore } from "@/lib/db";
import type { AssignmentMethod } from "@/lib/types";

export interface AppSettings {
  company: {
    name: string;
    tagline: string;
    phone: string;
    email: string;
    address: string;
    website: string;
  };
  ai: {
    agentName: string;
    personality: string;
    systemInstructions: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
    maxHistoryMessages: number;
    confidenceThreshold: number; // below this => human escalation
    dailyTokenBudget: number;
    monthlyCostLimitUsd: number;
    priceInputPer1M: number; // USD estimate, editable because provider prices change
    priceOutputPer1M: number;
    forceSimulation: boolean; // use the built-in simulator even if an OpenAI key exists
    replyLanguage: "auto" | "en" | "kn";
  };
  concurrency: {
    maxConcurrentConversations: number; // parallel AI calls
    maxQueueDepth: number; // backpressure: reject/queue beyond this
    jobTimeoutMs: number;
    maxAttempts: number;
    staleLockMs: number;
  };
  workingHours: {
    timezone: string;
    startHour: number;
    endHour: number;
    days: number[]; // 0=Sun
  };
  assignment: {
    enabled: boolean;
    strategy: AssignmentMethod[]; // tried in order; first producing a candidate wins
    qualifyThreshold: number; // score at which a lead is QUALIFIED and auto-assigned
    roundRobinPointer: number;
  };
  siteVisits: {
    slotMinutes: number;
    startHour: number;
    endHour: number;
    days: number[];
    capacityPerSlot: number; // per project
    reminderHoursBefore: number[];
  };
  whatsapp: {
    forceSimulation: boolean;
    templates: {
      executiveAssignment: string;
      customerConfirmation: string;
      visitConfirmation: string;
      visitReminder: string;
      followUp: string;
    };
    templateLanguage: string;
  };
  retention: {
    messageRetentionDays: number;
    logRetentionDays: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  company: {
    // Verified from https://www.vsquareprojects.in/ (public contact details)
    name: "V Square Projects",
    tagline: "Plots, Villas and Apartments — Own with Confidence",
    phone: "+91 87545 88991",
    email: "sales@vsquareprojects.in",
    address: "Shop No: 2, GRK Complex, Next to John Bosco School, Shanti Nagar, Hosur – 635109",
    website: "https://www.vsquareprojects.in/",
  },
  ai: {
    agentName: "Vani",
    personality:
      "Warm, polite and professional property advisor for V Square Projects. Short, clear messages. Friendly but never pushy. Mirrors the customer's language (English, Kannada, or a natural mix).",
    systemInstructions:
      "Ask one question at a time. Only state facts present in APPROVED KNOWLEDGE. Never invent prices, availability, approvals, discounts or legal promises. If information is missing, say the team will confirm. Escalate complaints, negotiation, legal questions and requests for a human.",
    model: "gpt-4o-mini",
    temperature: 0.4,
    maxOutputTokens: 450,
    maxHistoryMessages: 20,
    confidenceThreshold: 0.55,
    dailyTokenBudget: 2_000_000,
    monthlyCostLimitUsd: 50,
    priceInputPer1M: 0.15,
    priceOutputPer1M: 0.6,
    forceSimulation: false,
    replyLanguage: "auto",
  },
  concurrency: {
    maxConcurrentConversations: 8,
    maxQueueDepth: 500,
    jobTimeoutMs: 45_000,
    maxAttempts: 4,
    staleLockMs: 120_000,
  },
  workingHours: { timezone: "Asia/Kolkata", startHour: 9, endHour: 19, days: [1, 2, 3, 4, 5, 6] },
  assignment: {
    enabled: true,
    strategy: ["project", "location", "expertise", "workload", "round_robin"],
    qualifyThreshold: 55,
    roundRobinPointer: 0,
  },
  siteVisits: {
    slotMinutes: 60,
    startHour: 10,
    endHour: 17,
    days: [0, 1, 2, 3, 4, 5, 6],
    capacityPerSlot: 2,
    reminderHoursBefore: [24, 2],
  },
  whatsapp: {
    forceSimulation: false,
    templates: {
      executiveAssignment: "lead_assigned_exec",
      customerConfirmation: "enquiry_received",
      visitConfirmation: "site_visit_confirmed",
      visitReminder: "site_visit_reminder",
      followUp: "follow_up_general",
    },
    templateLanguage: "en",
  },
  retention: { messageRetentionDays: 730, logRetentionDays: 180 },
};

type Section = keyof AppSettings;

export async function getSettings(): Promise<AppSettings> {
  const store = await getStore();
  const rows = await store.list("settings");
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const r of rows) {
    if (r.id in out && r.value && typeof r.value === "object") {
      out[r.id] = { ...out[r.id], ...(r.value as Record<string, unknown>) };
    }
  }
  return out as unknown as AppSettings;
}

export async function updateSettings<S extends Section>(section: S, patch: Partial<AppSettings[S]>): Promise<AppSettings> {
  const store = await getStore();
  const current = await getSettings();
  const value = { ...current[section], ...patch };
  await store.upsert("settings", { id: section, value });
  return getSettings();
}
