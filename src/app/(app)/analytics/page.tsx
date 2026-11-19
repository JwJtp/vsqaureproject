"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader, Card, useApi, Kpi, Skeleton, Tabs, inr, SOURCE_LABEL } from "@/components/ui";
import { VBar, HBar } from "@/components/charts";
import { FilterBar, toQuery, type FilterState } from "@/components/filters";

type A = {
  daily: { period: string; enquiries: number }[]; weekly: { period: string; enquiries: number }[]; monthly: { period: string; enquiries: number }[];
  aiHandlingPct: number; avgAiResponseMs: number | null; aiErrors: number; tokens: number; costUsd: number; qualificationRate: number;
  executiveResponse: { name: string; avgMinutes: number | null; contacted: number }[];
  projectConversion: { name: string; leads: number; converted: number; rate: number }[];
  sourceConversion: { name: string; leads: number; converted: number; rate: number }[];
  siteVisitConversion: { visited: number; convertedAfterVisit: number };
  followUpCompletion: { total: number; completed: number; pct: number };
  revenue: { deals: number; total: number };
};

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Analytics() {
  const [f, setF] = useState<FilterState>({});
  const [g, setG] = useState<"daily" | "weekly" | "monthly">("daily");
  const { data: d } = useApi<A>(`/api/analytics${toQuery(f)}`);
  const Csv = ({ name, rows }: { name: string; rows: Record<string, unknown>[] }) => <button className="btn-ghost btn-sm" onClick={() => downloadCsv(name, rows)}><Download className="h-3.5 w-3.5" /> CSV</button>;
  return (
    <>
      <PageHeader eyebrow="Reports" title="Analytics & Reports" subtitle="All figures are computed from database records for the selected period." actions={<a className="btn-ghost" href={`/api/leads/export${toQuery(f)}`}><Download className="h-4 w-4" /> Export leads CSV</a>} />
      <FilterBar value={f} onChange={setF} />
      {!d ? <Skeleton className="h-[60vh]" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="AI handling" value={`${d.aiHandlingPct}%`} />
            <Kpi label="Avg AI response" value={d.avgAiResponseMs ? `${(d.avgAiResponseMs / 1000).toFixed(1)}s` : "—"} hint={`${d.aiErrors} AI errors`} />
            <Kpi label="Qualification rate" value={`${d.qualificationRate}%`} tone="gold" />
            <Kpi label="Visit → conversion" value={d.siteVisitConversion.visited ? `${Math.round((d.siteVisitConversion.convertedAfterVisit / d.siteVisitConversion.visited) * 100)}%` : "—"} hint={`${d.siteVisitConversion.convertedAfterVisit}/${d.siteVisitConversion.visited} visited`} tone="blue" />
            <Kpi label="Follow-up completion" value={`${d.followUpCompletion.pct}%`} hint={`${d.followUpCompletion.completed}/${d.followUpCompletion.total}`} />
            <Kpi label="Recorded deal value" value={d.revenue.total ? inr(d.revenue.total) : "—"} hint={`${d.revenue.deals} deals entered by authorised users`} tone="green" />
            <Kpi label="AI tokens / cost" value={d.tokens.toLocaleString("en-IN")} hint={`≈ $${d.costUsd} estimated`} />
          </div>
          <Card className="mt-6" title="Enquiries over time" action={<div className="flex items-center gap-2"><Tabs value={g} onChange={setG} tabs={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} /><Csv name={`enquiries-${g}`} rows={d[g]} /></div>}>
            <VBar data={d[g]} xKey="period" bars={[{ key: "enquiries", label: "Enquiries", color: "#b8913f" }]} />
          </Card>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Source-wise conversion" action={<Csv name="source-conversion" rows={d.sourceConversion} />}>
              <VBar data={d.sourceConversion.map((r) => ({ ...r, name: SOURCE_LABEL[r.name] ?? r.name }))} bars={[{ key: "leads", label: "Leads", color: "#3b5bdb" }, { key: "converted", label: "Converted", color: "#2f9e44" }]} />
            </Card>
            <Card title="Project-wise conversion" action={<Csv name="project-conversion" rows={d.projectConversion} />}>
              <div className="-mx-5 -my-5 overflow-x-auto"><table className="table"><thead><tr><th>Project</th><th>Leads</th><th>Converted</th><th>Rate</th></tr></thead>
                <tbody>{d.projectConversion.map((r) => <tr key={r.name}><td>{r.name}</td><td className="tabular-nums">{r.leads}</td><td className="tabular-nums">{r.converted}</td><td className="tabular-nums font-semibold">{r.rate}%</td></tr>)}</tbody></table></div>
            </Card>
            <Card title="Executive response time (assignment → first contact)" action={<Csv name="executive-response" rows={d.executiveResponse} />}>
              <HBar data={d.executiveResponse.map((e) => ({ name: e.name, value: e.avgMinutes ?? 0 }))} color="#3b5bdb" />
              <p className="muted mt-1 text-xs">Minutes. Executives with no contacted leads show 0.</p>
            </Card>
            <Card title="Lead source table">
              <div className="-mx-5 -my-5 overflow-x-auto"><table className="table"><thead><tr><th>Source</th><th>Leads</th><th>Converted</th><th>Rate</th></tr></thead>
                <tbody>{d.sourceConversion.map((r) => <tr key={r.name}><td>{SOURCE_LABEL[r.name] ?? r.name}</td><td>{r.leads}</td><td>{r.converted}</td><td className="font-semibold">{r.rate}%</td></tr>)}</tbody></table></div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
