"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Search, LayoutGrid, Rows3, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { PageHeader, useApi, api, useAction, Badge, PriorityBadge, StatusBadge, Empty, timeAgo, SOURCE_LABEL, Modal, Field, phoneFmt, Tabs, Skeleton, Toggle } from "@/components/ui";
import { FilterBar, toQuery, type FilterState } from "@/components/filters";
import { PROPERTY_TYPES, type Lead } from "@/lib/types";

type L = Lead & { executive_name: string | null };

function NewLeadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", property_type: "", preferred_location: "", budget_text: "", configuration: "", timeline: "", message: "", consent: true, autoAssign: true });
  const { run, busy } = useAction();
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => run(async () => {
    const r = await api<{ duplicate: boolean; assignedTo: string | null }>("/api/leads", { method: "POST", json: { ...f, source: "manual", property_type: f.property_type || null, email: f.email || null } });
    onDone();
    onClose();
    return r;
  }, "Lead saved");
  return (
    <Modal open={open} onClose={onClose} title="Add lead manually" wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || (!f.phone && !f.email)} onClick={submit}>Save lead</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Phone *" hint="10-digit Indian mobile or with country code"><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Property type"><select className="input" value={f.property_type} onChange={(e) => set("property_type", e.target.value)}><option value="">—</option>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Preferred location"><input className="input" value={f.preferred_location} onChange={(e) => set("preferred_location", e.target.value)} /></Field>
        <Field label="Budget" hint="e.g. 40 lakh or 1.2 cr"><input className="input" value={f.budget_text} onChange={(e) => set("budget_text", e.target.value)} /></Field>
        <Field label="Size / configuration"><input className="input" value={f.configuration} onChange={(e) => set("configuration", e.target.value)} /></Field>
        <Field label="Timeline"><input className="input" value={f.timeline} onChange={(e) => set("timeline", e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.message} onChange={(e) => set("message", e.target.value)} /></Field>
        <Toggle checked={f.consent} onChange={(v) => set("consent", v)} label="Customer consented to WhatsApp contact" />
        <Toggle checked={f.autoAssign} onChange={(v) => set("autoAssign", v)} label="Auto-assign to an executive" />
      </div>
    </Modal>
  );
}

function LeadsInner() {
  const sp = useSearchParams();
  const [f, setF] = useState<FilterState>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"table" | "cards">("table");
  const [sort, setSort] = useState("created_at");
  const [unassigned, setUnassigned] = useState(sp.get("unassigned") === "1");
  const [adding, setAdding] = useState(false);
  const url = `/api/leads${toQuery(f, { q: q || undefined, page: String(page), pageSize: "25", sort, unassigned: unassigned ? "1" : undefined })}`;
  const { data, mutate, isLoading } = useApi<{ total: number; leads: L[] }>(url);
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  return (
    <>
      <PageHeader eyebrow="Lead CRM" title="All Leads" subtitle={`${data?.total ?? "…"} leads from every channel, de-duplicated by phone and email.`}
        actions={<><a className="btn-ghost" href={`/api/leads/export${toQuery(f)}`}><Download className="h-4 w-4" /> Export CSV</a><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add lead</button></>} />
      <FilterBar value={f} onChange={(v) => { setF(v); setPage(1); }} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1"><Search className="muted absolute left-3 top-2.5 h-4 w-4" /><input className="input pl-9" placeholder="Search name, phone, email, location, budget…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Toggle checked={unassigned} onChange={(v) => { setUnassigned(v); setPage(1); }} label="Unassigned queue" />
        <select className="input !w-auto !py-1.5 text-xs" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="created_at">Newest</option><option value="score">Highest score</option><option value="last_interaction_at">Recent activity</option></select>
        <Tabs value={view} onChange={setView} tabs={[{ value: "table", label: <Rows3 className="h-3.5 w-3.5" /> }, { value: "cards", label: <LayoutGrid className="h-3.5 w-3.5" /> }]} />
      </div>

      {isLoading && <Skeleton className="h-96" />}
      {data && !data.leads.length && <div className="card"><Empty title="No leads match" hint="Adjust filters or add a lead." /></div>}
      {data && !!data.leads.length && view === "table" && (
        <div className="card overflow-x-auto">
          <table className="table min-w-[1000px]">
            <thead><tr><th>Customer</th><th>Source</th><th>Requirement</th><th>Budget</th><th>Score</th><th>Status</th><th>Executive</th><th>Last activity</th></tr></thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.name ?? "Unnamed"}</Link><div className="muted text-xs">{phoneFmt(l.phone)}</div>{l.duplicate_of && <Badge tone="gold"><Copy className="h-3 w-3" />dup</Badge>}</td>
                  <td><Badge>{SOURCE_LABEL[l.source]}</Badge>{l.is_demo && <Badge tone="gold" className="ml-1">demo</Badge>}</td>
                  <td className="text-sm">{l.property_type ?? "—"}{l.configuration && <span className="muted"> · {l.configuration}</span>}<div className="muted text-xs">{l.preferred_location ?? ""}</div></td>
                  <td className="text-sm">{l.budget_text ?? "—"}</td>
                  <td><div className="flex items-center gap-2"><span className="tabular-nums font-semibold">{l.score}</span><PriorityBadge priority={l.priority} /></div></td>
                  <td><StatusBadge status={l.status} /></td>
                  <td className="text-sm">{l.executive_name ?? <Badge tone="red">Unassigned</Badge>}</td>
                  <td className="muted text-xs">{timeAgo(l.last_interaction_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && !!data.leads.length && view === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.leads.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="card p-4 transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{l.name ?? "Unnamed"}</div><PriorityBadge priority={l.priority} /></div>
              <div className="muted text-xs">{phoneFmt(l.phone)} · {SOURCE_LABEL[l.source]}</div>
              <div className="mt-3 text-sm">{l.property_type ?? "—"} · {l.preferred_location ?? "—"}</div>
              <div className="muted text-xs">{l.budget_text ?? "budget unknown"} {l.configuration && `· ${l.configuration}`}</div>
              <div className="mt-3 flex items-center justify-between"><StatusBadge status={l.status} /><span className="text-xs">{l.executive_name ?? "Unassigned"}</span></div>
            </Link>
          ))}
        </div>
      )}
      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <span>Page {page} of {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
      <NewLeadModal open={adding} onClose={() => setAdding(false)} onDone={() => mutate()} />
    </>
  );
}

export default function LeadsPage() {
  return <Suspense><LeadsInner /></Suspense>;
}
