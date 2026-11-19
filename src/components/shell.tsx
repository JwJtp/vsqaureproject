"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Bot, MessagesSquare, Users, KanbanSquare, UserCog, Building2, CalendarDays, BellRing, BarChart3,
  BookOpen, PlugZap, SlidersHorizontal, ScrollText, Settings, Menu, X, Moon, Sun, LogOut, FlaskConical, Briefcase,
} from "lucide-react";
import { cx, api, Badge } from "./ui";
import type { SessionUser } from "@/lib/types";

export const NAV = [
  { href: "/dashboard", label: "Overview Dashboard", icon: LayoutDashboard },
  { href: "/agent", label: "AI Sales Agent", icon: Bot },
  { href: "/conversations", label: "Live Conversations", icon: MessagesSquare },
  { href: "/leads", label: "All Leads", icon: Users },
  { href: "/pipeline", label: "Lead Pipeline", icon: KanbanSquare },
  { href: "/executives", label: "Executive Management", icon: UserCog },
  { href: "/projects", label: "Project Management", icon: Building2 },
  { href: "/site-visits", label: "Site Visits", icon: CalendarDays },
  { href: "/followups", label: "Follow-up Automation", icon: BellRing },
  { href: "/analytics", label: "Analytics & Reports", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/ai-settings", label: "AI Agent Settings", icon: SlidersHorizontal },
  { href: "/logs", label: "System Logs", icon: ScrollText },
  { href: "/admin", label: "Admin Settings", icon: Settings },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d6b16a]/40 bg-gradient-to-br from-[#1a2541] to-[#070b16] shadow-inner">
        <span className="h-display text-[22px] leading-none text-[#e9d6a7]">V²</span>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-[.18em] text-white">V SQUARE PROJECTS</div>
          <div className="text-[10px] font-semibold tracking-[.22em] text-[#d6b16a]">AI SALES COMMAND CENTER</div>
        </div>
      )}
    </div>
  );
}

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("vs-theme", next ? "dark" : "light"); } catch { /* storage unavailable */ }
  };
  return { dark, toggle };
}

export function ModeBanner({ mode, ai, whatsapp }: { mode: string; ai: string; whatsapp: string }) {
  if (mode === "live" && ai === "live" && whatsapp === "live") return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-[#b8913f] via-[#dcc07c] to-[#b8913f] px-4 py-1.5 text-center text-[11px] font-semibold text-[#0b1222]">
      <FlaskConical className="h-3.5 w-3.5" />
      {mode === "demo" ? "DEMO MODE — fictional seed data, in-memory database, nothing is sent to real customers." : "LIVE DATA"}
      <span>· AI: {ai === "live" ? "OpenAI (live)" : "simulator"}</span>
      <span>· WhatsApp: {whatsapp === "live" ? "Cloud API (live)" : "simulated"}</span>
    </div>
  );
}

export function RoleSwitcher({ executives, current }: { executives: { id: string; name: string }[]; current: SessionUser }) {
  const router = useRouter();
  const value = current.role === "executive" ? `exec:${current.executiveId}` : "admin";
  return (
    <select
      aria-label="Demo role"
      className="input !w-auto max-w-[130px] !py-1.5 text-xs sm:max-w-none"
      value={value}
      onChange={async (e) => {
        await api("/api/auth/demo-role", { method: "POST", json: { role: e.target.value } });
        router.push(e.target.value === "admin" ? "/dashboard" : "/portal");
        router.refresh();
      }}
    >
      <option value="admin">View as: Admin</option>
      {executives.map((x) => <option key={x.id} value={`exec:${x.id}`}>View as: {x.name} (executive)</option>)}
    </select>
  );
}

export function Shell({ user, mode, ai, whatsapp, executives, children, portal }: { user: SessionUser; mode: string; ai: string; whatsapp: string; executives: { id: string; name: string }[]; children: ReactNode; portal?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useTheme();
  useEffect(() => { setOpen(false); }, [path]);
  const nav = portal ? [{ href: "/portal", label: "My Portal", icon: Briefcase }] : NAV;

  const signOut = async () => {
    await api("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <ModeBanner mode={mode} ai={ai} whatsapp={whatsapp} />
      <div className="flex">
        {/* Sidebar */}
        <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-[#070b16] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <Logo />
            <button className="text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          <div className="mx-5 mb-3 h-px bg-gradient-to-r from-transparent via-[#d6b16a]/40 to-transparent" />
          <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main">
            {nav.map((n, i) => {
              const active = path === n.href || path.startsWith(n.href + "/");
              return (
                <Link key={n.href} href={n.href} className={cx("nav-link", active && "active")}>
                  <n.icon className={cx("h-4 w-4 shrink-0", active ? "text-[#d6b16a]" : "text-slate-500")} />
                  <span className="truncate">{portal ? n.label : `${i + 1}. ${n.label}`}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/5 px-5 py-4 text-[10px] tracking-wider text-slate-500">
            Powered by <span className="font-semibold text-[#d6b16a]">NEXOBOVA HQ</span>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

        {/* Main */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur hairline md:px-8" style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}>
            <button className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-4 w-4" /></button>
            <div className="hidden text-xs sm:block">
              <span className="muted">V Square Projects</span> <span className="gold">/</span> <span className="font-medium">{(nav.find((n) => path.startsWith(n.href))?.label ?? "").replace(/^\d+\.\s*/, "")}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {mode === "demo" && <RoleSwitcher executives={executives} current={user} />}
              <span className="hidden sm:inline-flex">{mode === "demo" ? <Badge tone="gold">DEMO</Badge> : <Badge tone="green">LIVE</Badge>}</span>
              <button className="btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
              <div className="hidden items-center gap-2 pl-1 md:flex">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#e9d6a7] to-[#b8913f] text-xs font-bold text-[#0b1222]">{user.name.slice(0, 1)}</div>
                <div className="leading-tight">
                  <div className="text-xs font-semibold">{user.name}</div>
                  <div className="muted text-[10px] uppercase tracking-wider">{user.role}</div>
                </div>
              </div>
              {mode === "live" && <button className="btn-ghost btn-sm" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>}
            </div>
          </header>
          <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
