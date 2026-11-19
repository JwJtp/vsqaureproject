"use client";
import { useState } from "react";
import Link from "next/link";
import { Activity, Cpu, Gauge, Layers, MessageCircle, Users, Zap, ShieldCheck, Phone } from "lucide-react";
import { ChatWidget, type ChatLead } from "@/components/chat-widget";
import { Card, PageHeader, Badge, useApi, api, useAction, Kpi, PriorityBadge, StatusBadge, inr, cx, Field } from "@/components/ui";

type Status = {
  ai: string;
  queue: { queued: number; running: number; dead: number; aiSlotsInUse: number; aiSlotsMax: number; aiWaiting: number; processed: number; failed: number };
  activeConversations: number;
  processingNow: { id: string; channel: string }[];
  lockedConversations: number;
  last24h: { turns: number; errors: number; avgLatencyMs: number | null; tokens: number; costUsd: number };
};
type ConcResult = { customers: number; totalMs: number; allIsolated: boolean; results: { customer: string; replies: number; name: string | null; status: string; score: number; assigned: boolean }[]; isolation: { customer: string; messages: number; foreignMessages: number; leakedNames: number; ok: boolean }[] };

const FIELDS: [keyof ChatLead, string][] = [
  ["property_type", "Property type"], ["preferred_location", "Location"], ["budget_text", "Budget"], ["configuration", "Size / config"],
  ["purpose", "Purpose"], ["timeline", "Timeline"], ["name", "Name"], ["phone", "Phone"], ["site_visit_preference", "Site visit"],
];

export default function AgentPage() {
  const { data: st, mutate } = useApi<Status>("/api/status", { refreshInterval: 3000 });
  const { data: me } = useApi<{ mode: string }>("/api/me");
  const [lead, setLead] = useState<ChatLead | null>(null);
  const [meta, setMeta] = useState<{ escalated: boolean; provider: string | null; intent: string | null } | null>(null);
  const [n, setN] = useState(6);
  const [conc, setConc] = useState<ConcResult | null>(null);
  const [wa, setWa] = useState({ phone: "919876500001", name: "Test Customer", text: "Hi, plot beku Hosur alli, budget 35 lakh" });
  const [waLog, setWaLog] = useState<{ direction: string; body: string; delivery_status: string }[]>([]);
  const { run, busy } = useAction();
  const demo = me?.mode === "demo";

  return (
    <>
      <PageHeader
        eyebrow="AI Sales Agent"
        title="Autonomous AI Sales Agent"
        subtitle="One central AI service handling every customer in an independent session. Test it as a customer, simulate WhatsApp, or stress-test concurrency."
        actions={<><Badge tone={st?.ai === "live" ? "green" : "gold"}>{st?.ai === "live" ? "OpenAI live" : "Simulator (no OpenAI key)"}</Badge><Link href="/ai-settings" className="btn-ghost btn-sm">Agent settings</Link></>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active conversations" value={st?.activeConversations ?? "—"} icon={<MessageCircle className="h-4 w-4" />} tone="blue" />
        <Kpi label="Processing now" value={st?.processingNow.length ?? "—"} hint={`${st?.lockedConversations ?? 0} conversation locks held`} icon={<Activity className="h-4 w-4" />} />
        <Kpi label="AI slots" value={st ? `${st.queue.aiSlotsInUse}/${st.queue.aiSlotsMax}` : "—"} hint={`${st?.queue.aiWaiting ?? 0} waiting (backpressure)`} icon={<Cpu className="h-4 w-4" />} tone="gold" />
        <Kpi label="Queue" value={st ? st.queue.queued + st.queue.running : "—"} hint={`${st?.queue.dead ?? 0} dead-lettered`} icon={<Layers className="h-4 w-4" />} />
        <Kpi label="Avg AI response" value={st?.last24h.avgLatencyMs ? `${(st.last24h.avgLatencyMs / 1000).toFixed(1)}s` : "—"} hint={`${st?.last24h.turns ?? 0} turns · ${st?.last24h.errors ?? 0} errors (24h)`} icon={<Gauge className="h-4 w-4" />} />
        <Kpi label="Tokens / est. cost" value={st ? st.last24h.tokens.toLocaleString("en-IN") : "—"} hint={st ? `≈ $${st.last24h.costUsd.toFixed(3)} (24h estimate)` : undefined} icon={<Zap className="h-4 w-4" />} tone="green" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Test customer chat <span className="muted font-normal">— exactly what a website visitor sees</span></h2>
            <ChatWidget storageKey="vs-agent-test" onLead={(l, m) => { setLead(l); setMeta(m); mutate(); }} suggestions={["Hi, I want a plot in Hosur", "ನನಗೆ ಅತ್ತಿಬೆಲೆ ಹತ್ತಿರ ಫ್ಲಾಟ್ ಬೇಕು", "villa beku Electronic City side", "What is the price range?"]} />
          </div>
          <Card title="What the AI captured" subtitle="This session's lead record, updated every message">
            {!lead ? (
              <p className="muted text-sm">Send a message to see requirements, qualification score and routing appear here.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-4xl font-semibold tabular-nums">{lead.score}<span className="muted text-base">/100</span></div>
                  <div className="flex flex-col items-end gap-1"><PriorityBadge priority={lead.priority} /><StatusBadge status={lead.status} /></div>
                </div>
                <div className="h-2 overflow-hidden rounded-full panel-2"><div className="h-full rounded-full bg-gradient-to-r from-[#0b1222] to-[#d6b16a] transition-all duration-700" style={{ width: `${lead.score}%` }} /></div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {FIELDS.map(([k, label]) => (
                    <div key={k}><dt className="muted text-[11px] uppercase tracking-wider">{label}</dt><dd className={cx("font-medium", !lead[k] && "muted font-normal")}>{k === "budget_text" && lead.budget_max ? `${lead.budget_text} (${inr(lead.budget_max)})` : (lead[k] as string) ?? "—"}</dd></div>
                  ))}
                </dl>
                <div>
                  <div className="muted mb-1 text-[11px] uppercase tracking-wider">Score reasons</div>
                  <ul className="space-y-0.5 text-xs">{lead.score_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {meta?.provider && <Badge tone="navy">{meta.provider}</Badge>}
                  {meta?.intent && <Badge>{meta.intent}</Badge>}
                  {lead.language && <Badge tone="blue">lang: {lead.language}</Badge>}
                  {meta?.escalated && <Badge tone="red">escalated to human</Badge>}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><Users className="gold h-4 w-4" /> Concurrency test</span>} subtitle="Several customers chat at the same time; then we verify no data crossed between sessions.">
            <div className="flex items-end gap-2">
              <Field label="Customers" className="w-28"><input type="number" min={2} max={12} className="input" value={n} onChange={(e) => setN(+e.target.value)} /></Field>
              <button className="btn-primary flex-1" disabled={busy || !demo} onClick={() => run(async () => setConc(await api<ConcResult>("/api/demo", { method: "POST", json: { action: "concurrent", customers: n } })), "Concurrency test finished")}>Run {n} simultaneous chats</button>
            </div>
            {!demo && <p className="muted mt-2 text-xs">Available in DEMO MODE only.</p>}
            {conc && (
              <div className="mt-4 space-y-2 text-sm">
                <div className={cx("flex items-center gap-2 rounded-xl p-2.5 font-medium", conc.allIsolated ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700")}>
                  <ShieldCheck className="h-4 w-4" /> {conc.allIsolated ? "All sessions isolated" : "Isolation problem detected"} · {conc.customers} customers in {(conc.totalMs / 1000).toFixed(1)}s
                </div>
                <table className="table text-xs">
                  <thead><tr><th>Customer</th><th>Msgs</th><th>Score</th><th>Assigned</th><th>Isolated</th></tr></thead>
                  <tbody>{conc.results.map((r, i) => <tr key={i}><td>{r.customer}</td><td>{conc.isolation[i].messages}</td><td>{r.score}</td><td>{r.assigned ? "✓" : "—"}</td><td>{conc.isolation[i].ok ? "✓" : "✗"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={<span className="flex items-center gap-2"><Phone className="h-4 w-4 text-emerald-500" /> WhatsApp simulator</span>} subtitle="Sends a fake inbound webhook through the real queue → worker → AI pipeline.">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" aria-label="Phone" value={wa.phone} onChange={(e) => setWa({ ...wa, phone: e.target.value })} />
                <input className="input" aria-label="Name" value={wa.name} onChange={(e) => setWa({ ...wa, name: e.target.value })} />
              </div>
              <textarea className="input" rows={2} aria-label="Message" value={wa.text} onChange={(e) => setWa({ ...wa, text: e.target.value })} />
              <button className="btn-ghost w-full" disabled={busy || !demo} onClick={() => run(async () => { const r = await api<{ messages: { direction: string; body: string; delivery_status: string }[] }>("/api/demo", { method: "POST", json: { action: "whatsapp", ...wa } }); setWaLog(r.messages); setWa((w) => ({ ...w, text: "" })); })}>Send as WhatsApp customer</button>
            </div>
            {!!waLog.length && (
              <div className="mt-3 space-y-2 rounded-xl p-3" style={{ background: "#e7ddd3" }}>
                {waLog.map((m, i) => (
                  <div key={i} className={cx("flex", m.direction === "in" ? "justify-start" : "justify-end")}>
                    <div className={cx("max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs text-slate-900 shadow-sm", m.direction === "in" ? "bg-white" : "bg-[#d9fdd3]")}>
                      {m.body}
                      {m.direction === "out" && <div className="mt-0.5 text-right text-[9px] text-slate-500">{m.delivery_status === "simulated" ? "SIMULATED — not sent" : m.delivery_status}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
