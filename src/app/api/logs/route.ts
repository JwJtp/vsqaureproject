import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const GET = route(async (req) => {
  await requireUser(["admin", "manager"]);
  const store = await getStore();
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "system";
  const level = sp.get("level");
  const limit = Math.min(500, +(sp.get("limit") ?? 200));
  switch (type) {
    case "system": return json({ rows: await store.list("system_logs", { where: level ? { level: level as "info" } : {}, order: { column: "created_at", ascending: false }, limit }) });
    case "audit": return json({ rows: await store.list("audit_logs", { order: { column: "created_at", ascending: false }, limit }) });
    case "usage": return json({ rows: await store.list("usage_logs", { order: { column: "created_at", ascending: false }, limit }) });
    case "jobs": return json({ rows: await store.list("jobs", { order: { column: "created_at", ascending: false }, limit }) });
    case "notifications": return json({ rows: await store.list("notifications", { order: { column: "created_at", ascending: false }, limit }) });
    default: throw new HttpError(400, "Unknown log type");
  }
});
