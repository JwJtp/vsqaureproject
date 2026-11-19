import { describe, it, expect } from "vitest";
import { extract, signals, detectLanguage, parseBudget, parseVisitTime } from "@/lib/ai/extract";

describe("bilingual extraction", () => {
  it("English plot enquiry", () => {
    const e = extract("Hi, I want a 30x40 plot in Hosur, budget 30 to 40 lakh");
    expect(e.property_type).toBe("plot");
    expect(e.preferred_location).toBe("Hosur");
    expect(e.configuration).toBe("30x40");
    expect(e.budget_min).toBe(30e5);
    expect(e.budget_max).toBe(40e5);
  });
  it("Kannada script", () => {
    const e = extract("ನಮಸ್ಕಾರ, ನನಗೆ ಅತ್ತಿಬೆಲೆ ಹತ್ತಿರ ಫ್ಲಾಟ್ ಬೇಕು, ಬಜೆಟ್ ೬೦ ಲಕ್ಷ");
    expect(e.property_type).toBe("apartment");
    expect(e.preferred_location).toBe("Attibele");
    expect(e.budget_max).toBe(60e5);
    expect(detectLanguage("ನನಗೆ ಸೈಟ್ ಬೇಕು")).toBe("kn");
  });
  it("Kanglish / mixed", () => {
    const e = extract("villa beku Electronic City side, 1.2 cr budget ide");
    expect(e.property_type).toBe("villa");
    expect(e.preferred_location).toBe("Electronic City");
    expect(e.budget_max).toBe(1.2e7);
    expect(detectLanguage("villa beku sir")).toBe("mixed");
  });
  it("budget formats", () => {
    expect(parseBudget("₹45L")?.budget_max).toBe(45e5);
    expect(parseBudget("under 50 lakhs")?.budget_min).toBeUndefined();
    expect(parseBudget("80", true)?.budget_max).toBe(80e5);
    expect(parseBudget("1.5", true)?.budget_max).toBe(1.5e7);
    expect(parseBudget("call me on 9876543210")).toBeUndefined();
  });
  it("phone, name, purpose, timeline", () => {
    const e = extract("My name is Ravi Kumar, call 98450 12345, for building my own house, within 3 months");
    expect(e.phone).toBe("919845012345");
    expect(e.name).toBe("Ravi Kumar");
    expect(e.purpose).toBe("personal");
    expect(e.timeline).toBe("Within 3 months");
    expect(e.property_type).toBeUndefined(); // "house" in purpose must not become a villa
  });
  it("answers to the last question", () => {
    expect(extract("Suresh", { lastAsked: "name" }).name).toBe("Suresh");
    expect(extract("Bagalur road", { lastAsked: "preferred_location" }).preferred_location).toBe("Bagalur");
    expect(extract("Kammanahalli", { lastAsked: "preferred_location" }).preferred_location).toBe("Kammanahalli");
    expect(extract("30 lakh", { lastAsked: "preferred_location" }).preferred_location).toBeUndefined();
    expect(extract("yes", { lastAsked: "site_visit_preference" }).site_visit_preference).toMatch(/Yes/);
  });
  it("visit date/time in IST", () => {
    const now = new Date("2026-11-19T06:00:00Z"); // Thu 11:30 IST
    const r = parseVisitTime("Saturday 11 am", now);
    expect(r.iso).toBe("2026-11-21T05:30:00.000Z");
    expect(parseVisitTime("ನಾಳೆ 3 pm", now).iso).toBe("2026-11-20T09:30:00.000Z");
    expect(parseVisitTime("tomorrow evening", now).iso).toBe("2026-11-20T10:30:00.000Z");
  });
});

describe("signals", () => {
  it("opt-out", () => {
    expect(signals("STOP").optOut).toBe(true);
    expect(signals("please don't message me again").optOut).toBe(true);
    expect(signals("stop by the site tomorrow?").optOut).toBe(false);
  });
  it("escalations", () => {
    expect(signals("Can you give a discount on the final price?").escalation?.type).toBe("negotiation");
    expect(signals("This is a fraud, I want a refund").escalation?.type).toBe("complaint");
    expect(signals("I want to talk to a human").escalation?.type).toBe("human_request");
    expect(signals("Is there any litigation on the land?").escalation?.type).toBe("legal");
    expect(signals("plot beku").escalation).toBeNull();
  });
});

describe("regressions", () => {
  it("BHK alone does not change the property type", () => {
    expect(extract("3 BHK").property_type).toBeUndefined();
    expect(extract("3 BHK").configuration).toBe("3 BHK");
    expect(extract("2BHK flat beku").property_type).toBe("apartment");
  });
});
