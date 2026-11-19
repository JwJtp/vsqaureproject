// Deterministic, bilingual (English / Kannada / Kanglish) information extraction.
// Used by the demo simulator AND as a safety net merged with the LLM output in live mode.
// Pure module: no server dependencies, fully unit-tested.

import type { PropertyType } from "@/lib/types";

export type Field =
  | "property_type"
  | "preferred_location"
  | "budget"
  | "configuration"
  | "purpose"
  | "timeline"
  | "name"
  | "phone"
  | "site_visit_preference";

export interface Extracted {
  name?: string;
  phone?: string;
  email?: string;
  property_type?: PropertyType;
  preferred_location?: string;
  budget_min?: number;
  budget_max?: number;
  budget_text?: string;
  configuration?: string;
  purpose?: "investment" | "personal";
  timeline?: string;
  site_visit_preference?: string;
  visit_at?: string; // ISO when a concrete date/time was given
}

export interface Signals {
  language: "en" | "kn" | "mixed";
  greeting: boolean;
  question: boolean;
  optOut: boolean;
  wantsVisit: boolean;
  wantsCallback: boolean;
  wantsLater: boolean;
  escalation: null | { type: "complaint" | "negotiation" | "legal" | "human_request"; reason: string };
  affirmative: boolean;
  negative: boolean;
}

const KN_DIGITS = "೦೧೨೩೪೫೬೭೮೯";
export function normalizeDigits(s: string) {
  return s.replace(/[೦-೯]/g, (d) => String(KN_DIGITS.indexOf(d)));
}

const KANGLISH = /\b(beku|bekagide|illa|haudu|houdu|sari|nanage|nange|swalpa|yenu|enu|hesaru|namaskara|namaskar|madi|maadi|beda|guru|ide|alli|yavaga|eshtu|estu|nodbeku|thumba|chennagide|kodi|helji|heli)\b/i;

export function detectLanguage(text: string): "en" | "kn" | "mixed" {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!letters.length) return "en";
  const kn = (letters.match(/[ಀ-೿]/g) ?? []).length;
  const ratio = kn / letters.length;
  if (ratio > 0.6) return "kn";
  if (ratio > 0.05 || KANGLISH.test(text)) return "mixed";
  return "en";
}

export const KNOWN_LOCATIONS: Record<string, string> = {
  hosur: "Hosur",
  "ಹೊಸೂರು": "Hosur",
  "ಹೊಸೂರ್": "Hosur",
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  "ಬೆಂಗಳೂರು": "Bengaluru",
  "electronic city": "Electronic City",
  "e city": "Electronic City",
  "ecity": "Electronic City",
  "ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ": "Electronic City",
  attibele: "Attibele",
  "ಅತ್ತಿಬೆಲೆ": "Attibele",
  sarjapur: "Sarjapur",
  "ಸರ್ಜಾಪುರ": "Sarjapur",
  anekal: "Anekal",
  "ಆನೇಕಲ್": "Anekal",
  chandapura: "Chandapura",
  bagalur: "Bagalur",
  marathahalli: "Marathahalli",
  whitefield: "Whitefield",
  krishnagiri: "Krishnagiri",
  shoolagiri: "Shoolagiri",
  denkanikottai: "Denkanikottai",
  "hsr layout": "HSR Layout",
  bellandur: "Bellandur",
};

function findLocation(text: string, extra: string[] = []): string | undefined {
  const t = text.toLowerCase();
  for (const loc of extra) if (loc && t.includes(loc.toLowerCase())) return loc;
  const keys = Object.keys(KNOWN_LOCATIONS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = /^[a-z ]+$/.test(k) ? new RegExp(`\\b${k}\\b`, "i") : new RegExp(k);
    if (re.test(t)) return KNOWN_LOCATIONS[k];
  }
  return undefined;
}

function findPropertyType(t: string): PropertyType | undefined {
  if (/\b(invest(ment|ing|or)?|roi|returns?|appreciation)\b|ಹೂಡಿಕೆ|ಇನ್ವೆಸ್ಟ್/i.test(t) && !/\b(plot|site|villa|flat|apartment|bhk)\b|ಸೈಟ್|ನಿವೇಶನ|ಫ್ಲಾಟ್|ವಿಲ್ಲಾ/i.test(t))
    return "investment";
  if (/\bvillas?\b|ವಿಲ್ಲಾ|independent house|row house|\bduplex\b/i.test(t)) return "villa";
  // "3 BHK" alone is a configuration (villas have BHKs too), not a property type.
  if (/\b(apartments?|flats?|condo)\b|ಫ್ಲಾಟ್|ಅಪಾರ್ಟ್ಮೆಂಟ್|ಅಪಾರ್ಟ್‌ಮೆಂಟ್/i.test(t)) return "apartment";
  if (/\b(plots?|sites?|land|layout|nivesana)\b|ಸೈಟ್|ನಿವೇಶನ|ಪ್ಲಾಟ್|ಜಾಗ/i.test(t)) return "plot";
  if (/\b(buy|want|need|looking for) (a |an )?(independent |new |ready )?(house|home)\b|\bmane beku\b|ಮನೆ ಬೇಕು/i.test(t)) return "villa";
  return undefined;
}

const NUM = "(\\d+(?:\\.\\d+)?)";
export function parseBudget(t0: string, expectingBudget = false): Pick<Extracted, "budget_min" | "budget_max" | "budget_text"> | undefined {
  const t = normalizeDigits(t0).toLowerCase().replace(/,/g, "").replace(/₹|rs\.?|inr/g, " ");
  const unitRe = "(lakhs?|lacs?|lakh|lac|l\\b|ಲಕ್ಷ|cr\\b|crores?|crs?\\b|ಕೋಟಿ|k\\b)";
  const mult = (u?: string) => {
    if (!u) return 0;
    if (/^(cr|crore|crores|crs|ಕೋಟಿ)/.test(u)) return 1e7;
    if (/^(l|lakh|lakhs|lac|lacs|ಲಕ್ಷ)/.test(u)) return 1e5;
    if (u === "k") return 1e3;
    return 0;
  };
  const range = t.match(new RegExp(`${NUM}\\s*${unitRe}?\\s*(?:-|to|–|ರಿಂದ|se)\\s*${NUM}\\s*${unitRe}`));
  if (range) {
    const u2 = mult(range[4]);
    const u1 = mult(range[2]) || u2;
    const a = +range[1] * u1;
    const b = +range[3] * u2;
    return { budget_min: Math.min(a, b), budget_max: Math.max(a, b), budget_text: range[0].trim() };
  }
  const single = t.match(new RegExp(`${NUM}\\s*${unitRe}`));
  if (single) {
    const v = +single[1] * mult(single[2]);
    if (v >= 1e5) {
      const under = /(under|below|within|max|upto|up to|less than|ಒಳಗೆ)/.test(t);
      return under
        ? { budget_max: v, budget_text: single[0].trim() }
        : { budget_min: Math.round(v * 0.85), budget_max: v, budget_text: single[0].trim() };
    }
  }
  const raw = t.match(/\b(\d{6,9})\b/);
  if (raw && !/^[6-9]\d{9}$/.test(raw[1])) {
    const v = +raw[1];
    return { budget_min: Math.round(v * 0.85), budget_max: v, budget_text: raw[1] };
  }
  if (expectingBudget) {
    const bare = t.match(/\b(\d{1,3}(?:\.\d+)?)\b/);
    if (bare) {
      const n = +bare[1];
      const v = n < 20 && /\./.test(bare[1]) ? n * 1e7 : n * 1e5; // "1.2" => crore, "45" => lakh
      return { budget_min: Math.round(v * 0.85), budget_max: v, budget_text: bare[0] };
    }
  }
  return undefined;
}

function findConfiguration(t: string): string | undefined {
  const n = normalizeDigits(t);
  const bhk = n.match(/(\d)\s*-?\s*bhk/i);
  if (bhk) return `${bhk[1]} BHK`;
  const dims = n.match(/\b(\d{2,3})\s*(?:x|\*|×|by|ಬೈ)\s*(\d{2,3})\b/i);
  if (dims) return `${dims[1]}x${dims[2]}`;
  const sqft = n.match(/\b(\d{3,5})\s*(?:sq\.?\s*ft|sqft|square feet|ಚದರ ಅಡಿ)/i);
  if (sqft) return `${sqft[1]} sq ft`;
  const kn = n.match(/(\d)\s*(?:bedroom|ಬೆಡ್‌?ರೂಮ್)/i);
  if (kn) return `${kn[1]} BHK`;
  return undefined;
}

function findPurpose(t: string): "investment" | "personal" | undefined {
  if (/\b(invest(ment|ing)?|resale|rental income|returns|roi)\b|ಹೂಡಿಕೆ/i.test(t)) return "investment";
  if (/\b(own use|self use|personal|to live|to stay|for (my )?family|end use|build(ing)? (a |my |our )?(own )?(house|home)|own (house|home)|construct\w*|residence|living)\b|ವಾಸ|ನಮ್ಮ ಮನೆ|ಸ್ವಂತ/i.test(t)) return "personal";
  return undefined;
}

function findTimeline(t: string): string | undefined {
  const n = normalizeDigits(t).toLowerCase();
  if (/\b(immediately|urgent|asap|right now|this week|ready to buy)\b|ಈಗಲೇ|ತಕ್ಷಣ|\bega\b/.test(n)) return "Immediately";
  const m = n.match(/(\d{1,2})\s*(months?|ತಿಂಗಳು|tingalu)/);
  if (m) return +m[1] <= 3 ? "Within 3 months" : +m[1] <= 6 ? "3–6 months" : "6–12 months";
  const y = n.match(/(\d)\s*(years?|ವರ್ಷ)/);
  if (y) return +y[1] <= 1 ? "Within a year" : "More than a year";
  if (/\b(this month|next month|month end)\b|ಈ ತಿಂಗಳು|ಮುಂದಿನ ತಿಂಗಳು/.test(n)) return "Within 3 months";
  if (/\b(next year|later|no hurry|just exploring|exploring|not decided)\b|ಮುಂದಿನ ವರ್ಷ/.test(n)) return "Exploring / later";
  if (/\b(few months|couple of months|soon)\b/.test(n)) return "3–6 months";
  return undefined;
}

function findName(t: string, expectingName: boolean): string | undefined {
  const m =
    t.match(/\b(?:my name is|this is|i am|i'm|myself|name is|naan hesaru|nanna hesaru|hesaru)\s+([A-Za-z][A-Za-z .]{1,40})/i) ??
    t.match(/(?:ನನ್ನ ಹೆಸರು|ಹೆಸರು)\s+([ಀ-೿A-Za-z .]{2,40})/);
  let cand = m?.[1];
  if (!cand && expectingName) {
    const clean = t.trim().replace(/[.!]+$/, "");
    if (/^[\p{L} .]{2,40}$/u.test(clean) && clean.split(/\s+/).length <= 4) cand = clean;
  }
  if (!cand) return undefined;
  cand = cand.replace(/\b(and|here|from|looking|interested|i|want|need|ಮತ್ತು)\b.*$/i, "").trim();
  if (cand.length < 2 || /^(yes|no|ok|okay|hi|hello|sure|haudu|illa)$/i.test(cand)) return undefined;
  return cand.replace(/\b\w/g, (c) => c.toUpperCase());
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, "ಭಾನುವಾರ": 0,
  monday: 1, mon: 1, "ಸೋಮವಾರ": 1,
  tuesday: 2, tue: 2, "ಮಂಗಳವಾರ": 2,
  wednesday: 3, wed: 3, "ಬುಧವಾರ": 3,
  thursday: 4, thu: 4, "ಗುರುವಾರ": 4,
  friday: 5, fri: 5, "ಶುಕ್ರವಾರ": 5,
  saturday: 6, sat: 6, "ಶನಿವಾರ": 6,
};

/** Parse a visit date/time in IST. Returns ISO (UTC) or undefined. */
export function parseVisitTime(t0: string, now = new Date()): { iso?: string; label?: string } {
  const t = normalizeDigits(t0).toLowerCase();
  const IST = 330;
  const istNow = new Date(now.getTime() + IST * 60000);
  let day: Date | undefined;
  let label: string | undefined;
  const base = (addDays: number) => {
    const d = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + addDays));
    return d;
  };
  if (/\btoday\b|ಇಂದು|ಇವತ್ತು|\bivattu\b/.test(t)) {
    day = base(0);
    label = "Today";
  } else if (/\btomorrow\b|ನಾಳೆ|\bnale\b|\bnaale\b/.test(t)) {
    day = base(1);
    label = "Tomorrow";
  } else if (/\bweekend\b|ವೀಕೆಂಡ್/.test(t)) {
    const add = (6 - istNow.getUTCDay() + 7) % 7 || 7;
    day = base(add);
    label = "Weekend";
  } else {
    for (const [name, wd] of Object.entries(DAY_NAMES)) {
      const re = /^[a-z]+$/.test(name) ? new RegExp(`\\b${name}\\b`) : new RegExp(name);
      if (re.test(t)) {
        const add = (wd - istNow.getUTCDay() + 7) % 7 || 7;
        day = base(add);
        label = name[0].toUpperCase() + name.slice(1);
        break;
      }
    }
  }
  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!day && dm) {
    const y = dm[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : istNow.getUTCFullYear();
    day = new Date(Date.UTC(y, +dm[2] - 1, +dm[1]));
    if (day < base(0)) day = new Date(Date.UTC(y + 1, +dm[2] - 1, +dm[1]));
    label = day.toISOString().slice(0, 10);
  }
  let hour: number | undefined;
  let minute = 0;
  const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|ಗಂಟೆ)?\b/);
  if (tm && (tm[3] || tm[2]) && !dm?.[0]?.includes(tm[0])) {
    hour = +tm[1];
    minute = tm[2] ? +tm[2] : 0;
    if (tm[3] === "pm" && hour < 12) hour += 12;
    if (tm[3] === "am" && hour === 12) hour = 0;
    if (!tm[3] && hour < 8) hour += 12;
  } else if (/\bmorning\b|ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ/.test(t)) hour = 10;
  else if (/\bafternoon\b|ಮಧ್ಯಾಹ್ನ/.test(t)) hour = 14;
  else if (/\bevening\b|ಸಂಜೆ|\bsanje\b/.test(t)) hour = 16;
  if (!day) return label ? { label } : {};
  if (hour === undefined) return { label };
  const iso = new Date(day.getTime() + (hour * 60 + minute - IST) * 60000).toISOString();
  return { iso, label: `${label} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

export function extract(text: string, opts: { lastAsked?: Field | null; knownLocations?: string[]; now?: Date } = {}): Extracted {
  const t = normalizeDigits(text);
  const out: Extracted = {};
  const phone = t.replace(/[\s-]/g, "").match(/(?:\+?91)?([6-9]\d{9})\b/);
  if (phone) out.phone = "91" + phone[1];
  const email = t.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) out.email = email[0].toLowerCase();
  const pt = findPropertyType(t);
  if (pt) out.property_type = pt;
  const loc = findLocation(t, opts.knownLocations);
  if (loc) out.preferred_location = loc;
  else if (opts.lastAsked === "preferred_location" && !/\d/.test(t) && !findPropertyType(t) && !findPurpose(t) && !findTimeline(t)) {
    const clean = t.trim().replace(/[.!?]+$/, "");
    if (clean.length >= 3 && clean.length <= 40 && !/\d{5,}/.test(clean) && !/\b(no|any|not sure|anywhere)\b/i.test(clean))
      out.preferred_location = clean.replace(/\b(near|around|side|area|alli|ಹತ್ತಿರ|ಕಡೆ)\b/gi, "").trim().replace(/\b\w/g, (c) => c.toUpperCase());
    else if (/\b(any|anywhere|not sure|flexible)\b/i.test(clean)) out.preferred_location = "Flexible";
  }
  const textForBudget = out.phone ? t.replace(/(?:\+?91)?[6-9]\d{9}/, "") : t;
  const budget = parseBudget(textForBudget, opts.lastAsked === "budget");
  if (budget) Object.assign(out, budget);
  const cfg = findConfiguration(t);
  if (cfg) out.configuration = cfg;
  const purpose = findPurpose(t);
  if (purpose) out.purpose = purpose;
  if (out.property_type === "investment" && !out.purpose) out.purpose = "investment";
  const tl = findTimeline(t);
  if (tl) out.timeline = tl;
  const name = findName(text, opts.lastAsked === "name");
  if (name) out.name = name;
  const visit = parseVisitTime(t, opts.now);
  if (visit.iso) out.visit_at = visit.iso;
  if (visit.label || /\b(site visit|visit|come and see|see the (site|property))\b|ನೋಡ|ಭೇಟಿ/i.test(t)) {
    if (visit.label) out.site_visit_preference = visit.label;
    else if (opts.lastAsked === "site_visit_preference" && /\b(yes|sure|ok|haudu|sari)\b|ಹೌದು|ಸರಿ/i.test(t)) out.site_visit_preference = "Yes — date to be fixed";
  } else if (opts.lastAsked === "site_visit_preference") {
    if (/\b(yes|sure|ok|okay|haudu|houdu|sari)\b|ಹೌದು|ಸರಿ/i.test(t)) out.site_visit_preference = "Yes — date to be fixed";
    else if (/\b(no|not now|later|illa|beda)\b|ಇಲ್ಲ|ಬೇಡ/i.test(t)) out.site_visit_preference = "Not now";
  }
  return out;
}

export function signals(text: string): Signals {
  const t = normalizeDigits(text).toLowerCase().trim();
  let escalation: Signals["escalation"] = null;
  if (/\b(complain(t)?|cheat(ed|ing)?|fraud|scam|worst|pathetic|refund|harass|consumer court)\b|ಮೋಸ|ದೂರು/.test(t))
    escalation = { type: "complaint", reason: "Customer complaint or dissatisfaction" };
  else if (/\b(discount|negotiat\w*|best price|last price|final price|reduce (the )?price|kammi|offer price|bargain)\b|ಕಡಿಮೆ ಮಾಡಿ|ರಿಯಾಯಿತಿ/.test(t))
    escalation = { type: "negotiation", reason: "Price negotiation / discount request" };
  else if (/\b(legal|lawyer|advocate|court|litigation|dispute|encumbrance|title deed|khata transfer)\b|ಕಾನೂನು|ವಕೀಲ/.test(t))
    escalation = { type: "legal", reason: "Legal / documentation question" };
  else if (/\b(talk|speak|connect)\s+(to|with)\s+(a\s+|an\s+|your\s+|some\s*one|someone|human|person|agent|executive|manager|sales)|\b(real person|human please|call me|give me a call|phone me|call back)\b|ಕರೆ ಮಾಡಿ|phone madi|call madi/.test(t))
    escalation = { type: "human_request", reason: "Customer asked for a human / call back" };
  const optOut =
    /^(stop|unsubscribe|stop all|opt out|optout|cancel)\.?$/i.test(t) ||
    /\b(stop (messaging|sending|texting)|don'?t (message|contact|text) me|do not (message|contact|text)|unsubscribe me|remove my number)\b|ಮೆಸೇಜ್ ಮಾಡಬೇಡಿ|ಸಂದೇಶ ಕಳುಹಿಸಬೇಡಿ/.test(t);
  return {
    language: detectLanguage(text),
    greeting: /^(hi+|hello|hey|namaskara?|namaste|good (morning|afternoon|evening)|ನಮಸ್ಕಾರ|ಹಾಯ್)\b/.test(t),
    question:
      /\?|^(what|which|how|when|where|is|are|do|does|can|price|rate|cost)\b|\b(amenities|approval|approved|rera|loan|emi|price|rate|cost|available|availability|brochure|specification|location map|distance)\b|ಬೆಲೆ|ಎಷ್ಟು|ಏನು|ಎಲ್ಲಿ|ಸಾಲ|\b(eshtu|estu|yenu)\b/.test(t),
    optOut,
    wantsVisit: /\b(site visit|visit|come and see|see the (site|plot|property|project))\b|ನೋಡಲು|ಭೇಟಿ|nodbeku|nodoke/.test(t),
    wantsCallback: !!escalation && escalation.type === "human_request",
    wantsLater: /\b(later|next month|after some time|busy now|not now)\b|ಆಮೇಲೆ|ನಂತರ/.test(t),
    escalation,
    affirmative: /^(yes|yeah|yep|ok|okay|sure|haudu|houdu|sari|fine)\b|ಹೌದು|ಸರಿ/.test(t),
    negative: /^(no|nope|not now|illa|beda)\b|ಇಲ್ಲ|ಬೇಡ/.test(t),
  };
}
