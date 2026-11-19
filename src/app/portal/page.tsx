"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ListChecks, Trophy, Users, CalendarDays, ArrowLeft, Phone, MessageCircle, Search } from "lucide-react";
import { PageHeader, Card, Kpi, useApi, Badge, PriorityBadge, StatusBadge, Empty, Skeleton, timeAgo, fmtDate, phoneFmt, SOURCE_LABEL, Tabs, api, useAction } from "@/components/ui";
import { LeadProfile } from "@/components/lead-profile";
import type { Lead } from "@/lib/types";

type T = { id: string; lead_id: string; title: string; due_at: string; status: string; leadName: string | null; leadPhone: string | null; overdue: boolean };
type V = { id: string; lead_id: string; scheduled_at: string; status: string; leadName: string | null; projectName: string | null };

function Portal() {
  const router = useRouter();
  const sp = useSearchParams();
  const leadId = sp.get("lead");
  const [tab, setTab] = useState<"new" | "all" | "won">("new");
  const [q, setQ] = useState("");
  const { data: me } = useApi<{ user: { name: string; executiveId: string | null; role: string } }>("/api/me");
  const { data: leads } = useApi<{ leads: Lead[] }>(`/api/leads?pageSize=500${q ? `&q=${encodeURIComponent(q)}` : ""}`, { refreshInterval: 10000 });
  const { data: tasks, mutate: refreshTasks } = useApi<{ tasks: T[] }>("/api/followups?status=pending", { refreshInterval: 15000 });
  const { data: visits } = useApi<{ visits: V[] }>(`/api/site-visits?from=${new Date(Date.now() - 3600000).toISOString()}`);
  const { run } = useAction();

  if (leadId) return (<><button className="btn-ghost btn-sm mb-4" onClick={() => router.push("/portal")}><ArrowLeft className="h-3.5 w-3.5" /> My leads</button><LeadProfile id={leadId} admin={false} /></>);

  const all = leads?.leads ?? [];
  const fresh = all.filter((l) => l.status === "ASSIGNED");
  const won = all.filter((l) => l.status === "CONVERTED");
  const open = all.filter((l) => !["CONVERTED", "LOST"].includes(l.status));
  const shown = tab === "new" ? fresh : tab === "won" ? won : all;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const todayTasks = (tasks?.tasks ?? []).filter((t) => t.overdue || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(t.due_at)) <= today);
  const isAdmin = me?.user.role !== "executive";

  return (
    <>
      <PageHeader eyebrow="Executive portal" title={`Namaskara, ${me?.user.name?.split(" ")[0] ?? ""}`} subtitle={isAdmin ? "You are viewing the portal as an admin. Executives see only leads assigned to them." : "Your assigned enquiries, today's tasks and upcoming site visits."} />
      {fresh.length > 0 && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[var(--gold)] p-3 text-sm" style={{ background: "var(--gold-soft)" }}><Bell className="gold h-4 w-4 animate-pulseDot" /> You have <b>{fresh.length}</b> new lead{fresh.length > 1 ? "s" : ""} waiting for your first call.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="New leads" value={fresh.length} icon={<Bell className="h-4 w-4" />} tone="gold" />
        <Kpi label="Open pipeline" value={open.length} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Tasks today" value={todayTasks.length} icon={<ListChecks className="h-4 w-4" />} tone={todayTasks.some((t) => t.overdue) ? "red" : "blue"} />
        <Kpi label="Converted" value={won.length} hint={all.length ? `${Math.round((won.length / all.length) * 100)}% conversion` : undefined} icon={<Trophy className="h-4 w-4" />} tone="green" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="My enquiries" action={<div className="flex items-center gap-2"><div className="relative hidden sm:block"><Search className="muted absolute left-2.5 top-2 h-3.5 w-3.5" /><input className="input !py-1.5 pl-8 text-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div><Tabs value={tab} onChange={setTab} tabs={[{ value: "new", label: `New (${fresh.length})` }, { value: "all", label: "All" }, { value: "won", label: "Won" }]} /></div>}>
          {!leads ? <Skeleton className="h-64" /> : !shown.length ? <Empty title={tab === "new" ? "No new leads" : "Nothing here"} hint="New assignments arrive here and on WhatsApp." /> : (
            <ul className="-my-2 divide-y hairline">
              {shown.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => router.push(`/portal?lead=${l.id}`)}>
                    <div className="flex items-center gap-2"><span className="font-semibold">{l.name ?? "Unnamed"}</span><PriorityBadge priority={l.priority} /><StatusBadge status={l.status} /></div>
                    <div className="muted text-xs">{l.property_type ?? "—"} · {l.preferred_location ?? "—"} · {l.budget_text ?? "—"} · {SOURCE_LABEL[l.source]} · {timeAgo(l.created_at)}</div>
                  </button>
                  <div className="flex gap-1.5">
                    {l.phone && <a className="btn-primary btn-sm" href={`tel:+${l.phone}`} onClick={() => l.status === "ASSIGNED" && api(`/api/leads/${l.id}`, { method: "PATCH", json: { status: "CONTACTED" } })}><Phone className="h-3.5 w-3.5" /> {phoneFmt(l.phone)}</a>}
                    {l.phone && !l.opted_out && <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${l.phone}`}><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /></a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Today&apos;s tasks</span>}>
            <ul className="space-y-2">
              {todayTasks.map((t) => (
                <li key={t.id} className={`rounded-xl border p-2.5 text-sm hairline ${t.overdue ? "border-red-300 dark:border-red-900" : ""}`}>
                  <button className="text-left font-medium hover:underline" onClick={() => router.push(`/portal?lead=${t.lead_id}`)}>{t.title}</button>
                  <div className="mt-1 flex items-center justify-between"><span className={`text-xs ${t.overdue ? "text-red-600" : "muted"}`}>{t.overdue ? "Overdue · " : ""}{fmtDate(t.due_at, { timeStyle: "short", dateStyle: "short" })}</span>
                    <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/followups/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }); refreshTasks(); }, "Task done")}>Done</button></div>
                </li>
              ))}
              {tasks && !todayTasks.length && <p className="muted text-sm">No tasks due today. 🎉</p>}
            </ul>
          </Card>
          <Card title={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Upcoming site visits</span>}>
            <ul className="space-y-2 text-sm">
              {visits?.visits.filter((v) => ["requested", "confirmed"].includes(v.status)).slice(0, 6).map((v) => (
                <li key={v.id}><button className="font-medium hover:underline" onClick={() => router.push(`/portal?lead=${v.lead_id}`)}>{v.leadName}</button> <Badge tone="blue">{v.status}</Badge><div className="muted text-xs">{fmtDate(v.scheduled_at)} · {v.projectName ?? "—"}</div></li>
              ))}
              {visits && !visits.visits.some((v) => ["requested", "confirmed"].includes(v.status)) && <p className="muted">No upcoming visits.</p>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><Portal /></Suspense>;
}
