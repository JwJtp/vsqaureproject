"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Inbox, CalendarClock, Bot, Sparkles, BadgeCheck, UserX, UserCheck, BellRing, CalendarDays, Trophy, XCircle, Timer, AlertTriangle, Activity, PlugZap,
} from "lucide-react";
import { Card, Kpi, PageHeader, useApi, Badge, Empty, Skeleton, timeAgo, fmtDate, SOURCE_LABEL, PriorityBadge, cx } from "@/components/ui";
import { TrendChart, Donut, HBar, Funnel } from "@/components/charts";
import { FilterBar, toQuery, type FilterState } from "@/components/filters";

type Dash = {
  mode: string;
  kpis: Record<string, number | null>;
  trend: { date: string; enquiries: number; qualified: number; converted: number }[];
  sources: { name: string; value: number }[];
  propertyTypes: { name: string; value: number }[];
  projects: { name: string; value: number }[];
  executives: { id: string; name: string; available: boolean; assigned: number; open: number; contacted: number; visits: number; converted: number; avgResponseMin: number | null; todayAssigned: number; capacity: number }[];
  funnel: { stage: string; value: number }[];
  activity: { id: string; type: string; description: string; actor: string; created_at: string; lead_id: string | null; leadName: string | null }[];
  recentConversations: { id: string; leadId: string; name: string; channel: string; handler: string; processing: boolean; escalated: boolean; priority: string; lastMessageAt: string; propertyType: string | null }[];
  upcomingVisits: { id: string; lead_id: string; scheduled_at: string; leadName: string; projectName: string; executiveName: string; status: string }[];
  overdue: { id: string; lead_id: string; title: string; due_at: string; leadName: string; executiveName: string }[];
  integrations: { id: string; name: string; mode: string; lastError: string | null; lastSuccessAt: string | null; lastWebhookAt: string | null }[];
  queue: { queued: number; running: number; aiSlotsInUse: number; aiSlotsMax: number };
};

const ACT_TONE: Record<string, string> = { escalated: "bg-red-500", qualified: "bg-violet-500", assigned: "bg-amber-500", visit_booked: "bg-sky-500", lead_created: "bg-emerald-500", knowledge_gap: "bg-orange-500" };

export default function Dashboard() {
  const router = useRouter();
  const [f, setF] = useState<FilterState>({});
  const { data, isLoading } = useApi<Dash>(`/api/dashboard${toQuery(f)}`, { refreshInterval: 10_000 });
  const k = data?.kpis ?? {};
  const demo = data?.mode === "demo";
  const go = (href: string) => () => router.push(href);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Sales Command Center"
        subtitle={<>Live view of enquiries, AI conversations and your sales team. {demo && <Badge tone="gold" className="ml-1">Figures are DEMO data</Badge>}</>}
        actions={<Link href="/agent" className="btn-gold"><Sparkles className="h-4 w-4" /> Try the AI agent</Link>}
      />
      <FilterBar value={f} onChange={setF} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi loading={isLoading} label="Total enquiries" value={k.totalEnquiries} icon={<Inbox className="h-4 w-4" />} onClick={go("/leads")} />
        <Kpi loading={isLoading} label="Today" value={k.todayEnquiries} icon={<CalendarClock className="h-4 w-4" />} tone="gold" />
        <Kpi loading={isLoading} label="Active AI chats" value={k.activeConversations} hint={data ? `${data.queue.aiSlotsInUse}/${data.queue.aiSlotsMax} AI slots busy` : undefined} icon={<Bot className="h-4 w-4" />} tone="blue" onClick={go("/conversations")} />
        <Kpi loading={isLoading} label="AI-handled" value={k.aiHandled} icon={<Sparkles className="h-4 w-4" />} />
        <Kpi loading={isLoading} label="Qualified leads" value={k.qualifiedLeads} icon={<BadgeCheck className="h-4 w-4" />} tone="gold" />
        <Kpi loading={isLoading} label="Unassigned" value={k.unassignedLeads} icon={<UserX className="h-4 w-4" />} tone={(k.unassignedLeads ?? 0) > 0 ? "red" : "green"} onClick={go("/leads?unassigned=1")} />
        <Kpi loading={isLoading} label="Assigned" value={k.assignedLeads} icon={<UserCheck className="h-4 w-4" />} />
        <Kpi loading={isLoading} label="Follow-ups pending" value={k.followUpsPending} icon={<BellRing className="h-4 w-4" />} tone="gold" onClick={go("/followups")} />
        <Kpi loading={isLoading} label="Site visits booked" value={k.siteVisitsBooked} icon={<CalendarDays className="h-4 w-4" />} tone="blue" onClick={go("/site-visits")} />
        <Kpi loading={isLoading} label="Conversions" value={k.conversions} icon={<Trophy className="h-4 w-4" />} tone="green" />
        <Kpi loading={isLoading} label="Lost leads" value={k.lostLeads} icon={<XCircle className="h-4 w-4" />} tone="red" />
        <Kpi loading={isLoading} label="Avg first response" value={k.avgFirstResponseSec === null || k.avgFirstResponseSec === undefined ? "—" : k.avgFirstResponseSec < 60 ? `${k.avgFirstResponseSec}s` : `${Math.round(k.avgFirstResponseSec / 60)}m`} icon={<Timer className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Enquiry trend" subtitle="Daily enquiries, qualified leads and conversions">
          {isLoading ? <Skeleton className="h-[260px]" /> : <TrendChart data={data!.trend} keys={[{ key: "enquiries", label: "Enquiries", color: "#3b5bdb" }, { key: "qualified", label: "Qualified", color: "#b8913f" }, { key: "converted", label: "Converted", color: "#2f9e44" }]} />}
        </Card>
        <Card title="Lead sources">
          {isLoading ? <Skeleton className="h-[200px]" /> : data!.sources.length ? <Donut data={data!.sources} labels={SOURCE_LABEL} /> : <Empty title="No enquiries yet" />}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Property type">{isLoading ? <Skeleton className="h-[200px]" /> : <Donut data={data!.propertyTypes} />}</Card>
        <Card title="Project-wise enquiries">{isLoading ? <Skeleton className="h-[220px]" /> : <HBar data={data!.projects} height={220} />}</Card>
        <Card title="Conversion funnel">{isLoading ? <Skeleton className="h-[220px]" /> : <Funnel data={data!.funnel} />}</Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Executive performance" action={<Link href="/executives" className="btn-ghost btn-sm">Manage</Link>}>
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Executive</th><th>Today</th><th>Open</th><th>Contacted</th><th>Visits</th><th>Won</th><th>Avg response</th></tr></thead>
              <tbody>
                {data?.executives.map((e) => (
                  <tr key={e.id}>
                    <td><div className="flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full", e.available ? "bg-emerald-500" : "bg-slate-400")} />{e.name}</div></td>
                    <td className="tabular-nums">
                      <div className="flex items-center gap-2">{e.todayAssigned}/{e.capacity}
                        <div className="h-1.5 w-14 overflow-hidden rounded-full panel-2"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, (e.todayAssigned / Math.max(1, e.capacity)) * 100)}%` }} /></div>
                      </div>
                    </td>
                    <td className="tabular-nums">{e.open}</td>
                    <td className="tabular-nums">{e.contacted}</td>
                    <td className="tabular-nums">{e.visits}</td>
                    <td className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{e.converted}</td>
                    <td className="tabular-nums">{e.avgResponseMin === null ? "—" : `${e.avgResponseMin}m`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isLoading && <div className="p-5"><Skeleton className="h-32" /></div>}
          </div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Activity className="gold h-4 w-4" /> Live AI activity</span>} subtitle="Auto-refreshes every 10 seconds">
          <ol className="scroll-thin -mr-2 max-h-[320px] space-y-3 overflow-y-auto pr-2">
            {data?.activity.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ACT_TONE[a.type] ?? "bg-slate-400")} />
                <div className="min-w-0">
                  <p className="leading-snug">{a.lead_id ? <Link className="font-medium hover:underline" href={`/leads/${a.lead_id}`}>{a.leadName ?? "Customer"}</Link> : null} <span className="muted">{a.description}</span></p>
                  <p className="muted text-[11px]">{timeAgo(a.created_at)} · {a.actor}</p>
                </div>
              </li>
            ))}
            {data && !data.activity.length && <Empty title="No activity yet" />}
          </ol>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="xl:col-span-2" title="Recent conversations" action={<Link href="/conversations" className="btn-ghost btn-sm">Open inbox</Link>}>
          <ul className="-my-2 divide-y hairline">
            {data?.recentConversations.map((c) => (
              <li key={c.id}>
                <Link href={`/conversations?id=${c.id}`} className="flex items-center gap-3 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full panel-2 text-xs font-bold">{c.name.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="muted text-xs">{SOURCE_LABEL[c.channel]} · {c.propertyType ?? "requirement pending"} · {timeAgo(c.lastMessageAt)}</div>
                  </div>
                  {c.processing && <Badge tone="blue" dot>AI typing</Badge>}
                  {c.escalated && <Badge tone="red">Escalated</Badge>}
                  <Badge tone={c.handler === "ai" ? "navy" : "gold"}>{c.handler === "ai" ? "AI" : "Human"}</Badge>
                  <PriorityBadge priority={c.priority} />
                </Link>
              </li>
            ))}
          </ul>
          {data && !data.recentConversations.length && <Empty title="No conversations yet" hint="Open the AI Sales Agent to start a test chat." />}
        </Card>
        <Card title="Upcoming site visits" action={<Link href="/site-visits" className="btn-ghost btn-sm">All</Link>}>
          <ul className="space-y-3">
            {data?.upcomingVisits.map((v) => (
              <li key={v.id} className="flex gap-3">
                <div className="w-12 shrink-0 rounded-xl border py-1 text-center hairline">
                  <div className="gold text-[10px] font-bold uppercase">{fmtDate(v.scheduled_at, { month: "short" })}</div>
                  <div className="text-lg font-semibold leading-none">{fmtDate(v.scheduled_at, { day: "numeric" })}</div>
                </div>
                <div className="min-w-0 text-sm">
                  <Link href={`/leads/${v.lead_id}`} className="font-medium hover:underline">{v.leadName}</Link>
                  <div className="muted truncate text-xs">{fmtDate(v.scheduled_at, { timeStyle: "short" })} · {v.projectName}</div>
                  <div className="muted text-xs">with {v.executiveName}</div>
                </div>
              </li>
            ))}
          </ul>
          {data && !data.upcomingVisits.length && <Empty title="No visits scheduled" />}
        </Card>
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Overdue follow-ups</span>}>
          <ul className="space-y-2.5">
            {data?.overdue.map((t) => (
              <li key={t.id} className="rounded-xl border border-red-200 bg-red-50/60 p-2.5 text-sm dark:border-red-900/50 dark:bg-red-950/20">
                <Link href={`/leads/${t.lead_id}`} className="font-medium hover:underline">{t.title}</Link>
                <div className="muted text-xs">Due {timeAgo(t.due_at)} · {t.executiveName}</div>
              </li>
            ))}
          </ul>
          {data && !data.overdue.length && <Empty title="All caught up" hint="No overdue follow-ups." />}
        </Card>
      </div>

      <Card className="mt-6" title={<span className="flex items-center gap-2"><PlugZap className="gold h-4 w-4" /> Integration health</span>} action={<Link href="/integrations" className="btn-ghost btn-sm">Configure</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {data?.integrations.map((i) => (
            <div key={i.id} className="rounded-xl border p-3 hairline">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{i.name}</span>
                <Badge tone={i.lastError ? "red" : i.mode === "live" ? "green" : i.mode === "demo" ? "gold" : "gray"}>{i.lastError ? "error" : i.mode.replace("_", " ")}</Badge>
              </div>
              <div className="muted mt-1 text-[11px]">{i.lastWebhookAt ? `Last webhook ${timeAgo(i.lastWebhookAt)}` : i.lastSuccessAt ? `OK ${timeAgo(i.lastSuccessAt)}` : "No activity yet"}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
