// DEMO-MODE AI agent: a deterministic bilingual sales assistant. It follows the same rules
// as the live LLM (one question at a time, only verified knowledge, escalate when needed),
// so the full journey can be demonstrated without an OpenAI key.

import type { Field, Extracted, Signals } from "./extract";
import type { Lead, Project } from "@/lib/types";

export interface KnowledgeSnippet {
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

export interface AgentInput {
  agentName: string;
  companyName: string;
  lead: Partial<Lead>;
  isFirstTurn: boolean;
  missing: Field[];
  extracted: Extracted;
  signals: Signals;
  knowledge: KnowledgeSnippet[];
  newlyMatched: Project[];
  customerText: string;
}

export interface AgentDecision {
  reply: string;
  askedField: Field | null;
  intent: string;
  confidence: number;
  escalate: null | { reason: string; type: string };
  knowledgeGap: string | null;
  usedSources: string[];
  extracted: Extracted;
}

type L = "en" | "kn" | "mixed";
const Q: Record<Field, Record<"en" | "kn", string>> = {
  property_type: {
    en: "Are you looking for a plot, a villa, an apartment, or an investment property?",
    kn: "ನಿಮಗೆ ಸೈಟ್ (plot), ವಿಲ್ಲಾ, ಅಪಾರ್ಟ್ಮೆಂಟ್ ಅಥವಾ ಹೂಡಿಕೆ (investment) property — ಯಾವುದು ಬೇಕು?",
  },
  preferred_location: {
    en: "Which location do you prefer? (for example Hosur, Electronic City, Attibele)",
    kn: "ಯಾವ ಏರಿಯಾ ನಿಮಗೆ ಇಷ್ಟ? (ಉದಾ: ಹೊಸೂರು, Electronic City, ಅತ್ತಿಬೆಲೆ)",
  },
  budget: {
    en: "What budget range do you have in mind? (for example 30–40 lakh)",
    kn: "ನಿಮ್ಮ ಬಜೆಟ್ ಎಷ್ಟು? (ಉದಾ: 30–40 ಲಕ್ಷ)",
  },
  configuration: {
    en: "What size or configuration do you need? (plot size like 30x40, or 2/3 BHK)",
    kn: "ಯಾವ ಸೈಜ್ ಬೇಕು? (ಸೈಟ್ ಆದರೆ 30x40 ಹೀಗೆ, ಮನೆ/ಫ್ಲಾಟ್ ಆದರೆ 2/3 BHK)",
  },
  purpose: {
    en: "Is this for your own use or as an investment?",
    kn: "ಇದು ನಿಮ್ಮ ಸ್ವಂತ ವಾಸಕ್ಕೋ ಅಥವಾ ಹೂಡಿಕೆಗೋ (investment)?",
  },
  timeline: {
    en: "When are you planning to buy — immediately, within 3 months, or later?",
    kn: "ಯಾವಾಗ ಖರೀದಿ ಮಾಡಲು ಯೋಜನೆ ಇದೆ — ತಕ್ಷಣ, 3 ತಿಂಗಳ ಒಳಗೆ, ಅಥವಾ ನಂತರ?",
  },
  name: {
    en: "May I know your name, please?",
    kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ತಿಳಿಸುತ್ತೀರಾ?",
  },
  phone: {
    en: "Could you share your mobile number so our property advisor can reach you?",
    kn: "ನಮ್ಮ ಸಲಹೆಗಾರರು ಸಂಪರ್ಕಿಸಲು ನಿಮ್ಮ ಮೊಬೈಲ್ ನಂಬರ್ ಕೊಡುತ್ತೀರಾ?",
  },
  site_visit_preference: {
    en: "Would you like to schedule a site visit — and if so, which day and time suit you?",
    kn: "ಸೈಟ್ ವಿಸಿಟ್ ಮಾಡಲು ಇಷ್ಟವಿದ್ದರೆ, ಯಾವ ದಿನ ಮತ್ತು ಎಷ್ಟು ಗಂಟೆಗೆ ಅನುಕೂಲ?",
  },
};

const pickLang = (l: L): "en" | "kn" => (l === "en" ? "en" : "kn");

function ack(e: Extracted, lang: "en" | "kn"): string {
  const bits: string[] = [];
  if (e.property_type) bits.push(lang === "kn" ? ({ plot: "ಸೈಟ್", villa: "ವಿಲ್ಲಾ", apartment: "ಅಪಾರ್ಟ್ಮೆಂಟ್", investment: "ಹೂಡಿಕೆ property" } as const)[e.property_type] : (e.property_type === "investment" ? "an investment property" : e.property_type === "apartment" ? "an apartment" : `a ${e.property_type}`));
  if (e.preferred_location) bits.push(lang === "kn" ? `${e.preferred_location} ನಲ್ಲಿ` : `in ${e.preferred_location}`);
  if (e.budget_text) bits.push(lang === "kn" ? `ಬಜೆಟ್ ${e.budget_text}` : `budget ${e.budget_text}`);
  if (e.configuration) bits.push(e.configuration);
  if (!bits.length) {
    if (e.name) return lang === "kn" ? `ಧನ್ಯವಾದಗಳು ${e.name}!` : `Thank you, ${e.name}!`;
    if (e.purpose || e.timeline || e.phone) return lang === "kn" ? "ಧನ್ಯವಾದಗಳು!" : "Thank you!";
    return "";
  }
  return lang === "kn" ? `ಸರಿ — ${bits.join(", ")}. ` : `Got it — ${bits.join(", ")}. `;
}

function firstSentences(text: string, n = 2) {
  return text.split(/(?<=[.!?])\s+/).slice(0, n).join(" ");
}

function relevantLine(text: string, query: string): string {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const lines = text.split(/\n|(?<=[.])\s+/);
  const scored = lines.map((l) => ({ l, s: words.filter((w) => l.toLowerCase().includes(w)).length })).sort((a, b) => b.s - a.s);
  return scored[0]?.s ? scored.slice(0, 2).map((x) => x.l.trim()).join(" ") : firstSentences(text);
}

export function simulateAgent(input: AgentInput): AgentDecision {
  const { signals: sig, extracted, missing, knowledge, lead } = input;
  const lang = pickLang(sig.language);
  const name = extracted.name ?? lead.name;
  const base: Omit<AgentDecision, "reply"> = {
    askedField: null,
    intent: "provide_info",
    confidence: 0.9,
    escalate: null,
    knowledgeGap: null,
    usedSources: [],
    extracted,
  };

  if (sig.escalation) {
    const msg =
      sig.escalation.type === "human_request"
        ? lang === "kn"
          ? "ಖಂಡಿತ! ನಮ್ಮ property advisor ಶೀಘ್ರದಲ್ಲೇ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ."
          : "Certainly! I'm connecting you with our property advisor — they will call you shortly."
        : lang === "kn"
          ? "ಇದನ್ನು ನಮ್ಮ ಹಿರಿಯ ತಂಡದವರು ನೇರವಾಗಿ ನೋಡಿಕೊಳ್ಳುತ್ತಾರೆ. ಅವರು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ."
          : "Thank you for telling us. A senior member of our sales team will personally take this up and contact you shortly.";
    return { ...base, reply: msg, intent: `escalation_${sig.escalation.type}`, escalate: { reason: sig.escalation.reason, type: sig.escalation.type }, confidence: 0.95 };
  }

  const parts: string[] = [];
  if (input.isFirstTurn || (sig.greeting && Object.keys(extracted).length === 0)) {
    parts.push(
      lang === "kn"
        ? `ನಮಸ್ಕಾರ${name ? " " + name : ""}! 🙏 ${input.companyName} ಗೆ ಸ್ವಾಗತ. ನಾನು ${input.agentName}, ನಿಮಗೆ ಸರಿಯಾದ property ಹುಡುಕಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.`
        : `Namaskara${name ? " " + name : ""}! 🙏 Welcome to ${input.companyName}. I'm ${input.agentName}, and I'll help you find the right property.`,
    );
  }

  // Knowledge questions — answer ONLY from approved, verified knowledge.
  let usedSources: string[] = [];
  let knowledgeGap: string | null = null;
  let intent = "provide_info";
  if (sig.question && !sig.greeting) {
    intent = "question";
    const asksPrice = /price|rate|cost|ಬೆಲೆ|eshtu|estu|ಎಷ್ಟು/i.test(input.customerText);
    const asksApproval = /approv|rera|bmrda|dtcp|khata|ಅನುಮೋದನೆ/i.test(input.customerText);
    const hit = knowledge.find((k) => {
      if (k.score < 0.8) return false;
      if (asksPrice) return /price range:|₹/i.test(k.text);
      if (asksApproval) return /approv|rera/i.test(k.text) && !/to be entered|pending verification/i.test(k.text);
      return true;
    });
    if (hit) {
      const line = asksPrice ? (hit.text.match(/Price range:[^\n]+/i)?.[0] ?? relevantLine(hit.text, input.customerText)) : relevantLine(hit.text, input.customerText);
      parts.push(`${line} (Source: ${hit.title})`);
      usedSources = [hit.sourceId];
    } else {
      knowledgeGap = input.customerText;
      parts.push(
        lang === "kn"
          ? "ಒಳ್ಳೆಯ ಪ್ರಶ್ನೆ. ಇದರ ಬಗ್ಗೆ ಪರಿಶೀಲಿಸಿದ ಮಾಹಿತಿ ನನ್ನ ಬಳಿ ಈಗ ಇಲ್ಲ — ನಮ್ಮ ತಂಡ ಖಚಿತಪಡಿಸಿ ತಿಳಿಸುತ್ತದೆ."
          : "That's a good question. I don't have verified information on that right now — our team will confirm it for you.",
      );
    }
  } else {
    const a = ack(extracted, lang);
    if (a) parts.push(a.trim());
  }

  if (input.newlyMatched.length) {
    const list = input.newlyMatched.slice(0, 3).map((p) => `• ${p.name} — ${p.location}`).join("\n");
    parts.push(lang === "kn" ? `ನೀವು ಹೇಳಿದ ಅವಶ್ಯಕತೆಗೆ ಹೊಂದುವ ಪರಿಶೀಲಿತ projects:\n${list}` : `Based on what you've shared, these verified projects may suit you:\n${list}`);
  }

  if (sig.wantsLater) {
    parts.push(lang === "kn" ? "ಖಂಡಿತ, ನಾವು ನಂತರ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ." : "No problem — we'll follow up with you later.");
    return { ...base, reply: parts.join("\n\n"), intent: "later_follow_up", usedSources, knowledgeGap };
  }

  const next = missing[0] ?? null;
  if (next) parts.push(Q[next][lang]);
  else if (!extracted.visit_at)
    parts.push(
      lang === "kn"
        ? "ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಎಲ್ಲಾ ವಿವರಗಳು ನಮಗೆ ಸಿಕ್ಕಿವೆ. ನಮ್ಮ property advisor ಶೀಘ್ರದಲ್ಲೇ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ."
        : "Thank you! I have everything I need. Our property advisor will get in touch with you shortly.",
    );

  return {
    ...base,
    reply: parts.join("\n\n"),
    askedField: next,
    intent,
    usedSources,
    knowledgeGap,
    confidence: knowledgeGap ? 0.6 : 0.9,
  };
}
