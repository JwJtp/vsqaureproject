import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser, assertLeadAccess, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { activity } from "@/lib/log";

type P = { params: Promise<{ id: string }> };
export const POST = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const store = await getStore();
  const lead = await store.get("leads", id);
  if (!lead) throw new HttpError(404, "Lead not found");
  assertLeadAccess(user, lead);
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(await req.json());
  const note = await store.insert("notes", { lead_id: id, author: user.name, body });
  await activity(id, "note_added", `Note by ${user.name}`, user.email);
  return json({ note }, 201);
});
