"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { Card, useApi, api, useAction } from "./ui";
import type { AppSettings } from "@/lib/settings";

export function useSettings() {
  return useApi<{ settings: AppSettings; defaults: AppSettings }>("/api/settings");
}

/** Edits one settings section with local draft state + save button. */
export function SettingsSection<S extends keyof AppSettings>({ section, title, subtitle, children }: { section: S; title: string; subtitle?: string; children: (v: AppSettings[S], set: (patch: Partial<AppSettings[S]>) => void) => ReactNode }) {
  const { data, mutate } = useSettings();
  const [draft, setDraft] = useState<AppSettings[S] | null>(null);
  const { run, busy } = useAction();
  useEffect(() => { if (data && !draft) setDraft(structuredClone(data.settings[section])); }, [data, draft, section]);
  if (!draft || !data) return <Card title={title}><div className="skeleton h-32" /></Card>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings[section]);
  return (
    <Card title={title} subtitle={subtitle} action={<button className="btn-primary btn-sm" disabled={!dirty || busy} onClick={() => run(async () => { const r = await api<{ settings: AppSettings }>("/api/settings", { method: "PUT", json: { section, value: draft } }); await mutate(); setDraft(structuredClone(r.settings[section])); }, `${title} saved`)}><Save className="h-3.5 w-3.5" /> Save</button>}>
      {children(draft, (p) => setDraft({ ...draft, ...p }))}
    </Card>
  );
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map((d, i) => (
        <button type="button" key={d} onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())} className={`rounded-lg border px-2.5 py-1 text-xs hairline ${value.includes(i) ? "border-[var(--gold)] bg-[var(--gold-soft)] font-semibold" : ""}`}>{d}</button>
      ))}
    </div>
  );
}
