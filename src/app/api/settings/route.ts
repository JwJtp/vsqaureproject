import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getSettings, updateSettings, DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import { audit } from "@/lib/log";

export const GET = route(async () => {
  await requireUser(["admin", "manager"]);
  return json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
});

const sectionSchemas: { [K in keyof AppSettings]: z.ZodType<Partial<AppSettings[K]>> } = {
  company: z.object({ name: z.string().max(100), tagline: z.string().max(200), phone: z.string().max(30), email: z.string().email(), address: z.string().max(300), website: z.string().url() }).partial(),
  ai: z.object({
    agentName: z.string().min(1).max(40), personality: z.string().max(2000), systemInstructions: z.string().max(6000), model: z.string().min(2).max(80),
    temperature: z.number().min(0).max(1.5), maxOutputTokens: z.number().int().min(64).max(4000), maxHistoryMessages: z.number().int().min(2).max(60),
    confidenceThreshold: z.number().min(0).max(1), dailyTokenBudget: z.number().int().min(0), monthlyCostLimitUsd: z.number().min(0),
    priceInputPer1M: z.number().min(0), priceOutputPer1M: z.number().min(0), forceSimulation: z.boolean(), replyLanguage: z.enum(["auto", "en", "kn"]),
  }).partial(),
  concurrency: z.object({ maxConcurrentConversations: z.number().int().min(1).max(200), maxQueueDepth: z.number().int().min(10).max(100000), jobTimeoutMs: z.number().int().min(5000).max(300000), maxAttempts: z.number().int().min(1).max(10), staleLockMs: z.number().int().min(30000).max(900000) }).partial(),
  workingHours: z.object({ timezone: z.string(), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24), days: z.array(z.number().int().min(0).max(6)) }).partial(),
  assignment: z.object({ enabled: z.boolean(), strategy: z.array(z.enum(["project", "location", "expertise", "workload", "round_robin"])).min(1), qualifyThreshold: z.number().int().min(0).max(100) }).partial(),
  siteVisits: z.object({ slotMinutes: z.number().int().min(15).max(240), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24), days: z.array(z.number().int().min(0).max(6)), capacityPerSlot: z.number().int().min(1).max(50), reminderHoursBefore: z.array(z.number().min(0).max(168)) }).partial(),
  whatsapp: z.object({ forceSimulation: z.boolean(), templateLanguage: z.string().max(10), templates: z.object({ executiveAssignment: z.string(), customerConfirmation: z.string(), visitConfirmation: z.string(), visitReminder: z.string(), followUp: z.string() }) }).partial(),
  retention: z.object({ messageRetentionDays: z.number().int().min(30).max(3650), logRetentionDays: z.number().int().min(7).max(3650) }).partial(),
};

export const PUT = route(async (req) => {
  const user = await requireUser(["admin"]);
  const { section, value } = await req.json();
  if (!(section in sectionSchemas)) throw new HttpError(400, "Unknown settings section");
  const parsed = sectionSchemas[section as keyof AppSettings].parse(value);
  const settings = await updateSettings(section as keyof AppSettings, parsed as never);
  await audit(user.email, "settings.update", "settings", section, { keys: Object.keys(parsed as object) });
  return json({ settings });
});
