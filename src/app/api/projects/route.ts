import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";
import { ProjectSchema } from "@/lib/schemas";


export const GET = route(async () => {
  await requireUser();
  const store = await getStore();
  const [projects, leads, docs] = await Promise.all([store.list("projects", { order: { column: "name" } }), store.list("leads"), store.list("documents")]);
  return json({
    projects: projects.map((p) => ({
      ...p,
      enquiries: leads.filter((l) => l.matched_project_ids.includes(p.id)).length,
      conversions: leads.filter((l) => l.matched_project_ids.includes(p.id) && l.status === "CONVERTED").length,
      documents: docs.filter((d) => d.project_id === p.id && d.status !== "superseded").length,
    })),
  });
});

export const POST = route(async (req) => {
  const user = await requireUser(["admin", "manager"]);
  const body = ProjectSchema.parse(await req.json());
  const store = await getStore();
  const p = await store.insert("projects", { ...body, verified_by: body.verified ? user.email : null, version: 1, is_demo: store.kind === "memory" });
  await audit(user.email, "project.create", "projects", p.id, { verified: body.verified });
  return json({ project: p }, 201);
});
