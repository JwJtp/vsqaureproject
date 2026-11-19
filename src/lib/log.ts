import "server-only";
import { getStore } from "@/lib/db";
import type { SystemLog } from "@/lib/types";

/** Never throws: logging must not break business flows. */
export async function syslog(level: SystemLog["level"], source: string, message: string, meta: Record<string, unknown> = {}) {
  try {
    const s = await getStore();
    await s.insert("system_logs", { level, source, message, meta: redact(meta) });
  } catch (e) {
    console.error("[syslog failed]", e);
  }
  if (level === "error") console.error(`[${source}] ${message}`);
}

export async function audit(actor: string, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) {
  try {
    const s = await getStore();
    await s.insert("audit_logs", { actor, action, entity, entity_id: entityId, meta: redact(meta) });
  } catch (e) {
    console.error("[audit failed]", e);
  }
}

export async function activity(leadId: string | null, type: string, description: string, actor = "system", meta: Record<string, unknown> = {}) {
  try {
    const s = await getStore();
    await s.insert("activities", { lead_id: leadId, type, description, actor, meta });
  } catch (e) {
    console.error("[activity failed]", e);
  }
}

const SECRET_KEYS = /token|secret|password|api_?key|authorization/i;
function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  return out;
}
