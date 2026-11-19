// Output guardrail: blocks replies that state prices, availability or approvals that are not
// present in the approved knowledge given to the model. Pure and unit-tested.

export interface GuardResult {
  ok: boolean;
  violations: string[];
}

function normNum(s: string) {
  return s.replace(/[,\s]/g, "").toLowerCase();
}

export function guardReply(reply: string, approvedContext: string): GuardResult {
  const violations: string[] = [];
  const ctx = approvedContext.toLowerCase();
  const ctxNums = new Set([...ctx.matchAll(/\d+(?:\.\d+)?/g)].map((m) => normNum(m[0])));

  // Monetary figures
  for (const m of reply.matchAll(/(₹\s?[\d,.]+\s*(?:l|lakh|lakhs|lac|cr|crore|crores|k)?|[\d,.]+\s*(?:lakh|lakhs|lac|lacs|crore|crores|cr|ಲಕ್ಷ|ಕೋಟಿ)\b|rs\.?\s?[\d,.]+)/gi)) {
    const nums = [...m[0].matchAll(/\d+(?:\.\d+)?/g)].map((x) => normNum(x[0]));
    if (nums.some((n) => !ctxNums.has(n))) violations.push(`Unverified price: "${m[0].trim()}"`);
  }
  // Approval / legal claims
  for (const term of ["rera", "bmrda", "dtcp", "bda approved", "a khata", "e-khata", "clear title", "100% legal", "approved layout"]) {
    if (reply.toLowerCase().includes(term) && !ctx.includes(term)) violations.push(`Unverified approval claim: "${term}"`);
  }
  // Availability / promises
  const promise = reply.match(/\b(guaranteed?|assured returns?|will double|only \d+ (?:plots?|units?) left|sold out|100% returns?)\b/i);
  if (promise && !ctx.includes(promise[0].toLowerCase())) violations.push(`Unverified promise: "${promise[0]}"`);
  return { ok: violations.length === 0, violations };
}
