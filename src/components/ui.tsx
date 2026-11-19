"use client";
import { clsx } from "clsx";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X, Loader2, Inbox, CheckCircle2, AlertTriangle } from "lucide-react";
import useSWR, { type SWRConfiguration } from "swr";

export const cx = clsx;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: unknown) {
    super(message);
  }
}
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status, data);
  return data as T;
}
export function useApi<T>(url: string | null, cfg?: SWRConfiguration) {
  return useSWR<T>(url, (u: string) => api<T>(u), { revalidateOnFocus: true, ...cfg });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="card flex animate-fadeUp items-start gap-2.5 px-4 py-3 text-sm">
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an action with toast feedback; returns result or null on error. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        if (okText) toast("ok", okText);
        return r;
      } catch (e) {
        toast("err", (e as Error).message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export function Card({ className, children, title, action, subtitle }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className={cx("card animate-fadeUp", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b px-5 py-3.5 hairline">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="muted mt-0.5 text-xs">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={title || action ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="gold mb-1 text-[11px] font-semibold uppercase tracking-[.2em]">{eyebrow}</div>}
        <h1 className="h-display text-3xl md:text-[34px]">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  gold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  navy: "bg-[#0b1222] text-[#e9d6a7] dark:bg-[#1a2541]",
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = "gray", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("badge", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  NEW: "blue", QUALIFIED: "violet", ASSIGNED: "gold", CONTACTED: "gold", FOLLOW_UP: "gray", SITE_VISIT_SCHEDULED: "blue",
  SITE_VISIT_COMPLETED: "violet", NEGOTIATION: "gold", CONVERTED: "green", LOST: "red",
};
export const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{statusLabel(status)}</Badge>;
}
export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priority === "hot" ? "red" : priority === "warm" ? "gold" : "gray"}>{priority}</Badge>;
}
export const SOURCE_LABEL: Record<string, string> = {
  website_chat: "Website chat", website_form: "Website form", whatsapp: "WhatsApp", facebook_lead: "Facebook", instagram: "Instagram", webhook: "Webhook", manual: "Manual",
};

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin", className)} />;
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--gold-soft)" }}>
        {icon ?? <Inbox className="gold h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="muted mt-1 max-w-sm text-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx("card flex max-h-[92vh] w-full animate-fadeUp flex-col rounded-b-none sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4 hairline">
          <h2 className="h-display text-xl">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3.5 hairline">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-[11px]">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm disabled:opacity-50">
      <span className={cx("relative h-5 w-9 rounded-full transition", checked ? "bg-[var(--gold)]" : "bg-slate-300 dark:bg-slate-700")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border p-1 hairline" style={{ background: "var(--panel)" }} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cx("rounded-lg px-3 py-1.5 text-xs font-semibold transition", value === t.value ? "bg-[var(--navy)] text-[#e9d6a7] dark:bg-[var(--gold)] dark:text-[#0b1222]" : "muted hover:text-[var(--text)]")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, hint, icon, tone = "navy", loading, onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "navy" | "gold" | "green" | "red" | "blue"; loading?: boolean; onClick?: () => void }) {
  const ring = { navy: "from-[#1a2541] to-[#0b1222] text-[#e9d6a7]", gold: "from-[#e9d6a7] to-[#b8913f] text-[#0b1222]", green: "from-emerald-400 to-emerald-600 text-white", red: "from-rose-400 to-rose-600 text-white", blue: "from-sky-400 to-sky-600 text-white" }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="card group relative overflow-hidden p-4 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-default">
      <div className="flex items-start justify-between gap-2">
        <span className="muted text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        {icon && <span className={cx("grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br shadow-sm", ring)}>{icon}</span>}
      </div>
      <div className="mt-2 text-[28px] font-semibold tabular-nums leading-none">{loading ? <Skeleton className="h-7 w-16" /> : value}</div>
      {hint && <div className="muted mt-1.5 text-xs">{hint}</div>}
    </button>
  );
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.round(f / 60)}m`;
    if (f < 86400) return `in ${Math.round(f / 3600)}h`;
    return `in ${Math.round(f / 86400)}d`;
  }
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function inr(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
export function phoneFmt(p: string | null | undefined) {
  if (!p) return "—";
  return p.startsWith("91") && p.length === 12 ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`;
}
