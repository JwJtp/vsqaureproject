// Transparent lead scoring: every point comes with a human-readable reason.
import type { Lead, Priority, Project } from "@/lib/types";
import type { Field } from "./extract";

export interface ScoreResult {
  score: number;
  priority: Priority;
  reasons: string[];
}

type ScoreInput = Pick<
  Lead,
  "name" | "phone" | "property_type" | "preferred_location" | "budget_max" | "configuration" | "purpose" | "timeline" | "site_visit_preference" | "opted_out"
> & { matchedProjects?: number; escalated?: boolean; engagedMessages?: number };

export function scoreLead(l: ScoreInput): ScoreResult {
  const reasons: string[] = [];
  let s = 0;
  const add = (pts: number, why: string) => {
    s += pts;
    reasons.push(`${pts > 0 ? "+" : ""}${pts} ${why}`);
  };
  if (l.property_type) add(10, `Clear requirement: ${l.property_type}`);
  if (l.preferred_location && l.preferred_location !== "Flexible") add(8, `Preferred location: ${l.preferred_location}`);
  if (l.budget_max) add(15, "Budget shared");
  if (l.configuration) add(5, `Configuration/size known: ${l.configuration}`);
  if (l.purpose) add(4, `Purpose: ${l.purpose === "investment" ? "investment" : "own use"}`);
  if (l.phone) add(10, "Contact number available");
  if (l.name) add(3, "Name shared");
  if (l.timeline) {
    if (/immediately/i.test(l.timeline)) add(20, "Wants to buy immediately");
    else if (/within 3 months/i.test(l.timeline)) add(14, "Buying within 3 months");
    else if (/3–6|3-6|within a year/i.test(l.timeline)) add(7, "Buying within 6–12 months");
    else add(2, "Long / undecided timeline");
  }
  if (l.site_visit_preference && !/not now/i.test(l.site_visit_preference)) add(15, "Interested in a site visit");
  if (l.matchedProjects) add(5, "Matches a verified project");
  if ((l.engagedMessages ?? 0) >= 4) add(3, "Engaged conversation");
  if (l.opted_out) add(-40, "Customer opted out");
  const score = Math.max(0, Math.min(100, s));
  const priority: Priority = score >= 75 ? "hot" : score >= 50 ? "warm" : "cold";
  return { score, priority, reasons };
}

/** The order in which the agent asks for missing information, one question at a time. */
export const QUESTION_ORDER: Field[] = [
  "property_type",
  "preferred_location",
  "budget",
  "configuration",
  "purpose",
  "timeline",
  "name",
  "phone",
  "site_visit_preference",
];

export function missingFields(l: Partial<Lead>, channelHasPhone: boolean): Field[] {
  return QUESTION_ORDER.filter((f) => {
    switch (f) {
      case "property_type": return !l.property_type;
      case "preferred_location": return !l.preferred_location;
      case "budget": return !l.budget_max;
      case "configuration": return !l.configuration && l.property_type !== "investment";
      case "purpose": return !l.purpose;
      case "timeline": return !l.timeline;
      case "name": return !l.name;
      case "phone": return !l.phone && !channelHasPhone;
      case "site_visit_preference": return !l.site_visit_preference;
    }
  });
}

/**
 * Match only VERIFIED projects. A project matches when type agrees and (if known) the
 * location agrees. Price is never inferred — budget is compared only when the admin has
 * entered a numeric range in the project's price_range text.
 */
export function matchProjects(l: Partial<Lead>, projects: Project[]): Project[] {
  return projects
    .filter((p) => p.verified)
    .filter((p) => {
      if (!l.property_type) return false;
      const typeOk = p.property_type === l.property_type || (l.property_type === "investment" && ["plot", "villa", "apartment"].includes(p.property_type));
      if (!typeOk) return false;
      if (l.preferred_location && l.preferred_location !== "Flexible") {
        const a = l.preferred_location.toLowerCase();
        const b = p.location.toLowerCase();
        if (!(a.includes(b) || b.includes(a))) return false;
      }
      const range = parsePriceRange(p.price_range);
      if (range && l.budget_max && l.budget_max < range.min * 0.8) return false;
      return true;
    });
}

export function parsePriceRange(s: string | null): { min: number; max: number } | null {
  if (!s) return null;
  const vals = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(cr|crore|l|lakh|lac)/gi)].map((m) => +m[1] * (/^c/i.test(m[2]) ? 1e7 : 1e5));
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
