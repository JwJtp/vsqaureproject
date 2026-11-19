"use client";
import { Copy, CheckCircle2, XCircle, Plug } from "lucide-react";
import { PageHeader, Card, useApi, api, useAction, Badge, Skeleton, timeAgo, useToast } from "@/components/ui";

type I = { id: string; name: string; mode: string; configured: { key: string; set: boolean }[]; lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; lastWebhookAt: string | null; setup: string[]; webhookUrl?: string };

export default function Integrations() {
  const { data, mutate } = useApi<{ integrations: I[] }>("/api/integrations");
  const { run, busy } = useAction();
  const toast = useToast();
  return (
    <>
      <PageHeader eyebrow="Connections" title="Integrations" subtitle="Credentials are read from server-side environment variables only and never sent to the browser. Missing credentials put that integration in an explicit DEMO MODE." />
      {!data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.integrations.map((i) => (
            <Card key={i.id} title={<span className="flex items-center gap-2"><Plug className="gold h-4 w-4" />{i.name}</span>} action={<Badge tone={i.mode === "live" ? "green" : i.mode === "demo" ? "gold" : "gray"}>{i.mode === "live" ? "LIVE" : i.mode === "demo" ? "DEMO MODE" : "not configured"}</Badge>}>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-1.5">{i.configured.map((c) => <span key={c.key} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] hairline">{c.set ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-slate-400" />}{c.key}</span>)}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl p-2 panel-2"><div className="muted">Last success</div>{timeAgo(i.lastSuccessAt)}</div>
                  <div className="rounded-xl p-2 panel-2"><div className="muted">Last webhook</div>{timeAgo(i.lastWebhookAt)}</div>
                  <div className="rounded-xl p-2 panel-2"><div className="muted">Last error</div>{i.lastErrorAt ? timeAgo(i.lastErrorAt) : "none"}</div>
                </div>
                {i.lastError && <p className="rounded-xl bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{i.lastError}</p>}
                {i.webhookUrl && (
                  <div><span className="label">Webhook / endpoint URL</span>
                    <div className="flex gap-2"><code className="input truncate font-mono text-xs">{i.webhookUrl}</code><button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(i.webhookUrl!); toast("ok", "Copied"); }} aria-label="Copy"><Copy className="h-3.5 w-3.5" /></button></div>
                  </div>
                )}
                <div><span className="label">Setup</span><ol className="muted list-decimal space-y-1 pl-4 text-xs">{i.setup.map((s) => <li key={s}>{s}</li>)}</ol></div>
                {["openai", "whatsapp", "supabase"].includes(i.id) && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => { const r = await api<{ ok: boolean; detail: string }>("/api/integrations", { method: "POST", json: { id: i.id } }); mutate(); if (!r.ok) throw new Error(r.detail); return r; }, "Connection OK")}>Test connection</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
