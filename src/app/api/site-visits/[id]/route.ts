import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, assertLeadAccess, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { bookVisit, BookingError, updateVisitStatus } from "@/lib/visits";

type P = { params: Promise<{ id: string }> };
export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const store = await getStore();
  const v = await store.get("site_visits", id);
  if (!v) throw new HttpError(404, "Visit not found");
  const lead = await store.get("leads", v.lead_id);
  if (lead) assertLeadAccess(user, lead);
  const b = z.object({ status: z.enum(["requested", "confirmed", "completed", "cancelled", "no_show"]).optional(), rescheduleTo: z.string().datetime().optional(), notes: z.string().max(500).optional() }).parse(await req.json());
  if (b.rescheduleTo) {
    try {
      const r = await bookVisit({ leadId: v.lead_id, projectId: v.project_id, at: b.rescheduleTo, actor: user.email, rescheduleOf: id, notes: b.notes });
      return json({ visit: r.visit });
    } catch (e) {
      if (e instanceof BookingError) return json({ error: e.message, alternatives: e.alternatives }, 409);
      throw e;
    }
  }
  if (b.status) return json({ visit: await updateVisitStatus(id, b.status, user.email, b.notes) });
  throw new HttpError(400, "Nothing to update");
});
