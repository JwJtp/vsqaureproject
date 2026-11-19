import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { retrieve } from "@/lib/knowledge";

/** Test what the AI would retrieve for a question (approved & verified sources only). */
export const GET = route(async (req) => {
  await requireUser(["admin", "manager"]);
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return json({ hits: q.trim() ? await retrieve(q, { limit: 6 }) : [] });
});
