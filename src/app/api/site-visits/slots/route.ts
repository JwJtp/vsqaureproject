import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSlots } from "@/lib/visits";

export const GET = route(async (req) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? new Date().toISOString().slice(0, 10);
  return json({ date, slots: await getSlots(date, sp.get("projectId")) });
});
