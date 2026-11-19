import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";
import { ProjectSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };
export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin", "manager"]);
  const store = await getStore();
  const cur = await store.get("projects", id);
  if (!cur) throw new HttpError(404, "Project not found");
  const body = ProjectSchema.partial().parse(await req.json());
  const p = await store.update("projects", id, {
    ...body,
    version: cur.version + 1,
    ...(body.verified !== undefined ? { verified_by: body.verified ? user.email : null } : {}),
  });
  await audit(user.email, "project.update", "projects", id, { version: p.version, fields: Object.keys(body) });
  return json({ project: p });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin"]);
  const store = await getStore();
  await store.remove("projects", id);
  await audit(user.email, "project.delete", "projects", id);
  return json({ deleted: true });
});
