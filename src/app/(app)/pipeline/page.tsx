"use client";
import { useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { PageHeader, useApi, api, useAction, PriorityBadge, STATUS_TONE, statusLabel, timeAgo, cx, Badge, Skeleton } from "@/components/ui";
import { FilterBar, toQuery, type FilterState } from "@/components/filters";
import { LEAD_STATUSES, type Lead } from "@/lib/types";

type L = Lead & { executive_name: string | null };
const COLORS: Record<string, string> = { blue: "#3b5bdb", violet: "#a855f7", gold: "#b8913f", gray: "#64748b", green: "#2f9e44", red: "#e03131" };

export default function Pipeline() {
  const [f, setF] = useState<FilterState>({});
  const { data, mutate } = useApi<{ leads: L[] }>(`/api/leads${toQuery({ ...f, status: undefined }, { pageSize: "500" })}`);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run } = useAction();

  const move = (id: string, status: string) => {
    const lead = data?.leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    let extra: Record<string, unknown> = {};
    if (status === "LOST") {
      const reason = prompt("Why was this lead lost?");
      if (!reason) return;
      extra = { lost_reason: reason };
    }
    mutate({ leads: data!.leads.map((l) => (l.id === id ? { ...l, status: status as Lead["status"] } : l)) }, false);
    run(async () => { await api(`/api/leads/${id}`, { method: "PATCH", json: { status, ...extra } }); await mutate(); }, `Moved to ${statusLabel(status)}`);
  };

  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Lead Pipeline" subtitle="Drag cards between stages. Every move is recorded in the lead's activity timeline." />
      <FilterBar value={f} onChange={setF} hide={["status"]} />
      {!data ? <Skeleton className="h-[60vh]" /> : (
        <div className="scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {LEAD_STATUSES.map((s) => {
            const items = data.leads.filter((l) => l.status === s);
            return (
              <div key={s}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { if (drag) move(drag, s); setDrag(null); setOver(null); }}
                className={cx("flex w-[270px] shrink-0 flex-col rounded-2xl border transition hairline", over === s && "ring-4 ring-[var(--ring)]")} style={{ background: "var(--panel-2)" }}>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[STATUS_TONE[s]] }} />{statusLabel(s)}</span>
                  <Badge>{items.length}</Badge>
                </div>
                <div className="scroll-thin flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {items.map((l) => (
                    <div key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)} className={cx("card cursor-grab p-3 text-sm active:cursor-grabbing", drag === l.id && "opacity-50")}>
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="muted mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1"><Link href={`/leads/${l.id}`} className="truncate font-semibold hover:underline">{l.name ?? "Unnamed"}</Link><PriorityBadge priority={l.priority} /></div>
                          <div className="muted truncate text-xs">{l.property_type ?? "—"} · {l.preferred_location ?? "—"} · {l.budget_text ?? "—"}</div>
                          <div className="muted mt-1.5 flex justify-between text-[11px]"><span>{l.executive_name ?? "Unassigned"}</span><span>{timeAgo(l.last_interaction_at)}</span></div>
                        </div>
                      </div>
                      <select aria-label="Move to stage" className="input mt-2 !py-1 text-[11px] md:hidden" value={l.status} onChange={(e) => move(l.id, e.target.value)}>
                        {LEAD_STATUSES.map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
                      </select>
                    </div>
                  ))}
                  {!items.length && <p className="muted py-6 text-center text-xs">Drop leads here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
