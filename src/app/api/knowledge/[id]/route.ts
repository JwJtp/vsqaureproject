import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { approveDocument } from "@/lib/knowledge";
import { audit } from "@/lib/log";

type P = { params: Promise<{ id: string }> };
export const GET = route<P>(async (_req, { params }) => {
  const { id } = await params;
  await requireUser(["admin", "manager"]);
  const store = await getStore();
  const doc = await store.get("documents", id);
  if (!doc) throw new HttpError(404, "Not found");
  const versions = doc.parent_id ? await store.list("documents", { where: { parent_id: doc.parent_id }, order: { column: "version", ascending: false } }) : [doc];
  const chunks = await store.list("document_chunks", { where: { document_id: id }, order: { column: "idx" } });
  return json({ document: doc, versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, updated_at: v.updated_at, approved_by: v.approved_by })), chunks });
});

export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin", "manager"]);
  const { action } = await req.json();
  const store = await getStore();
  if (action === "approve") return json({ document: await approveDocument(id, user.email) });
  if (action === "unapprove") {
    const d = await store.update("documents", id, { status: "draft", approved_by: null });
    await audit(user.email, "document.unapprove", "documents", id);
    return json({ document: d });
  }
  throw new HttpError(400, "Unknown action");
});

export const DELETE = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin"]);
  const store = await getStore();
  for (const c of await store.list("document_chunks", { where: { document_id: id } })) await store.remove("document_chunks", c.id);
  await store.remove("documents", id);
  await audit(user.email, "document.delete", "documents", id);
  return json({ deleted: true });
});
