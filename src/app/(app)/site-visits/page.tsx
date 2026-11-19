"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, useApi, api, useAction, Badge, Empty, Skeleton, fmtDate, phoneFmt, Tabs, cx } from "@/components/ui";
import { VisitModal } from "@/components/lead-actions";

type V = { id: string; lead_id: string; project_id: string | null; scheduled_at: string; status: string; notes: string | null; leadName: string | null; leadPhone: string | null; executiveName: string | null; projectName: string | null; is_demo: boolean };
const TONE: Record<string, "blue" | "green" | "red" | "gold" | "gray"> = { requested: "gold", confirmed: "blue", completed: "green", cancelled: "red", no_show: "gray" };
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default function SiteVisits() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"week" | "list">("week");
  const start = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7); return d; }, [weekOffset]);
  const end = new Date(start.getTime() + 7 * 86400000);
  const { data, mutate } = useApi<{ visits: V[] }>(view === "week" ? `/api/site-visits?from=${start.toISOString()}&to=${end.toISOString()}` : "/api/site-visits");
  const [resched, setResched] = useState<V | null>(null);
  const { run } = useAction();
  const status = (id: string, s: string) => run(async () => { await api(`/api/site-visits/${id}`, { method: "PATCH", json: { status: s } }); mutate(); }, `Visit ${s}`);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));

  const VisitCard = ({ v }: { v: V }) => (
    <div className="rounded-xl border p-2.5 text-xs hairline" style={{ background: "var(--panel)" }}>
      <div className="flex items-center justify-between gap-1"><b>{fmtDate(v.scheduled_at, { timeStyle: "short" })}</b><Badge tone={TONE[v.status]}>{v.status}</Badge></div>
      <Link href={`/leads/${v.lead_id}`} className="mt-1 block truncate font-medium hover:underline">{v.leadName ?? "Customer"}</Link>
      <div className="muted truncate">{v.projectName ?? "—"} · {v.executiveName ?? "Unassigned"}</div>
      {["requested", "confirmed"].includes(v.status) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {v.status === "requested" && <button className="btn-ghost btn-sm !px-1.5 !py-0.5" onClick={() => status(v.id, "confirmed")}>Confirm</button>}
          <button className="btn-ghost btn-sm !px-1.5 !py-0.5" onClick={() => status(v.id, "completed")}>Done</button>
          <button className="btn-ghost btn-sm !px-1.5 !py-0.5" onClick={() => setResched(v)}>Move</button>
          <button className="btn-ghost btn-sm !px-1.5 !py-0.5" onClick={() => status(v.id, "no_show")}>No-show</button>
          <button className="btn-danger btn-sm !px-1.5 !py-0.5" onClick={() => status(v.id, "cancelled")}>Cancel</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Calendar" title="Site Visits" subtitle="Slots, capacity and executive availability are checked on every booking — no double booking. Reminders are sent automatically." actions={<Tabs value={view} onChange={setView} tabs={[{ value: "week", label: "Week" }, { value: "list", label: "All upcoming" }]} />} />
      {view === "week" && (
        <div className="mb-4 flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>This week</button>
          <button className="btn-ghost btn-sm" onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
          <span className="ml-2 text-sm font-medium">{fmtDate(start.toISOString(), { dateStyle: "medium" })} – {fmtDate(new Date(end.getTime() - 1).toISOString(), { dateStyle: "medium" })}</span>
        </div>
      )}
      {!data ? <Skeleton className="h-96" /> : view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const k = dayKey(d.toISOString());
            const items = data.visits.filter((v) => dayKey(v.scheduled_at) === k);
            const today = k === dayKey(new Date().toISOString());
            return (
              <div key={k} className={cx("min-h-[180px] rounded-2xl border p-2 hairline", today && "ring-2 ring-[var(--gold)]")} style={{ background: "var(--panel-2)" }}>
                <div className="mb-2 px-1 text-xs font-semibold"><span className="gold uppercase">{fmtDate(d.toISOString(), { weekday: "short" })}</span> {fmtDate(d.toISOString(), { day: "numeric", month: "short" })}</div>
                <div className="space-y-2">{items.map((v) => <VisitCard key={v.id} v={v} />)}</div>
              </div>
            );
          })}
        </div>
      ) : !data.visits.length ? <div className="card"><Empty icon={<CalendarDays className="gold h-5 w-5" />} title="No site visits" hint="Visits are booked by the AI from chats or by executives from a lead profile." /></div> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>When</th><th>Customer</th><th>Project</th><th>Executive</th><th>Status</th><th /></tr></thead>
            <tbody>{data.visits.map((v) => (
              <tr key={v.id}>
                <td className="whitespace-nowrap font-medium">{fmtDate(v.scheduled_at)}</td>
                <td><Link href={`/leads/${v.lead_id}`} className="hover:underline">{v.leadName ?? "—"}</Link><div className="muted text-xs">{phoneFmt(v.leadPhone)}</div></td>
                <td>{v.projectName ?? "—"}</td><td>{v.executiveName ?? "—"}</td>
                <td><Badge tone={TONE[v.status]}>{v.status}</Badge></td>
                <td className="text-right">{["requested", "confirmed"].includes(v.status) && <button className="btn-ghost btn-sm" onClick={() => setResched(v)}>Reschedule</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {resched && <VisitModal open onClose={() => setResched(null)} leadId={resched.lead_id} projectId={resched.project_id} rescheduleId={resched.id} onDone={() => mutate()} />}
    </>
  );
}
