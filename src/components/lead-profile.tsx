"use client";
import { useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, CalendarPlus, StickyNote, Clock, Trophy, XCircle, ShieldCheck, Trash2, History, ListChecks, MapPin, Copy } from "lucide-react";
import { Card, useApi, api, useAction, Badge, PriorityBadge, StatusBadge, timeAgo, fmtDate, SOURCE_LABEL, phoneFmt, inr, statusLabel, Modal, Field, Skeleton, Tabs, cx } from "./ui";
import { ReassignSelect, VisitModal } from "./lead-actions";
import { LEAD_STATUSES, type Lead, type Message, type Note, type Activity, type Assignment, type SiteVisit, type FollowUpTask, type Consent, type Executive, type Project, type Conversation } from "@/lib/types";

type Detail = {
  lead: Lead; executive: Executive | null; conversations: Conversation[]; messages: Message[]; notes: Note[]; activities: Activity[];
  assignments: (Assignment & { executive_name: string | null })[]; visits: SiteVisit[]; tasks: FollowUpTask[]; consents: Consent[];
  duplicates: { id: string; created_at: string; status: string }[]; matchedProjects: Project[];
};

export function LeadProfile({ id, admin }: { id: string; admin: boolean }) {
  const { data: d, mutate } = useApi<Detail>(`/api/leads/${id}`, { refreshInterval: 8000 });
  const { run, busy } = useAction();
  const [tab, setTab] = useState<"timeline" | "chat" | "assign" | "tasks">("chat");
  const [note, setNote] = useState("");
  const [visit, setVisit] = useState<{ open: boolean; reschedule?: string }>({ open: false });
  const [outcome, setOutcome] = useState<null | "CONVERTED" | "LOST">(null);
  const [outcomeVal, setOutcomeVal] = useState("");
  const [fu, setFu] = useState(false);
  const [fuAt, setFuAt] = useState("");

  if (!d) return <Skeleton className="h-[70vh]" />;
  const l = d.lead;
  const patch = (body: Record<string, unknown>, ok: string) => run(async () => { await api(`/api/leads/${id}`, { method: "PATCH", json: body }); await mutate(); }, ok);
  const wa = l.phone ? `https://wa.me/${l.phone}?text=${encodeURIComponent(`Namaskara ${l.name ?? ""}, this is ${d.executive?.name ?? "the team"} from V Square Projects regarding your property enquiry.`)}` : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <div className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="h-display text-2xl">{l.name ?? "Unnamed customer"}</h2>
                <p className="muted text-sm">{phoneFmt(l.phone)}{l.email && ` · ${l.email}`}</p>
              </div>
              <PriorityBadge priority={l.priority} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusBadge status={l.status} />
              <Badge>{SOURCE_LABEL[l.source]}</Badge>
              {l.is_demo && <Badge tone="gold">DEMO</Badge>}
              {l.opted_out && <Badge tone="red">Opted out</Badge>}
              {l.consent_whatsapp && !l.opted_out && <Badge tone="green"><ShieldCheck className="h-3 w-3" />consent</Badge>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={l.phone ? `tel:+${l.phone}` : undefined} className={cx("btn-primary", !l.phone && "pointer-events-none opacity-50")}><Phone className="h-4 w-4" /> Call</a>
              <a href={wa && !l.opted_out ? wa : undefined} target="_blank" rel="noreferrer" className={cx("btn-ghost", (!wa || l.opted_out) && "pointer-events-none opacity-50")}><MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp</a>
            </div>
          </div>
          <div className="border-t p-5 hairline">
            <div className="mb-3 flex items-end justify-between"><span className="label !mb-0">Lead score</span><span className="text-2xl font-semibold tabular-nums">{l.score}</span></div>
            <ul className="muted space-y-0.5 text-xs">{l.score_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t p-5 text-sm hairline">
            {[["Property", l.property_type], ["Location", l.preferred_location], ["Budget", l.budget_max ? `${l.budget_text ?? ""} (${inr(l.budget_max)})` : l.budget_text], ["Config / size", l.configuration], ["Purpose", l.purpose], ["Timeline", l.timeline], ["Visit preference", l.site_visit_preference], ["Language", l.language], ["Created", fmtDate(l.created_at)], ["First AI response", l.first_response_at ? `${Math.max(0, Math.round((Date.parse(l.first_response_at) - Date.parse(l.created_at)) / 1000))}s` : "—"]].map(([k, v]) => (
              <div key={k}><dt className="muted text-[11px] uppercase tracking-wider">{k}</dt><dd className="font-medium">{v ?? "—"}</dd></div>
            ))}
            {l.deal_value !== null && <div><dt className="muted text-[11px] uppercase tracking-wider">Deal value</dt><dd className="font-semibold text-emerald-600">{inr(l.deal_value)}</dd></div>}
            {l.lost_reason && <div className="col-span-2"><dt className="muted text-[11px] uppercase tracking-wider">Lost reason</dt><dd>{l.lost_reason}</dd></div>}
          </dl>
        </Card>

        <Card title="Actions">
          <div className="space-y-3">
            <Field label="Status">
              <select className="input" value={l.status} disabled={busy} onChange={(e) => {
                const s = e.target.value;
                if (s === "CONVERTED" || s === "LOST") { setOutcome(s); setOutcomeVal(""); return; }
                patch({ status: s }, `Status changed to ${statusLabel(s)}`);
              }}>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </Field>
            {admin && <div><span className="label">Assigned executive</span><ReassignSelect leadId={l.id} current={l.assigned_executive_id} onDone={() => mutate()} /></div>}
            {!admin && <div className="text-sm"><span className="label">Assigned to</span>{d.executive?.name ?? "—"}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setVisit({ open: true })}><CalendarPlus className="h-3.5 w-3.5" /> Site visit</button>
              <button className="btn-ghost btn-sm" onClick={() => setFu(true)}><Clock className="h-3.5 w-3.5" /> Follow-up</button>
              <button className="btn-ghost btn-sm" onClick={() => { setOutcome("CONVERTED"); setOutcomeVal(""); }}><Trophy className="h-3.5 w-3.5 text-emerald-500" /> Converted</button>
              <button className="btn-ghost btn-sm" onClick={() => { setOutcome("LOST"); setOutcomeVal(""); }}><XCircle className="h-3.5 w-3.5 text-red-500" /> Lost</button>
            </div>
            {admin && <button className="btn-danger btn-sm w-full" disabled={busy} onClick={() => { if (confirm("Permanently delete this lead and all its data? This supports data-deletion requests and cannot be undone.")) run(async () => { await api(`/api/leads/${id}`, { method: "DELETE" }); location.href = "/leads"; }, "Lead deleted"); }}><Trash2 className="h-3.5 w-3.5" /> Delete customer data</button>}
          </div>
        </Card>

        {d.matchedProjects.length > 0 && (
          <Card title="Matching verified projects">
            <ul className="space-y-2 text-sm">{d.matchedProjects.map((p) => <li key={p.id} className="flex items-center gap-2"><MapPin className="gold h-3.5 w-3.5" />{p.name}<span className="muted">· {p.location}</span></li>)}</ul>
          </Card>
        )}
        {d.duplicates.length > 0 && (
          <Card title={<span className="flex items-center gap-2"><Copy className="h-4 w-4" /> Possible duplicates</span>}>
            <ul className="space-y-1 text-sm">{d.duplicates.map((x) => <li key={x.id}><Link className="hover:underline" href={`/leads/${x.id}`}>{fmtDate(x.created_at, { dateStyle: "medium" })}</Link> · {statusLabel(x.status)}</li>)}</ul>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "chat", label: "AI conversation" }, { value: "timeline", label: "Activity timeline" }, { value: "tasks", label: `Visits & follow-ups (${d.visits.length + d.tasks.filter((t) => t.status === "pending").length})` }, { value: "assign", label: "Assignments & consent" }]} />

        {tab === "chat" && (
          <Card title="Conversation transcript" subtitle={d.conversations.map((c) => SOURCE_LABEL[c.channel]).join(", ") || "No conversation"} action={admin && d.conversations[0] ? <Link className="btn-ghost btn-sm" href={`/conversations?id=${d.conversations[0].id}`}>Open in inbox</Link> : undefined}>
            <div className="scroll-thin max-h-[520px] space-y-2.5 overflow-y-auto">
              {d.messages.map((m) => (
                <div key={m.id} className={cx("flex", m.direction === "in" ? "justify-start" : m.direction === "internal" ? "justify-center" : "justify-end")}>
                  <div className={cx("max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.direction === "in" ? "border hairline" : m.direction === "internal" ? "border border-dashed border-amber-400/60 text-xs" : m.sender === "executive" ? "bg-[#b8913f] text-[#0b1222]" : "bg-[#0b1222] text-white")}>
                    {m.body}
                    <div className="mt-0.5 text-[10px] opacity-60">{m.sender_name ?? m.sender} · {fmtDate(m.created_at, { dateStyle: "short", timeStyle: "short" })}{m.direction === "out" && ` · ${m.delivery_status}`}</div>
                  </div>
                </div>
              ))}
              {!d.messages.length && <p className="muted text-sm">No messages — this lead came from a form or manual entry.</p>}
            </div>
          </Card>
        )}

        {tab === "timeline" && (
          <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4" /> Activity timeline</span>}>
            <ol className="relative space-y-4 border-l pl-5 hairline">
              {d.activities.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--panel)] bg-[var(--gold)]" />
                  <p>{a.description}</p>
                  <p className="muted text-xs">{fmtDate(a.created_at)} · {a.actor}</p>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {tab === "tasks" && (
          <>
            <Card title="Site visits" action={<button className="btn-ghost btn-sm" onClick={() => setVisit({ open: true })}><CalendarPlus className="h-3.5 w-3.5" /> Schedule</button>}>
              {!d.visits.length ? <p className="muted text-sm">No visits yet.</p> : (
                <ul className="space-y-2">
                  {d.visits.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm hairline">
                      <div><b>{fmtDate(v.scheduled_at)}</b> <Badge tone={v.status === "completed" ? "green" : v.status === "cancelled" ? "red" : "blue"}>{v.status}</Badge>{v.notes && <div className="muted text-xs">{v.notes}</div>}</div>
                      {["requested", "confirmed"].includes(v.status) && (
                        <div className="flex gap-1.5">
                          {v.status === "requested" && <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/site-visits/${v.id}`, { method: "PATCH", json: { status: "confirmed" } }); mutate(); }, "Visit confirmed")}>Confirm</button>}
                          <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/site-visits/${v.id}`, { method: "PATCH", json: { status: "completed" } }); mutate(); }, "Marked completed")}>Completed</button>
                          <button className="btn-ghost btn-sm" onClick={() => setVisit({ open: true, reschedule: v.id })}>Reschedule</button>
                          <button className="btn-danger btn-sm" onClick={() => run(async () => { await api(`/api/site-visits/${v.id}`, { method: "PATCH", json: { status: "cancelled" } }); mutate(); }, "Visit cancelled")}>Cancel</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={<span className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Follow-up tasks</span>} action={<button className="btn-ghost btn-sm" onClick={() => setFu(true)}><Clock className="h-3.5 w-3.5" /> Add</button>}>
              <ul className="space-y-2">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm hairline">
                    <div><div className="font-medium">{t.title}</div><div className="muted text-xs">Due {fmtDate(t.due_at)} ({timeAgo(t.due_at)}) · {t.status}{t.result && ` · ${t.result}`}</div></div>
                    {t.status === "pending" && <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/followups/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }); mutate(); }, "Task completed")}>Mark done</button>}
                  </li>
                ))}
                {!d.tasks.length && <p className="muted text-sm">No follow-up tasks.</p>}
              </ul>
            </Card>
          </>
        )}

        {tab === "assign" && (
          <>
            <Card title="Assignment history">
              <ul className="space-y-2 text-sm">
                {d.assignments.map((a) => <li key={a.id} className="rounded-xl border p-3 hairline"><b>{a.executive_name ?? "Unassigned queue"}</b> <Badge>{a.method}</Badge><div className="muted text-xs">{a.reason} · by {a.assigned_by} · {fmtDate(a.created_at)}</div></li>)}
                {!d.assignments.length && <p className="muted">Not assigned yet.</p>}
              </ul>
            </Card>
            <Card title="Consent records">
              <ul className="space-y-2 text-sm">
                {d.consents.map((c) => <li key={c.id}><Badge tone={c.granted ? "green" : "red"}>{c.granted ? "granted" : "revoked"}</Badge> {c.channel} · {c.text} <span className="muted text-xs">({fmtDate(c.created_at)})</span></li>)}
                {!d.consents.length && <p className="muted">No consent record.</p>}
              </ul>
            </Card>
          </>
        )}

        <Card title={<span className="flex items-center gap-2"><StickyNote className="h-4 w-4" /> Internal notes</span>}>
          <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/api/leads/${id}/notes`, { method: "POST", json: { body: note } }); setNote(""); mutate(); }, "Note added"); }}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a follow-up note…" />
            <button className="btn-primary" disabled={!note.trim() || busy}>Add</button>
          </form>
          <ul className="space-y-2">{d.notes.map((n) => <li key={n.id} className="rounded-xl p-3 text-sm panel-2"><div className="muted text-xs">{n.author} · {fmtDate(n.created_at)}</div>{n.body}</li>)}</ul>
        </Card>
      </div>

      <VisitModal open={visit.open} onClose={() => setVisit({ open: false })} leadId={l.id} projectId={l.matched_project_ids[0]} rescheduleId={visit.reschedule} onDone={() => mutate()} />
      <Modal open={!!outcome} onClose={() => setOutcome(null)} title={outcome === "CONVERTED" ? "Mark as converted" : "Mark as lost"} footer={<><button className="btn-ghost" onClick={() => setOutcome(null)}>Cancel</button><button className="btn-primary" disabled={busy || (outcome === "LOST" && !outcomeVal.trim())} onClick={() => patch(outcome === "CONVERTED" ? { status: "CONVERTED", ...(outcomeVal ? { deal_value: Math.round(parseFloat(outcomeVal) * 1e5) } : {}) } : { status: "LOST", lost_reason: outcomeVal }, outcome === "CONVERTED" ? "Congratulations — lead converted!" : "Lead marked lost").then(() => setOutcome(null))}>Save</button></>}>
        {outcome === "CONVERTED" ? (
          <Field label="Deal value in lakh (optional)" hint="Only authorised users should enter revenue. Example: 42.5 = ₹42.5 L"><input className="input" type="number" step="0.1" min="0" value={outcomeVal} onChange={(e) => setOutcomeVal(e.target.value)} /></Field>
        ) : (
          <Field label="Reason *"><input className="input" value={outcomeVal} onChange={(e) => setOutcomeVal(e.target.value)} placeholder="e.g. Budget mismatch, bought elsewhere" /></Field>
        )}
      </Modal>
      <Modal open={fu} onClose={() => setFu(false)} title="Schedule a follow-up" footer={<><button className="btn-ghost" onClick={() => setFu(false)}>Cancel</button><button className="btn-primary" disabled={!fuAt || busy} onClick={() => patch({ followUpAt: new Date(fuAt).toISOString() }, "Follow-up scheduled").then(() => setFu(false))}>Schedule</button></>}>
        <Field label="When" hint="The scheduler respects working hours."><input type="datetime-local" className="input" value={fuAt} onChange={(e) => setFuAt(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
