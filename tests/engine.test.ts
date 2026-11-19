import { describe, it, expect } from "vitest";
import { pickExecutive } from "@/lib/assignment/engine";
import { scoreLead, matchProjects, missingFields } from "@/lib/ai/score";
import { guardReply } from "@/lib/ai/guard";
import { chunkText, bm25 } from "@/lib/knowledge/chunk";
import type { Executive, Project } from "@/lib/types";

const ex = (id: string, o: Partial<Executive> = {}): Executive => ({
  id, user_id: null, name: id, phone: "919900000000", email: `${id}@x.com`, project_ids: [], expertise: [], locations: [],
  available: true, active: true, daily_capacity: 5, is_demo: true, created_at: "", updated_at: "", ...o,
});

describe("assignment engine", () => {
  const execs = [ex("a", { project_ids: ["p1"], expertise: ["plot"] }), ex("b", { locations: ["Hosur"], expertise: ["villa"] }), ex("c", { available: false, project_ids: ["p1"] })];
  it("project match first, never unavailable", () => {
    const r = pickExecutive({ property_type: "plot", preferred_location: "Hosur", matched_project_ids: ["p1"] }, execs, new Map(), ["project", "location", "round_robin"]);
    expect(r.executive?.id).toBe("a");
    expect(r.method).toBe("project");
  });
  it("respects daily capacity", () => {
    const loads = new Map([["a", { openLeads: 3, assignedToday: 5 }]]);
    const r = pickExecutive({ property_type: "plot", preferred_location: "Hosur", matched_project_ids: ["p1"] }, execs, loads, ["project", "location"]);
    expect(r.executive?.id).toBe("b");
    expect(r.method).toBe("location");
  });
  it("returns unassigned when nobody is eligible", () => {
    const r = pickExecutive({ property_type: "plot", preferred_location: null, matched_project_ids: [] }, [ex("x", { active: false })], new Map(), ["round_robin"]);
    expect(r.executive).toBeNull();
    expect(r.method).toBe("unassigned");
  });
  it("round robin rotates", () => {
    const pool = [ex("a"), ex("b")];
    const r1 = pickExecutive({ property_type: null, preferred_location: null, matched_project_ids: [] }, pool, new Map(), ["round_robin"], 0);
    const r2 = pickExecutive({ property_type: null, preferred_location: null, matched_project_ids: [] }, pool, new Map(), ["round_robin"], r1.rrPointer);
    expect(r1.executive?.id).not.toBe(r2.executive?.id);
  });
  it("workload picks least loaded", () => {
    const loads = new Map([["a", { openLeads: 1, assignedToday: 4 }], ["b", { openLeads: 1, assignedToday: 1 }]]);
    expect(pickExecutive({ property_type: null, preferred_location: null, matched_project_ids: [] }, [ex("a"), ex("b")], loads, ["workload"]).executive?.id).toBe("b");
  });
});

describe("scoring & matching", () => {
  it("explains every point", () => {
    const r = scoreLead({ name: "R", phone: "91", property_type: "plot", preferred_location: "Hosur", budget_max: 4e6, configuration: "30x40", purpose: "personal", timeline: "Immediately", site_visit_preference: "Saturday", opted_out: false });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.priority).toBe("hot");
    expect(r.reasons.length).toBeGreaterThan(5);
  });
  it("only verified projects match", () => {
    const base = { location: "Hosur", property_type: "plot", price_range: "₹18 L – ₹42 L" } as Partial<Project>;
    const ps = [{ ...base, id: "v", verified: true }, { ...base, id: "u", verified: false }] as Project[];
    expect(matchProjects({ property_type: "plot", preferred_location: "Hosur", budget_max: 3e6 }, ps).map((p) => p.id)).toEqual(["v"]);
    expect(matchProjects({ property_type: "plot", preferred_location: "Hosur", budget_max: 5e5 }, ps)).toEqual([]);
  });
  it("asks one missing field at a time in order", () => {
    expect(missingFields({ property_type: "plot" }, false)[0]).toBe("preferred_location");
    expect(missingFields({ property_type: "plot" }, true)).not.toContain("phone");
  });
});

describe("guardrail", () => {
  it("blocks invented prices and approvals", () => {
    expect(guardReply("Plots start at ₹25 lakh and it is RERA approved", "Price range: ₹18 L – ₹42 L").ok).toBe(false);
    expect(guardReply("The price range is ₹18 L – ₹42 L", "Price range: ₹18 L – ₹42 L").ok).toBe(true);
    expect(guardReply("Guaranteed returns!", "").ok).toBe(false);
  });
});

describe("knowledge retrieval", () => {
  it("chunks and ranks", () => {
    const chunks = chunkText("Green Meadows has a children's park. ".repeat(40));
    expect(chunks.length).toBeGreaterThan(1);
    const r = bm25("children park", [{ t: "Clubhouse and gym" }, { t: "Children's park and avenue trees" }], (d) => d.t);
    expect(r[0].item.t).toMatch(/park/);
  });
});
