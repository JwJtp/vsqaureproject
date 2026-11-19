"use client";
import { useState } from "react";
import { Plus, Pencil, ShieldCheck, ShieldAlert, MapPin, Trash2 } from "lucide-react";
import { PageHeader, useApi, api, useAction, Badge, Modal, Field, Toggle, Empty, Skeleton } from "@/components/ui";
import { PROPERTY_TYPES, type Project } from "@/lib/types";

type P = Project & { enquiries: number; conversions: number; documents: number };
const blank: Partial<Project> = { name: "", location: "", property_type: "plot", configurations: "", plot_dimensions: "", price_range: "", inventory: "", amenities: [], specifications: "", approvals: "", faqs: [], sales_contact: "", instructions: "", verified: false };

export default function Projects() {
  const { data, mutate } = useApi<{ projects: P[] }>("/api/projects");
  const [edit, setEdit] = useState<Partial<Project> | null>(null);
  const [amen, setAmen] = useState("");
  const [faqText, setFaqText] = useState("");
  const { run, busy } = useAction();
  const open = (p?: P) => {
    const v = p ? { ...p } : { ...blank };
    setEdit(v);
    setAmen((v.amenities ?? []).join(", "));
    setFaqText((v.faqs ?? []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n"));
  };
  const save = () => run(async () => {
    const faqs = faqText.split(/\n\s*\n/).map((b) => ({ q: b.match(/Q:\s*(.+)/)?.[1]?.trim() ?? "", a: b.match(/A:\s*([\s\S]+)/)?.[1]?.trim() ?? "" })).filter((f) => f.q && f.a);
    const { id, name, location, property_type, configurations, plot_dimensions, price_range, inventory, specifications, approvals, sales_contact, instructions, verified } = edit!;
    const body = { name, location, property_type, configurations: configurations || null, plot_dimensions: plot_dimensions || null, price_range: price_range || null, inventory: inventory || null, specifications: specifications || null, approvals: approvals || null, sales_contact: sales_contact || null, instructions: instructions || null, verified, amenities: amen.split(",").map((s) => s.trim()).filter(Boolean), faqs };
    if (id) await api(`/api/projects/${id}`, { method: "PATCH", json: body });
    else await api("/api/projects", { method: "POST", json: body });
    setEdit(null);
    mutate();
  }, "Project saved");
  const s = (k: keyof Project) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setEdit({ ...edit!, [k]: e.target.value });

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Project Management" subtitle="Only projects marked VERIFIED are visible to the AI. Enter real V Square project data here — nothing is invented by the system." actions={<button className="btn-primary" onClick={() => open()}><Plus className="h-4 w-4" /> Add project</button>} />
      <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
        The public website lists plots, villas and apartments in Hosur and Bengaluru but no project-level details. The DEMO projects below are fictional placeholders — replace them with verified project data before going live.
      </div>
      {!data ? <Skeleton className="h-80" /> : !data.projects.length ? <div className="card"><Empty title="No projects yet" /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.projects.map((p) => (
            <div key={p.id} className="card flex flex-col overflow-hidden">
              <div className="relative h-24 bg-gradient-to-br from-[#0b1222] via-[#1a2541] to-[#3a3220] p-4 text-white">
                <div className="flex flex-wrap gap-1">
                  {p.verified ? <Badge tone="green"><ShieldCheck className="h-3 w-3" />verified</Badge> : <Badge tone="red"><ShieldAlert className="h-3 w-3" />unverified — hidden from AI</Badge>}
                  {p.is_demo && <Badge tone="gold">demo</Badge>}
                  <Badge tone="navy">{p.property_type}</Badge>
                </div>
                <div className="absolute bottom-3 left-4 right-4 truncate text-lg font-semibold">{p.name}</div>
              </div>
              <div className="flex-1 space-y-1.5 p-4 text-sm">
                <div className="flex items-center gap-1.5"><MapPin className="gold h-3.5 w-3.5" />{p.location}</div>
                <div><span className="muted">Price:</span> {p.price_range ?? "— not entered"}</div>
                <div><span className="muted">Sizes:</span> {p.plot_dimensions ?? p.configurations ?? "—"}</div>
                <div><span className="muted">Approvals:</span> {p.approvals ?? "— not entered"}</div>
                <div><span className="muted">Availability:</span> {p.inventory ?? "—"}</div>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-xs hairline">
                <span className="muted">{p.enquiries} enquiries · {p.conversions} won · {p.documents} docs · v{p.version}</span>
                <div className="flex gap-1">
                  <button className="btn-ghost btn-sm" onClick={() => open(p)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="btn-danger btn-sm" aria-label="Delete" onClick={() => { if (confirm(`Delete ${p.name}?`)) run(async () => { await api(`/api/projects/${p.id}`, { method: "DELETE" }); mutate(); }, "Project deleted"); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit project" : "Add project"} wide footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy || !edit?.name || !edit?.location} onClick={save}>Save project</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name"><input className="input" value={edit.name ?? ""} onChange={s("name")} /></Field>
            <Field label="Location"><input className="input" value={edit.location ?? ""} onChange={s("location")} /></Field>
            <Field label="Property type"><select className="input" value={edit.property_type} onChange={s("property_type")}>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Price range" hint="e.g. ₹18 L – ₹42 L (used for budget matching)"><input className="input" value={edit.price_range ?? ""} onChange={s("price_range")} /></Field>
            <Field label="Unit configurations"><input className="input" value={edit.configurations ?? ""} onChange={s("configurations")} /></Field>
            <Field label="Plot dimensions"><input className="input" value={edit.plot_dimensions ?? ""} onChange={s("plot_dimensions")} /></Field>
            <Field label="Available inventory"><input className="input" value={edit.inventory ?? ""} onChange={s("inventory")} /></Field>
            <Field label="Sales contact"><input className="input" value={edit.sales_contact ?? ""} onChange={s("sales_contact")} /></Field>
            <Field label="Amenities" hint="Comma separated" className="sm:col-span-2"><input className="input" value={amen} onChange={(e) => setAmen(e.target.value)} /></Field>
            <Field label="Approval information" hint="Include registration numbers exactly as issued" className="sm:col-span-2"><input className="input" value={edit.approvals ?? ""} onChange={s("approvals")} /></Field>
            <Field label="Specifications" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.specifications ?? ""} onChange={s("specifications")} /></Field>
            <Field label="FAQs" hint="Blocks of 'Q: …' and 'A: …' separated by a blank line" className="sm:col-span-2"><textarea className="input font-mono text-xs" rows={4} value={faqText} onChange={(e) => setFaqText(e.target.value)} /></Field>
            <Field label="Project-specific AI instructions" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.instructions ?? ""} onChange={s("instructions")} /></Field>
            <div className="sm:col-span-2 rounded-xl border p-3 hairline"><Toggle checked={!!edit.verified} onChange={(v) => setEdit({ ...edit, verified: v })} label="I confirm this information is verified and the AI may use it" /></div>
          </div>
        )}
      </Modal>
    </>
  );
}
