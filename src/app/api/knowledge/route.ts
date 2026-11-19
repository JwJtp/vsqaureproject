import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { saveDocument } from "@/lib/knowledge";

const MAX_BYTES = 8 * 1024 * 1024;

async function fileToText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new HttpError(413, "File too large (max 8 MB)");
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text.trim()) throw new HttpError(422, "No text found in PDF (scanned PDFs need OCR first)");
    return text;
  }
  if (/\.(txt|md|csv|json)$/.test(name) || file.type.startsWith("text/")) return await file.text();
  throw new HttpError(415, "Supported files: PDF, TXT, MD, CSV, JSON");
}

export const GET = route(async () => {
  await requireUser(["admin", "manager"]);
  const store = await getStore();
  const [docs, projects] = await Promise.all([store.list("documents", { order: { column: "updated_at", ascending: false } }), store.list("projects")]);
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  return json({ documents: docs.map((d) => ({ ...d, content: d.content.slice(0, 600), project_name: d.project_id ? pName.get(d.project_id) ?? null : null })) });
});

/** Create a document (JSON or multipart upload). Passing `id` creates a new version. */
export const POST = route(async (req) => {
  const user = await requireUser(["admin", "manager"]);
  let title = "", content = "", filename: string | null = null, project_id: string | null = null, approve = false, id: string | undefined;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("file");
    title = String(fd.get("title") ?? "");
    project_id = (fd.get("project_id") as string) || null;
    approve = fd.get("approve") === "true";
    id = (fd.get("id") as string) || undefined;
    if (file instanceof File && file.size) {
      content = await fileToText(file);
      filename = file.name;
      title ||= file.name;
    } else content = String(fd.get("content") ?? "");
  } else {
    const b = await req.json();
    ({ title, content } = b);
    project_id = b.project_id ?? null;
    approve = !!b.approve;
    id = b.id;
  }
  if (!title?.trim() || !content?.trim()) throw new HttpError(400, "Title and content are required");
  if (content.length > 400_000) throw new HttpError(413, "Document text too long");
  const doc = await saveDocument({ id, title: title.trim().slice(0, 200), content, filename, project_id, approve, actor: user.email });
  return json({ document: doc }, 201);
});
