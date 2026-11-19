"use client";
import { useApi } from "./ui";
import { SOURCE_LABEL, statusLabel } from "./ui";
import { LEAD_STATUSES, PROPERTY_TYPES } from "@/lib/types";
import { RotateCcw } from "lucide-react";

export type FilterState = { from?: string; to?: string; projectId?: string; source?: string; propertyType?: string; executiveId?: string; status?: string };

export function toQuery(f: FilterState, extra: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function FilterBar({ value, onChange, hide = [] }: { value: FilterState; onChange: (f: FilterState) => void; hide?: (keyof FilterState)[] }) {
  const { data: p } = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const { data: e } = useApi<{ executives: { id: string; name: string }[] }>("/api/executives");
  const set = (k: keyof FilterState, v: string) => onChange({ ...value, [k]: v || undefined });
  const sel = "input !w-auto !py-1.5 text-xs";
  return (
    <div className="card mb-6 flex flex-wrap items-center gap-2 p-3">
      {!hide.includes("from") && <input aria-label="From date" type="date" className={sel} value={value.from ?? ""} onChange={(x) => set("from", x.target.value)} />}
      {!hide.includes("to") && <input aria-label="To date" type="date" className={sel} value={value.to ?? ""} onChange={(x) => set("to", x.target.value)} />}
      {!hide.includes("projectId") && (
        <select aria-label="Project" className={sel} value={value.projectId ?? ""} onChange={(x) => set("projectId", x.target.value)}>
          <option value="">All projects</option>
          {p?.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      {!hide.includes("source") && (
        <select aria-label="Source" className={sel} value={value.source ?? ""} onChange={(x) => set("source", x.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      {!hide.includes("propertyType") && (
        <select aria-label="Property type" className={sel} value={value.propertyType ?? ""} onChange={(x) => set("propertyType", x.target.value)}>
          <option value="">All property types</option>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {!hide.includes("executiveId") && (
        <select aria-label="Executive" className={sel} value={value.executiveId ?? ""} onChange={(x) => set("executiveId", x.target.value)}>
          <option value="">All executives</option>
          {e?.executives.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      {!hide.includes("status") && (
        <select aria-label="Status" className={sel} value={value.status ?? ""} onChange={(x) => set("status", x.target.value)}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      )}
      {Object.values(value).some(Boolean) && (
        <button className="btn-ghost btn-sm" onClick={() => onChange({})}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      )}
    </div>
  );
}
