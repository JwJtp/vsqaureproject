"use client";
import { useState } from "react";
import { Plus, Pencil, UserX } from "lucide-react";
import { PageHeader, useApi, api, useAction, Badge, Modal, Field, Toggle, Empty, Skeleton, phoneFmt, cx } from "@/components/ui";
import { PROPERTY_TYPES, type Executive } from "@/lib/types";

type E = Executive & { openLeads: number; assignedToday: number; totalLeads: number; converted: number; lost: number; conversionRate: number };
const blank = { name: "", phone: "", email: "", project_ids: [] as string[], expertise: [] as string[], locations: [] as string[], available: true, active: true, daily_capacity: 15 };

export default function Executives() {
  const { data, mutate } = useApi<{ executives: E[] }>("/api/executives");
  const { data: pj } = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [locText, setLocText] = useState("");
  const { run, busy } = useAction();
  const open = (e?: E) => { const v = e ? { ...e } : { ...blank }; setEdit(v); setLocText(v.locations.join(", ")); };
  const save = () => run(async () => {
    const body = { ...edit!, locations: locText.split(",").map((s) => s.trim()).filter(Boolean) };
    if (edit!.id) await api(`/api/executives/${edit!.id}`, { method: "PATCH", json: body });
    else await api("/api/executives", { method: "POST", json: body });
    setEdit(null);
    mutate();
  }, "Executive saved");
  const quick = (id: string, patch: Partial<Executive>, ok: string) => run(async () => { await api(`/api/executives/${id}`, { method: "PATCH", json: patch }); mutate(); }, ok);
  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <>
      <PageHeader eyebrow="Team" title="Executive Management" subtitle="Availability, capacity, project and location coverage drive automatic lead assignment. Unavailable or full executives are never assigned." actions={<button className="btn-primary" onClick={() => open()}><Plus className="h-4 w-4" /> Add executive</button>} />
      {!data ? <Skeleton className="h-80" /> : !data.executives.length ? <div className="card"><Empty title="No executives yet" hint="Add your sales team so leads can be assigned." /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.executives.map((e) => (
            <div key={e.id} className={cx("card p-5", !e.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#1a2541] to-[#070b16] font-semibold text-[#e9d6a7]">{e.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
                  <div><div className="font-semibold">{e.name}</div><div className="muted text-xs">{phoneFmt(e.phone)} · {e.email}</div></div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => open(e)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {e.is_demo && <Badge tone="gold">demo</Badge>}
                {!e.active ? <Badge tone="red">inactive</Badge> : e.available ? <Badge tone="green">available</Badge> : <Badge>unavailable</Badge>}
                {e.expertise.map((x) => <Badge key={x} tone="navy">{x}</Badge>)}
                {e.locations.map((x) => <Badge key={x} tone="blue">{x}</Badge>)}
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[["Today", `${e.assignedToday}/${e.daily_capacity}`], ["Open", e.openLeads], ["Won", e.converted], ["Conv.", `${e.conversionRate}%`]].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl py-2 panel-2"><div className="text-base font-semibold tabular-nums">{v}</div><div className="muted text-[10px] uppercase">{k}</div></div>
                ))}
              </div>
              <div className="muted mt-3 text-xs">Projects: {e.project_ids.map((p) => pj?.projects.find((x) => x.id === p)?.name ?? "—").join(", ") || "none"}</div>
              <div className="mt-4 flex items-center justify-between">
                <Toggle checked={e.available} disabled={busy || !e.active} onChange={(v) => quick(e.id, { available: v }, v ? `${e.name} is available` : `${e.name} marked unavailable`)} label="Available" />
                {e.active ? <button className="btn-danger btn-sm" onClick={() => { if (confirm(`Deactivate ${e.name}? Their history is kept.`)) run(async () => { await api(`/api/executives/${e.id}`, { method: "DELETE" }); mutate(); }, "Executive deactivated"); }}><UserX className="h-3.5 w-3.5" /> Deactivate</button>
                  : <button className="btn-ghost btn-sm" onClick={() => quick(e.id, { active: true, available: true }, "Executive reactivated")}>Reactivate</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit executive" : "Add executive"} wide footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy || !edit?.name || !edit?.phone || !edit?.email} onClick={save}>Save</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="WhatsApp phone" hint="Receives lead notifications"><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Daily lead capacity"><input className="input" type="number" min={0} value={edit.daily_capacity} onChange={(e) => setEdit({ ...edit, daily_capacity: +e.target.value })} /></Field>
            <Field label="Locations covered" hint="Comma separated, e.g. Hosur, Attibele" className="sm:col-span-2"><input className="input" value={locText} onChange={(e) => setLocText(e.target.value)} /></Field>
            <div className="sm:col-span-2"><span className="label">Property expertise</span><div className="flex flex-wrap gap-2">{PROPERTY_TYPES.map((t) => <button type="button" key={t} onClick={() => setEdit({ ...edit, expertise: toggleIn(edit.expertise, t) })} className={cx("rounded-full border px-3 py-1 text-xs hairline", edit.expertise.includes(t) && "border-[var(--gold)] bg-[var(--gold-soft)]")}>{t}</button>)}</div></div>
            <div className="sm:col-span-2"><span className="label">Assigned projects</span><div className="flex flex-wrap gap-2">{pj?.projects.map((p) => <button type="button" key={p.id} onClick={() => setEdit({ ...edit, project_ids: toggleIn(edit.project_ids, p.id) })} className={cx("rounded-full border px-3 py-1 text-xs hairline", edit.project_ids.includes(p.id) && "border-[var(--gold)] bg-[var(--gold-soft)]")}>{p.name}</button>)}</div></div>
            <Toggle checked={edit.available} onChange={(v) => setEdit({ ...edit, available: v })} label="Available for new leads" />
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
          </div>
        )}
      </Modal>
    </>
  );
}
