"use client";
import { useState } from "react";
import { PageHeader, Card, useApi, Badge, Tabs, Empty, Skeleton, fmtDate } from "@/components/ui";

type Row = Record<string, unknown> & { id: string; created_at: string };
const TYPES = [{ value: "system", label: "System" }, { value: "audit", label: "Audit" }, { value: "usage", label: "AI usage" }, { value: "jobs", label: "Jobs / queue" }, { value: "notifications", label: "Notifications" }] as const;

export default function Logs() {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("system");
  const [level, setLevel] = useState("");
  const { data } = useApi<{ rows: Row[] }>(`/api/logs?type=${type}${level && type === "system" ? `&level=${level}` : ""}`, { refreshInterval: 10000 });
  const s = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <>
      <PageHeader eyebrow="Operations" title="System Logs" subtitle="Errors, audit trail, AI token usage and cost, background jobs, and every outbound notification with its real delivery status." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={type} onChange={setType} tabs={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
        {type === "system" && <select className="input !w-auto !py-1.5 text-xs" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option value="">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Info</option></select>}
      </div>
      <Card>
        {!data ? <div className="p-5"><Skeleton className="h-64" /></div> : !data.rows.length ? <Empty title="Nothing logged yet" /> : (
          <div className="overflow-x-auto">
            <table className="table text-xs">
              <thead><tr><th>Time</th>
                {type === "system" && <><th>Level</th><th>Source</th><th>Message</th><th>Meta</th></>}
                {type === "audit" && <><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></>}
                {type === "usage" && <><th>Provider</th><th>Model</th><th>Tokens (in/out)</th><th>Cost (est.)</th><th>Latency</th><th>Status</th></>}
                {type === "jobs" && <><th>Type</th><th>Key</th><th>Status</th><th>Attempts</th><th>Error</th></>}
                {type === "notifications" && <><th>To</th><th>Channel</th><th>Template</th><th>Status</th><th>Message</th></>}
              </tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.created_at, { dateStyle: "short", timeStyle: "medium" })}</td>
                  {type === "system" && <><td><Badge tone={r.level === "error" ? "red" : r.level === "warn" ? "gold" : "gray"}>{s(r.level)}</Badge></td><td>{s(r.source)}</td><td className="max-w-md">{s(r.message)}</td><td className="muted max-w-xs truncate font-mono">{s(r.meta)}</td></>}
                  {type === "audit" && <><td>{s(r.actor)}</td><td className="font-medium">{s(r.action)}</td><td>{s(r.entity)} <span className="muted font-mono">{s(r.entity_id).slice(0, 8)}</span></td><td className="muted max-w-xs truncate font-mono">{s(r.meta)}</td></>}
                  {type === "usage" && <><td>{s(r.provider)}</td><td>{s(r.model)}</td><td className="tabular-nums">{s(r.prompt_tokens)} / {s(r.completion_tokens)}</td><td className="tabular-nums">${Number(r.cost_usd).toFixed(5)}</td><td className="tabular-nums">{s(r.latency_ms)}ms</td><td>{r.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red" className="max-w-[200px] truncate">{s(r.error)}</Badge>}</td></>}
                  {type === "jobs" && <><td>{s(r.type)}</td><td className="font-mono">{s(r.key).slice(0, 12)}</td><td><Badge tone={r.status === "done" ? "green" : r.status === "dead" ? "red" : "gold"}>{s(r.status)}</Badge></td><td>{s(r.attempts)}/{s(r.max_attempts)}</td><td className="max-w-xs truncate">{s(r.last_error)}</td></>}
                  {type === "notifications" && <><td>{s(r.recipient_type)} · <span className="font-mono">{s(r.recipient)}</span></td><td>{s(r.channel)}</td><td>{s(r.template)}</td><td><Badge tone={r.status === "failed" ? "red" : r.status === "simulated" ? "gold" : ["delivered", "read"].includes(r.status as string) ? "green" : "blue"}>{r.status === "simulated" ? "simulated (not sent)" : s(r.status)}</Badge>{r.error ? <div className="text-red-500">{s(r.error)}</div> : null}</td><td className="max-w-sm truncate">{s(r.body)}</td></>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
