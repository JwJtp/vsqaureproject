import "server-only";
import { getStore } from "@/lib/db";
import type { KnowledgeDocument, Project } from "@/lib/types";
import { bm25, chunkText } from "./chunk";
import { audit } from "@/lib/log";

export interface KnowledgeHit {
  sourceId: string; // e.g. doc:<id>#2 or project:<id>
  title: string;
  text: string;
  score: number;
}

export function projectToText(p: Project): string {
  const parts = [
    `Project: ${p.name}`,
    `Location: ${p.location}`,
    `Type: ${p.property_type}`,
    p.configurations && `Configurations: ${p.configurations}`,
    p.plot_dimensions && `Plot dimensions: ${p.plot_dimensions}`,
    p.price_range && `Price range: ${p.price_range}`,
    p.inventory && `Availability: ${p.inventory}`,
    p.amenities?.length && `Amenities: ${p.amenities.join(", ")}`,
    p.specifications && `Specifications: ${p.specifications}`,
    p.approvals && `Approvals: ${p.approvals}`,
    ...(p.faqs ?? []).map((f) => `Q: ${f.q} A: ${f.a}`),
    p.sales_contact && `Sales contact: ${p.sales_contact}`,
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Retrieval only ever returns APPROVED documents and VERIFIED projects. Unverified data
 * stays in the admin knowledge base and is invisible to the AI.
 */
export async function retrieve(query: string, opts: { projectIds?: string[]; limit?: number } = {}): Promise<KnowledgeHit[]> {
  const store = await getStore();
  const [docs, chunks, projects] = await Promise.all([
    store.list("documents", { where: { status: "approved" } }),
    store.list("document_chunks"),
    store.list("projects", { where: { verified: true } }),
  ]);
  const approved = new Map(docs.map((d) => [d.id, d]));
  const corpus: { sourceId: string; title: string; text: string; projectId: string | null }[] = [];
  for (const c of chunks) {
    const d = approved.get(c.document_id);
    if (!d) continue;
    corpus.push({ sourceId: `doc:${d.id}#${c.idx}`, title: `${d.title} (v${d.version})`, text: c.text, projectId: d.project_id });
  }
  for (const p of projects) corpus.push({ sourceId: `project:${p.id}`, title: p.name, text: projectToText(p), projectId: p.id });

  const ranked = bm25(query, corpus, (c) => `${c.title}\n${c.text}`).map((s) => ({
    ...s,
    // boost content belonging to projects already matched for this customer
    score: s.score * (opts.projectIds?.includes(s.item.projectId ?? "") ? 1.5 : 1),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 4).map((r) => ({ sourceId: r.item.sourceId, title: r.item.title, text: r.item.text, score: +r.score.toFixed(3) }));
}

/** Create a document or a new version of an existing one (old version is superseded on approval). */
export async function saveDocument(input: {
  id?: string;
  title: string;
  content: string;
  filename?: string | null;
  project_id?: string | null;
  approve?: boolean;
  actor: string;
}): Promise<KnowledgeDocument> {
  const store = await getStore();
  let parent: KnowledgeDocument | null = null;
  if (input.id) parent = await store.get("documents", input.id);
  const version = parent ? parent.version + 1 : 1;
  const doc = await store.insert("documents", {
    title: input.title,
    content: input.content,
    filename: input.filename ?? null,
    project_id: input.project_id ?? null,
    version,
    parent_id: parent?.parent_id ?? null,
    status: input.approve ? "approved" : "draft",
    approved_by: input.approve ? input.actor : null,
    chunk_count: 0,
    is_demo: store.kind === "memory",
  });
  if (!doc.parent_id) await store.update("documents", doc.id, { parent_id: doc.id });
  const chunks = chunkText(input.content);
  for (let i = 0; i < chunks.length; i++) {
    await store.insert("document_chunks", { document_id: doc.id, project_id: doc.project_id, idx: i, text: chunks[i] });
  }
  const saved = await store.update("documents", doc.id, { chunk_count: chunks.length, parent_id: doc.parent_id ?? doc.id });
  if (input.approve) await supersedeOthers(saved);
  await audit(input.actor, parent ? "document.new_version" : "document.create", "documents", saved.id, { version, approved: !!input.approve });
  return saved;
}

export async function approveDocument(id: string, actor: string) {
  const store = await getStore();
  const doc = await store.update("documents", id, { status: "approved", approved_by: actor });
  await supersedeOthers(doc);
  await audit(actor, "document.approve", "documents", id);
  return doc;
}

async function supersedeOthers(doc: KnowledgeDocument) {
  const store = await getStore();
  const siblings = await store.list("documents", { where: { parent_id: doc.parent_id, status: "approved" } });
  for (const s of siblings) if (s.id !== doc.id) await store.update("documents", s.id, { status: "superseded" });
}
