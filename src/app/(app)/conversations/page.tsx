"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Bot, UserRound, Pause, Play, Hand, Send, StickyNote, ShieldAlert, CheckCircle2, XCircle, Search, ArrowLeft, ExternalLink, Info } from "lucide-react";
import { PageHeader, useApi, api, useAction, Badge, PriorityBadge, StatusBadge, Empty, timeAgo, fmtDate, SOURCE_LABEL, cx, phoneFmt, Tabs, Skeleton } from "@/components/ui";
import { ReassignSelect } from "@/components/lead-actions";
import type { Conversation, Lead, Message, Note, Executive } from "@/lib/types";

type Row = { id: string; leadId: string; name: string | null; phone: string | null; channel: string; status: string; handler: string; aiPaused: boolean; escalated: boolean; processing: boolean; lastMessageAt: string | null; lastMessage: { body: string; direction: string } | null; propertyType: string | null; budget: string | null; priority: string; leadStatus: string; executive: string | null; isDemo: boolean };
type Detail = { conversation: Conversation; lead: Lead; messages: Message[]; notes: Note[]; executive: Executive | null; serviceWindowOpen: boolean };

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "active" | "ai" | "human" | "escalated">("all");
  const [q, setQ] = useState("");
  const selected = sp.get("id");
  const { data: list, mutate: refreshList } = useApi<{ conversations: Row[]; total: number }>(`/api/conversations?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { refreshInterval: 5000 });
  const { data: d, mutate } = useApi<Detail>(selected ? `/api/conversations/${selected}` : null, { refreshInterval: 4000 });
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [inspect, setInspect] = useState<string | null>(null);
  const { run, busy } = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [d?.messages.length]);

  const act = (action: string, okText: string, body?: string) =>
    run(async () => {
      await api(`/api/conversations/${selected}`, { method: "POST", json: { action, text: body } });
      await Promise.all([mutate(), refreshList()]);
    }, okText);
  const setLead = (patch: Record<string, unknown>, okText: string) =>
    run(async () => { await api(`/api/leads/${d!.lead.id}`, { method: "PATCH", json: patch }); await mutate(); }, okText);

  const open = (id: string) => router.push(`/conversations?id=${id}`, { scroll: false });
  const lead = d?.lead;
  const conv = d?.conversation;
  const aiActive = conv && conv.handler === "ai" && !conv.ai_paused;

  return (
    <>
      <PageHeader eyebrow="Live Conversations" title="Conversation Center" subtitle="Every customer in their own thread. Inspect the AI, take over, pause/resume, reassign and annotate." />
      <div className="card grid min-h-[70vh] overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* list */}
        <div className={cx("flex flex-col border-r hairline", selected && "hidden lg:flex")}>
          <div className="space-y-2 border-b p-3 hairline">
            <div className="relative"><Search className="muted absolute left-3 top-2.5 h-4 w-4" /><input className="input pl-9" placeholder="Search name, phone, location" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Tabs value={filter} onChange={setFilter} tabs={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "ai", label: "AI" }, { value: "human", label: "Human" }, { value: "escalated", label: "Escalated" }]} />
          </div>
          <ul className="scroll-thin flex-1 divide-y overflow-y-auto hairline" style={{ maxHeight: "72vh" }}>
            {!list && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-12" /></li>)}
            {list?.conversations.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c.id)} className={cx("w-full p-3 text-left transition hover:bg-[var(--panel-2)]", selected === c.id && "bg-[var(--gold-soft)]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.name ?? (c.phone ? phoneFmt(c.phone) : "Website visitor")}</span>
                    <span className="muted shrink-0 text-[11px]">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <p className="muted mt-0.5 truncate text-xs">{c.lastMessage ? `${c.lastMessage.direction === "out" ? "↩ " : ""}${c.lastMessage.body}` : "No messages"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge>{SOURCE_LABEL[c.channel]}</Badge>
                    {c.processing ? <Badge tone="blue" dot>AI working</Badge> : <Badge tone={c.handler === "ai" && !c.aiPaused ? "navy" : "gold"}>{c.handler === "ai" && !c.aiPaused ? "AI" : c.aiPaused && c.handler === "ai" ? "AI paused" : "Human"}</Badge>}
                    {c.escalated && <Badge tone="red">Escalated</Badge>}
                    <PriorityBadge priority={c.priority} />
                  </div>
                </button>
              </li>
            ))}
            {list && !list.conversations.length && <Empty title="No conversations" hint="Try another filter." />}
          </ul>
        </div>

        {/* thread */}
        <div className={cx("flex min-w-0 flex-col", !selected && "hidden lg:flex")}>
          {!selected || !d ? (
            selected ? <div className="p-6"><Skeleton className="h-64" /></div> : <Empty title="Select a conversation" hint="Pick a customer on the left to open the complete history." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 hairline">
                <button className="btn-ghost btn-sm lg:hidden" onClick={() => router.push("/conversations")} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="mr-auto min-w-0">
                  <div className="truncate font-semibold">{lead!.name ?? "Unnamed customer"}</div>
                  <div className="muted text-xs">{phoneFmt(lead!.phone)} · {SOURCE_LABEL[conv!.channel]}{conv!.is_demo && " · DEMO"}</div>
                </div>
                {aiActive ? (
                  <>
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act("pause", "AI paused")}><Pause className="h-3.5 w-3.5" /> Pause AI</button>
                    <button className="btn-primary btn-sm" disabled={busy} onClick={() => act("takeover", "You are now handling this conversation")}><Hand className="h-3.5 w-3.5" /> Take over</button>
                  </>
                ) : (
                  <button className="btn-gold btn-sm" disabled={busy} onClick={() => act("resume", "AI resumed")}><Play className="h-3.5 w-3.5" /> Resume AI</button>
                )}
              </div>
              {conv!.escalated && <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><ShieldAlert className="h-3.5 w-3.5" /> Escalated: {conv!.escalation_reason}</div>}
              <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4" style={{ background: "var(--panel-2)", maxHeight: "58vh" }}>
                {d.messages.map((m) => m.direction === "internal" ? (
                  <div key={m.id} className="mx-auto max-w-[90%] rounded-xl border border-dashed border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><StickyNote className="mr-1 inline h-3 w-3" /><b>{m.sender_name}</b> (internal): {m.body}</div>
                ) : (
                  <div key={m.id} className={cx("flex", m.direction === "in" ? "justify-start" : "justify-end")}>
                    <div className="max-w-[78%]">
                      <div className={cx("whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.direction === "in" ? "rounded-bl-md border hairline" : m.sender === "executive" ? "rounded-br-md bg-[#b8913f] text-[#0b1222]" : "rounded-br-md bg-[#0b1222] text-white")} style={m.direction === "in" ? { background: "var(--panel)" } : undefined}>{m.body}</div>
                      <div className={cx("muted mt-0.5 flex items-center gap-1.5 text-[10px]", m.direction === "out" && "justify-end")}>
                        {m.direction === "out" && (m.sender === "ai" ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />)}
                        {m.sender_name ?? m.sender} · {fmtDate(m.created_at, { timeStyle: "short", dateStyle: "short" })}
                        {m.direction === "out" && <> · <span className={m.delivery_status === "failed" ? "text-red-500" : ""}>{m.delivery_status}</span></>}
                        {m.sender === "ai" && <button className="underline" onClick={() => setInspect(inspect === m.id ? null : m.id)}>inspect</button>}
                      </div>
                      {inspect === m.id && (
                        <pre className="mt-1 max-w-full overflow-x-auto rounded-lg border p-2 text-[10px] hairline" style={{ background: "var(--panel)" }}>{JSON.stringify(m.meta, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                ))}
                {conv!.processing && <div className="muted text-xs">AI is composing a reply…</div>}
                <div ref={endRef} />
              </div>
              <div className="border-t p-3 hairline">
                <div className="mb-2 flex items-center gap-2">
                  <Tabs value={mode} onChange={setMode} tabs={[{ value: "reply", label: "Reply to customer" }, { value: "note", label: "Internal note" }]} />
                  {mode === "reply" && conv!.channel === "whatsapp" && !d.serviceWindowOpen && <span className="text-[11px] text-amber-600">24h window closed — templates only</span>}
                  {mode === "reply" && aiActive && <span className="muted text-[11px]">Sending will pause the AI</span>}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; act(mode === "reply" ? "send" : "note", mode === "reply" ? "Message sent" : "Note added", text).then(() => setText("")); }}>
                  <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "reply" ? (lead!.opted_out ? "Customer opted out" : "Write a reply…") : "Note visible only to your team"} disabled={mode === "reply" && lead!.opted_out} />
                  <button className="btn-primary" disabled={busy || !text.trim()}>{mode === "reply" ? <Send className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}</button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* lead panel */}
        <aside className={cx("scroll-thin hidden overflow-y-auto border-l p-4 hairline lg:block", !selected && "lg:hidden xl:block")}>
          {lead ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between">
                <div><div className="muted text-[11px] uppercase tracking-wider">Lead</div><div className="text-lg font-semibold">{lead.score}<span className="muted text-xs">/100</span></div></div>
                <div className="flex flex-col items-end gap-1"><StatusBadge status={lead.status} /><PriorityBadge priority={lead.priority} /></div>
              </div>
              <dl className="space-y-1.5">
                {[["Requirement", lead.property_type], ["Location", lead.preferred_location], ["Budget", lead.budget_text], ["Config", lead.configuration], ["Purpose", lead.purpose], ["Timeline", lead.timeline], ["Visit", lead.site_visit_preference], ["Last interaction", timeAgo(lead.last_interaction_at)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="muted">{k}</dt><dd className="text-right font-medium">{v ?? "—"}</dd></div>
                ))}
              </dl>
              <div><span className="label">Assigned executive</span><ReassignSelect leadId={lead.id} current={lead.assigned_executive_id} onDone={() => mutate()} /></div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost btn-sm" disabled={busy || lead.status !== "NEW"} onClick={() => setLead({ qualified: true }, "Marked qualified")}><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Qualified</button>
                <button className="btn-ghost btn-sm" disabled={busy || lead.status === "LOST"} onClick={() => setLead({ qualified: false, lost_reason: "Marked unqualified from inbox" }, "Marked unqualified")}><XCircle className="h-3.5 w-3.5 text-red-500" /> Unqualified</button>
              </div>
              <button className="btn-danger btn-sm w-full" disabled={busy} onClick={() => { const r = prompt("Reason for escalation to management?"); if (r !== null) act("escalate", "Escalated to management", r); }}><ShieldAlert className="h-3.5 w-3.5" /> Escalate to management</button>
              <Link href={`/leads/${lead.id}`} className="btn-ghost btn-sm w-full"><ExternalLink className="h-3.5 w-3.5" /> Full customer profile</Link>
              {lead.score_reasons.length > 0 && (
                <div><span className="label flex items-center gap-1"><Info className="h-3 w-3" /> Why this score</span><ul className="muted space-y-0.5 text-xs">{lead.score_reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
              )}
              {d!.notes.length > 0 && (
                <div><span className="label">Notes</span><ul className="space-y-2">{d!.notes.slice(0, 5).map((n) => <li key={n.id} className="rounded-lg p-2 text-xs panel-2"><b>{n.author}</b> · {timeAgo(n.created_at)}<p>{n.body}</p></li>)}</ul></div>
              )}
            </div>
          ) : <p className="muted text-sm">Customer details appear here.</p>}
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><Inbox /></Suspense>;
}
