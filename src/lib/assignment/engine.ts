// Pure lead-assignment engine (no I/O) — unit tested.
import type { AssignmentMethod, Executive, Lead } from "@/lib/types";

export interface ExecLoad {
  openLeads: number;
  assignedToday: number;
}

export interface PickResult {
  executive: Executive | null;
  method: AssignmentMethod;
  reason: string;
  rrPointer?: number;
}

export function eligible(e: Executive, load: ExecLoad | undefined): { ok: boolean; why?: string } {
  if (!e.active) return { ok: false, why: "inactive" };
  if (!e.available) return { ok: false, why: "unavailable" };
  if ((load?.assignedToday ?? 0) >= e.daily_capacity) return { ok: false, why: "daily capacity reached" };
  return { ok: true };
}

function leastLoaded(cands: Executive[], loads: Map<string, ExecLoad>) {
  return [...cands].sort((a, b) => {
    const la = loads.get(a.id);
    const lb = loads.get(b.id);
    const ra = (la?.assignedToday ?? 0) / Math.max(1, a.daily_capacity);
    const rb = (lb?.assignedToday ?? 0) / Math.max(1, b.daily_capacity);
    return ra - rb || (la?.openLeads ?? 0) - (lb?.openLeads ?? 0) || a.name.localeCompare(b.name);
  })[0];
}

export function pickExecutive(
  lead: Pick<Lead, "property_type" | "preferred_location" | "matched_project_ids">,
  executives: Executive[],
  loads: Map<string, ExecLoad>,
  strategy: AssignmentMethod[],
  rrPointer = 0,
): PickResult {
  const pool = executives.filter((e) => eligible(e, loads.get(e.id)).ok);
  if (!pool.length) return { executive: null, method: "unassigned", reason: "No active executive with availability and remaining daily capacity" };

  for (const method of strategy) {
    let cands: Executive[] = [];
    let why = "";
    switch (method) {
      case "project":
        cands = pool.filter((e) => e.project_ids.some((p) => lead.matched_project_ids?.includes(p)));
        why = "handles the matched project";
        break;
      case "location":
        cands = lead.preferred_location ? pool.filter((e) => e.locations.some((l) => l.toLowerCase() === lead.preferred_location!.toLowerCase())) : [];
        why = `covers ${lead.preferred_location}`;
        break;
      case "expertise":
        cands = lead.property_type ? pool.filter((e) => e.expertise.includes(lead.property_type!)) : [];
        why = `specialises in ${lead.property_type}`;
        break;
      case "workload": {
        const e = leastLoaded(pool, loads);
        return { executive: e, method, reason: `Lowest current workload (${loads.get(e.id)?.assignedToday ?? 0}/${e.daily_capacity} today)` };
      }
      case "round_robin": {
        const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
        const idx = rrPointer % sorted.length;
        return { executive: sorted[idx], method, reason: "Round-robin rotation", rrPointer: rrPointer + 1 };
      }
      default:
        continue;
    }
    if (cands.length) {
      const e = leastLoaded(cands, loads);
      return { executive: e, method, reason: `${e.name} ${why}; least loaded among ${cands.length} match(es)` };
    }
  }
  return { executive: null, method: "unassigned", reason: "No executive matched the configured assignment rules" };
}
