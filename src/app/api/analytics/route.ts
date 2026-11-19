import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { analytics, parseFilters } from "@/lib/stats";

export const GET = route(async (req) => {
  await requireUser(["admin", "manager"]);
  return json(await analytics(parseFilters(req.nextUrl.searchParams)));
});
