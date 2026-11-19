import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assignLead } from "@/lib/assignment";

type P = { params: Promise<{ id: string }> };
/** Manual (executiveId) or automatic (no executiveId) assignment. Admin/manager only. */
export const POST = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin", "manager"]);
  const { executiveId } = z.object({ executiveId: z.string().optional().nullable() }).parse(await req.json().catch(() => ({})));
  const r = await assignLead(id, { executiveId: executiveId || undefined, actor: user.email });
  return json({ lead: r.lead, executive: r.executive, reason: r.reason });
});
