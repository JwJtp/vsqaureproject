"use client";
// Shared lead actions used by the inbox, lead profile and executive portal.
import { useState } from "react";
import { CalendarPlus, Clock } from "lucide-react";
import { api, useAction, useApi, Modal, Field, fmtDate, ApiError } from "./ui";

export function ReassignSelect({ leadId, current, onDone }: { leadId: string; current: string | null; onDone: () => void }) {
  const { data } = useApi<{ executives: { id: string; name: string; available: boolean; active: boolean; assignedToday: number; daily_capacity: number }[] }>("/api/executives");
  const { run, busy } = useAction();
  return (
    <select
      aria-label="Assign executive"
      className="input !py-1.5 text-xs"
      disabled={busy}
      value={current ?? ""}
      onChange={(e) => run(async () => { await api(`/api/leads/${leadId}/assign`, { method: "POST", json: { executiveId: e.target.value || null } }); onDone(); }, e.target.value ? "Lead reassigned — executive notified" : "Auto-assignment run")}
    >
      <option value="">{current ? "↻ Auto-assign (rules)" : "Unassigned — auto-assign"}</option>
      {data?.executives.filter((x) => x.active).map((x) => (
        <option key={x.id} value={x.id} disabled={!x.available}>{x.name}{!x.available ? " (unavailable)" : ` · ${x.assignedToday}/${x.daily_capacity} today`}</option>
      ))}
    </select>
  );
}

export function VisitModal({ open, onClose, leadId, projectId, onDone, rescheduleId }: { open: boolean; onClose: () => void; leadId: string; projectId?: string | null; onDone: () => void; rescheduleId?: string }) {
  const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const { data: projects } = useApi<{ projects: { id: string; name: string; verified: boolean }[] }>(open ? "/api/projects" : null);
  const [proj, setProj] = useState<string>(projectId ?? "");
  const { data, isLoading } = useApi<{ slots: { start: string; booked: number; capacity: number; available: boolean }[] }>(open ? `/api/site-visits/slots?date=${date}${proj ? `&projectId=${proj}` : ""}` : null);
  const { run, busy } = useAction();
  const [alts, setAlts] = useState<string[]>([]);
  const submit = () =>
    run(async () => {
      try {
        if (rescheduleId) await api(`/api/site-visits/${rescheduleId}`, { method: "PATCH", json: { rescheduleTo: slot, notes: notes || undefined } });
        else await api("/api/site-visits", { method: "POST", json: { leadId, projectId: proj || null, at: slot, notes: notes || undefined } });
        onDone();
        onClose();
      } catch (e) {
        if (e instanceof ApiError) setAlts(((e.data as { alternatives?: string[] }).alternatives) ?? []);
        throw e;
      }
    }, rescheduleId ? "Visit rescheduled — reminders updated" : "Site visit booked — customer & executive notified");
  return (
    <Modal open={open} onClose={onClose} title={rescheduleId ? "Reschedule site visit" : "Schedule site visit"} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!slot || busy} onClick={submit}><CalendarPlus className="h-4 w-4" /> Confirm</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" className="input" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); setSlot(null); }} /></Field>
          {!rescheduleId && (
            <Field label="Project">
              <select className="input" value={proj} onChange={(e) => setProj(e.target.value)}>
                <option value="">— none —</option>
                {projects?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}{!p.verified ? " (unverified)" : ""}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div>
          <span className="label">Available slots</span>
          {isLoading ? <p className="muted text-sm">Checking calendar…</p> : !data?.slots.length ? <p className="muted text-sm">No visit slots on this day (see Admin Settings → Site visits).</p> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.slots.map((s) => (
                <button key={s.start} type="button" disabled={!s.available} onClick={() => setSlot(s.start)} className={`rounded-xl border px-2 py-2 text-xs font-medium transition hairline disabled:opacity-40 ${slot === s.start ? "border-[var(--gold)] bg-[var(--gold-soft)]" : ""}`}>
                  <Clock className="mx-auto mb-0.5 h-3 w-3" />{fmtDate(s.start, { timeStyle: "short" })}
                  <div className="muted text-[10px]">{s.booked}/{s.capacity} booked</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {!!alts.length && <p className="text-xs text-amber-700 dark:text-amber-300">Suggested alternatives: {alts.map((a) => fmtDate(a)).join(", ")}</p>}
        <Field label="Notes (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}
