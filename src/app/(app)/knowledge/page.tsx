"use client";
import { useState } from "react";
import { Upload, FileText, CheckCircle2, Search, History, Trash2, Plus, Undo2 } from "lucide-react";
import { PageHeader, Card, useApi, api, useAction, Badge, Modal, Field, Toggle, Empty, Skeleton, fmtDate } from "@/components/ui";
import type { KnowledgeDocument } from "@/lib/types";

type D = KnowledgeDocument & { project_name: string | null };
type Hit = { sourceId: string; title: string; text: string; score: number };

export default function Knowledge() {
  const { data, mutate } = useApi<{ documents: D[] }>("/api/knowledge");
  const { data: pj } = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const [show, setShow] = useState<null | { id?: string; title: string; project_id: string; content: string; approve: boolean; file: File | null }>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  const { data: detail } = useApi<{ document: KnowledgeDocument; versions: { id: string; version: number; status: string; updated_at: string; approved_by: string | null }[]; chunks: { idx: number; text: string }[] }>(view ? `/api/knowledge/${view}` : null);
  const { run, busy } = useAction();

  const save = () => run(async () => {
    const fd = new FormData();
    fd.set("title", show!.title);
    fd.set("project_id", show!.project_id);
    fd.set("approve", String(show!.approve));
    if (show!.id) fd.set("id", show!.id);
    if (show!.file) fd.set("file", show!.file);
    else fd.set("content", show!.content);
    await api("/api/knowledge", { method: "POST", body: fd });
    setShow(null);
    mutate();
  }, "Document indexed");
  const docs = data?.documents.filter((d) => d.status !== "superseded") ?? [];

  return (
    <>
      <PageHeader eyebrow="Knowledge" title="Knowledge Base" subtitle="Upload brochures, price sheets, FAQs and approval documents. Only APPROVED documents and VERIFIED projects are retrieved by the AI (RAG with source references and version history)."
        actions={<button className="btn-primary" onClick={() => setShow({ title: "", project_id: "", content: "", approve: false, file: null })}><Plus className="h-4 w-4" /> Add document</button>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Documents">
          {!data ? <Skeleton className="h-64" /> : !docs.length ? <Empty title="No documents yet" hint="Upload a PDF or paste text." /> : (
            <ul className="-my-2 divide-y hairline">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  <FileText className="gold h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <button className="truncate text-left text-sm font-medium hover:underline" onClick={() => setView(d.id)}>{d.title}</button>
                    <div className="muted text-xs">{d.project_name ?? "Company-wide"} · v{d.version} · {d.chunk_count} chunks · {d.filename ?? "text"} · {fmtDate(d.updated_at, { dateStyle: "medium" })}</div>
                  </div>
                  {d.is_demo && <Badge tone="gold">demo</Badge>}
                  <Badge tone={d.status === "approved" ? "green" : "gray"}>{d.status === "approved" ? "approved — used by AI" : "draft — not used"}</Badge>
                  <div className="flex gap-1">
                    {d.status === "approved"
                      ? <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/knowledge/${d.id}`, { method: "PATCH", json: { action: "unapprove" } }); mutate(); }, "Moved to draft")}><Undo2 className="h-3.5 w-3.5" /> Unapprove</button>
                      : <button className="btn-gold btn-sm" onClick={() => run(async () => { await api(`/api/knowledge/${d.id}`, { method: "PATCH", json: { action: "approve" } }); mutate(); }, "Approved — AI can now use it")}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>}
                    <button className="btn-ghost btn-sm" onClick={() => setShow({ id: d.id, title: d.title, project_id: d.project_id ?? "", content: "", approve: false, file: null })} title="Upload new version"><History className="h-3.5 w-3.5" /></button>
                    <button className="btn-danger btn-sm" aria-label="Delete" onClick={() => { if (confirm("Delete this document?")) run(async () => { await api(`/api/knowledge/${d.id}`, { method: "DELETE" }); mutate(); }, "Deleted"); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Search className="h-4 w-4" /> Retrieval tester</span>} subtitle="See exactly which approved sources the AI would use.">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => setHits((await api<{ hits: Hit[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}`)).hits)); }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. plot sizes in Hosur" />
            <button className="btn-primary" disabled={!q.trim()}>Test</button>
          </form>
          {hits && (hits.length ? (
            <ul className="mt-4 space-y-2">{hits.map((h) => <li key={h.sourceId} className="rounded-xl border p-3 text-xs hairline"><div className="flex justify-between gap-2 font-semibold"><span className="truncate">{h.title}</span><span className="muted">{h.score}</span></div><div className="muted font-mono text-[10px]">{h.sourceId}</div><p className="mt-1 line-clamp-4">{h.text}</p></li>)}</ul>
          ) : <p className="muted mt-4 text-sm">No approved knowledge matches. The AI would say the team will confirm.</p>)}
        </Card>
      </div>

      <Modal open={!!show} onClose={() => setShow(null)} title={show?.id ? "Upload new version" : "Add knowledge document"} wide footer={<><button className="btn-ghost" onClick={() => setShow(null)}>Cancel</button><button className="btn-primary" disabled={busy || !show?.title || (!show?.file && !show?.content.trim())} onClick={save}><Upload className="h-4 w-4" /> Save & index</button></>}>
        {show && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title"><input className="input" value={show.title} onChange={(e) => setShow({ ...show, title: e.target.value })} /></Field>
              <Field label="Project"><select className="input" value={show.project_id} onChange={(e) => setShow({ ...show, project_id: e.target.value })}><option value="">Company-wide</option>{pj?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            </div>
            <Field label="File (PDF, TXT, MD, CSV, JSON — max 8 MB)"><input type="file" accept=".pdf,.txt,.md,.csv,.json" className="input" onChange={(e) => setShow({ ...show, file: e.target.files?.[0] ?? null })} /></Field>
            {!show.file && <Field label="…or paste text"><textarea className="input" rows={8} value={show.content} onChange={(e) => setShow({ ...show, content: e.target.value })} /></Field>}
            <div className="rounded-xl border p-3 hairline"><Toggle checked={show.approve} onChange={(v) => setShow({ ...show, approve: v })} label="Approve now — content is verified and the AI may quote it" /></div>
          </div>
        )}
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={detail?.document.title ?? "Document"} wide>
        {!detail ? <Skeleton className="h-40" /> : (
          <div className="space-y-4">
            <div><span className="label">Versions</span><ul className="space-y-1 text-sm">{detail.versions.map((v) => <li key={v.id}>v{v.version} · <Badge tone={v.status === "approved" ? "green" : "gray"}>{v.status}</Badge> · {fmtDate(v.updated_at)} {v.approved_by && `· approved by ${v.approved_by}`}</li>)}</ul></div>
            <div><span className="label">Indexed chunks</span><ol className="space-y-2">{detail.chunks.map((c) => <li key={c.idx} className="rounded-lg p-2 text-xs panel-2"><b>#{c.idx}</b> {c.text}</li>)}</ol></div>
          </div>
        )}
      </Modal>
    </>
  );
}
