"use client";
import { ArrowDown, ArrowUp, RefreshCw, Database, ShieldCheck } from "lucide-react";
import { PageHeader, Card, Field, Toggle, useApi, api, useAction, Badge } from "@/components/ui";
import { SettingsSection, DayPicker } from "@/components/settings-form";
import type { AssignmentMethod } from "@/lib/types";

const METHODS: { id: AssignmentMethod; label: string }[] = [
  { id: "project", label: "Project-based" }, { id: "location", label: "Location-based" }, { id: "expertise", label: "Expertise matching" },
  { id: "workload", label: "Workload-aware" }, { id: "round_robin", label: "Round-robin" },
];

export default function Admin() {
  const { data: me } = useApi<{ mode: string; ai: string; whatsapp: string }>("/api/me");
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader eyebrow="Administration" title="Admin Settings" subtitle="Company profile, working hours, routing rules, site-visit calendar, WhatsApp templates, data retention and demo controls." />
      <Card className="mb-6" title={<span className="flex items-center gap-2"><Database className="gold h-4 w-4" /> Environment mode</span>}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={me?.mode === "live" ? "green" : "gold"}>Data: {me?.mode === "live" ? "LIVE (Supabase)" : "DEMO (in-memory)"}</Badge>
          <Badge tone={me?.ai === "live" ? "green" : "gold"}>AI: {me?.ai}</Badge>
          <Badge tone={me?.whatsapp === "live" ? "green" : "gold"}>WhatsApp: {me?.whatsapp}</Badge>
          <span className="muted text-xs">Data mode is set by the <code>APP_MODE</code> env variable and Supabase credentials, so demo and production data can never mix. AI and WhatsApp can be forced to simulation in AI Agent Settings and below.</span>
          {me?.mode === "demo" && <button className="btn-danger btn-sm ml-auto" disabled={busy} onClick={() => { if (confirm("Reset all DEMO data to the original seed?")) run(async () => { await api("/api/demo", { method: "POST", json: { action: "reset" } }); location.reload(); }, "Demo data reset"); }}><RefreshCw className="h-3.5 w-3.5" /> Reset demo data</button>}
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection section="company" title="Company profile" subtitle="Verified from the public website; editable.">
          {(v, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name"><input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Tagline"><input className="input" value={v.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
              <Field label="Phone"><input className="input" value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={v.email} onChange={(e) => set({ email: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><input className="input" value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              <Field label="Website" className="sm:col-span-2"><input className="input" value={v.website} onChange={(e) => set({ website: e.target.value })} /></Field>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="workingHours" title="Working hours" subtitle="Follow-ups to executives are only sent inside these hours.">
          {(v, set) => (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Timezone"><input className="input" value={v.timezone} onChange={(e) => set({ timezone: e.target.value })} /></Field>
                <Field label="Start hour"><input type="number" min={0} max={23} className="input" value={v.startHour} onChange={(e) => set({ startHour: +e.target.value })} /></Field>
                <Field label="End hour"><input type="number" min={1} max={24} className="input" value={v.endHour} onChange={(e) => set({ endHour: +e.target.value })} /></Field>
              </div>
              <div><span className="label">Working days</span><DayPicker value={v.days} onChange={(days) => set({ days })} /></div>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="assignment" title="Assignment rules" subtitle="Methods are tried top to bottom; the first that finds an eligible executive wins. Unavailable/full executives are always excluded; if nobody fits, the lead goes to the unassigned queue and admins are alerted.">
          {(v, set) => {
            const order = [...v.strategy, ...METHODS.map((m) => m.id).filter((m) => !v.strategy.includes(m))];
            const move = (i: number, d: number) => { const s = [...v.strategy]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; set({ strategy: s }); };
            return (
              <ul className="space-y-2">
                {order.map((m) => {
                  const idx = v.strategy.indexOf(m);
                  const on = idx >= 0;
                  return (
                    <li key={m} className="flex items-center gap-3 rounded-xl border p-2.5 hairline">
                      <span className="w-5 text-center text-xs font-bold">{on ? idx + 1 : "–"}</span>
                      <span className="flex-1 text-sm font-medium">{METHODS.find((x) => x.id === m)!.label}</span>
                      <button className="btn-ghost btn-sm" disabled={!on || idx === 0} onClick={() => move(idx, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="btn-ghost btn-sm" disabled={!on || idx === v.strategy.length - 1} onClick={() => move(idx, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <Toggle checked={on} onChange={(x) => set({ strategy: x ? [...v.strategy, m] : v.strategy.filter((s) => s !== m) })} />
                    </li>
                  );
                })}
              </ul>
            );
          }}
        </SettingsSection>
        <SettingsSection section="siteVisits" title="Site visit calendar & capacity">
          {(v, set) => (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Slot (min)"><input type="number" className="input" value={v.slotMinutes} onChange={(e) => set({ slotMinutes: +e.target.value })} /></Field>
                <Field label="First slot hour"><input type="number" className="input" value={v.startHour} onChange={(e) => set({ startHour: +e.target.value })} /></Field>
                <Field label="Last hour"><input type="number" className="input" value={v.endHour} onChange={(e) => set({ endHour: +e.target.value })} /></Field>
                <Field label="Capacity / slot"><input type="number" min={1} className="input" value={v.capacityPerSlot} onChange={(e) => set({ capacityPerSlot: +e.target.value })} /></Field>
              </div>
              <div><span className="label">Visit days</span><DayPicker value={v.days} onChange={(days) => set({ days })} /></div>
              <Field label="Reminders (hours before, comma separated)"><input className="input" value={v.reminderHoursBefore.join(", ")} onChange={(e) => set({ reminderHoursBefore: e.target.value.split(",").map((x) => +x.trim()).filter((x) => !Number.isNaN(x)) })} /></Field>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="whatsapp" title="WhatsApp templates" subtitle="Names must match templates approved in Meta Business Manager. Business-initiated messages outside the 24-hour window always use these templates.">
          {(v, set) => (
            <div className="space-y-3">
              {(Object.keys(v.templates) as (keyof typeof v.templates)[]).map((k) => (
                <Field key={k} label={k.replace(/([A-Z])/g, " $1")}><input className="input font-mono text-xs" value={v.templates[k]} onChange={(e) => set({ templates: { ...v.templates, [k]: e.target.value } })} /></Field>
              ))}
              <Field label="Template language code"><input className="input" value={v.templateLanguage} onChange={(e) => set({ templateLanguage: e.target.value })} /></Field>
              <Toggle checked={v.forceSimulation} onChange={(x) => set({ forceSimulation: x })} label="Force WhatsApp simulation (never send real messages)" />
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="retention" title={"Data retention"} subtitle="Applied hourly by the scheduler in LIVE mode. Individual customers can be erased from their lead profile.">
          {(v, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Keep conversation messages (days)"><input type="number" className="input" value={v.messageRetentionDays} onChange={(e) => set({ messageRetentionDays: +e.target.value })} /></Field>
              <Field label="Keep system logs (days)"><input type="number" className="input" value={v.logRetentionDays} onChange={(e) => set({ logRetentionDays: +e.target.value })} /></Field>
              <p className="muted flex items-center gap-1.5 text-xs sm:col-span-2"><ShieldCheck className="h-3.5 w-3.5" /> Audit logs are kept for accountability and are not auto-deleted.</p>
            </div>
          )}
        </SettingsSection>
      </div>
    </>
  );
}
