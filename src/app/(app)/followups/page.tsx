"use client";
import { useState } from "react";
import Link from "next/link";
import { Play, Save, AlertTriangle } from "lucide-react";
import { PageHeader, Card, useApi, api, useAction, Badge, Toggle, Empty, Skeleton, fmtDate, timeAgo, Tabs, Field } from "@/components/ui";
import type { FollowUpRule } from "@/lib/types";

type T = { id: string; lead_id: string; title: string; due_at: string; status: string; rule_key: string; result: string | null; leadName: string | null; executiveName: string | null; overdue: boolean };
type H = { id: string; description: string; created_at: string; lead_id: string | null };

function RuleRow({ r, onSaved }: { r: FollowUpRule; onSaved: () => void }) {
  const [v, setV] = useState(r);
  const { run, busy } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(r);
  const save = (patch?: Partial<FollowUpRule>) => run(async () => {
    const body = { ...v, ...patch };
    await api(`/api/followups/rules/${r.id}`, { method: "PATCH", json: { delay_minutes: body.delay_minutes, escalate_after_minutes: body.escalate_after_minutes, template: body.template, respect_working_hours: body.respect_working_hours, active: body.active } });
    onSaved();
  }, "Rule saved");
  return (
    <div className="rounded-2xl border p-4 hairline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-semibold">{r.name}</div><div className="muted text-xs">{r.description}</div></div>
        <div className="flex items-center gap-2"><Badge tone="navy">{r.channel.replace("_", " → ")}</Badge><Toggle checked={v.active} onChange={(a) => { setV({ ...v, active: a }); save({ active: a }); }} label="Active" /></div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Delay (minutes)"><input type="number" min={0} className="input" value={v.delay_minutes} onChange={(e) => setV({ ...v, delay_minutes: +e.target.value })} /></Field>
        <Field label="Escalate after (min)" hint="Blank = never"><input type="number" min={1} className="input" value={v.escalate_after_minutes ?? ""} onChange={(e) => setV({ ...v, escalate_after_minutes: e.target.value ? +e.target.value : null })} /></Field>
        <div className="flex items-end pb-2"><Toggle checked={v.respect_working_hours} onChange={(a) => setV({ ...v, respect_working_hours: a })} label="Working hours only" /></div>
        <Field label="Message template" hint="Variables: {{name}} {{phone}} {{property_type}} {{location}} {{budget}} {{visit_time}} {{delay}}" className="sm:col-span-3"><textarea className="input" rows={2} value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })} /></Field>
      </div>
      {dirty && <div className="mt-2 flex justify-end"><button className="btn-primary btn-sm" disabled={busy} onClick={() => save()}><Save className="h-3.5 w-3.5" /> Save</button></div>}
    </div>
  );
}

export default function FollowUps() {
  const [tab, setTab] = useState<"tasks" | "rules" | "history">("tasks");
  const [status, setStatus] = useState("pending");
  const { data, mutate } = useApi<{ tasks: T[]; rules: FollowUpRule[]; history: H[] }>(`/api/followups${status ? `?status=${status}` : ""}`, { refreshInterval: 15000 });
  const { run, busy } = useAction();
  const overdue = data?.tasks.filter((t) => t.overdue).length ?? 0;
  return (
    <>
      <PageHeader eyebrow="Automation" title="Follow-up Automation" subtitle="Rules run on the server-side scheduler (/api/jobs/run via cron) — not browser timers. Opt-outs and working hours are always respected."
        actions={<button className="btn-primary" disabled={busy} onClick={() => run(async () => { const r = await api<{ due: number; processed: number }>("/api/followups/run", { method: "POST" }); mutate(); return r; }, "Scheduler run complete")}><Play className="h-4 w-4" /> Run due follow-ups now</button>} />
      {overdue > 0 && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"><AlertTriangle className="h-4 w-4" /> {overdue} follow-up{overdue > 1 ? "s are" : " is"} overdue.</div>}
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: "tasks", label: "Tasks" }, { value: "rules", label: "Workflow rules" }, { value: "history", label: "Audit history" }]} /></div>
      {!data ? <Skeleton className="h-80" /> : tab === "tasks" ? (
        <Card title="Follow-up tasks" action={<select className="input !w-auto !py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status"><option value="pending">Pending</option><option value="sent">Sent</option><option value="escalated">Escalated</option><option value="done">Done</option><option value="skipped">Skipped</option><option value="">All</option></select>}>
          {!data.tasks.length ? <Empty title="No tasks" /> : (
            <div className="-mx-5 -my-5 overflow-x-auto"><table className="table">
              <thead><tr><th>Task</th><th>Customer</th><th>Executive</th><th>Due</th><th>Status</th><th /></tr></thead>
              <tbody>{data.tasks.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.title}<div className="muted text-xs">{t.rule_key}{t.result && ` · ${t.result}`}</div></td>
                  <td><Link href={`/leads/${t.lead_id}`} className="hover:underline">{t.leadName ?? "—"}</Link></td>
                  <td>{t.executiveName ?? "—"}</td>
                  <td className={t.overdue ? "font-semibold text-red-600" : ""}>{fmtDate(t.due_at)}<div className="muted text-xs">{timeAgo(t.due_at)}</div></td>
                  <td><Badge tone={t.overdue ? "red" : t.status === "pending" ? "gold" : "green"}>{t.overdue ? "overdue" : t.status}</Badge></td>
                  <td className="text-right whitespace-nowrap">{t.status === "pending" && <>
                    <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/followups/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }); mutate(); }, "Done")}>Done</button>{" "}
                    <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/followups/tasks/${t.id}`, { method: "PATCH", json: { status: "cancelled" } }); mutate(); }, "Cancelled")}>Cancel</button></>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : tab === "rules" ? (
        <div className="space-y-3">{data.rules.map((r) => <RuleRow key={r.id + r.updated_at} r={r} onSaved={() => mutate()} />)}</div>
      ) : (
        <Card title="Recent automation activity">
          <ul className="space-y-2 text-sm">{data.history.map((h) => <li key={h.id} className="border-b pb-2 hairline">{h.description}<div className="muted text-xs">{fmtDate(h.created_at)}</div></li>)}</ul>
          {!data.history.length && <Empty title="No automation activity yet" />}
        </Card>
      )}
    </>
  );
}
