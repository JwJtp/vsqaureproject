"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ShieldCheck, UserCog, Briefcase } from "lucide-react";
import { Logo } from "@/components/shell";
import { api, Spinner } from "@/components/ui";

export function LoginForm({ mode, executives, supabaseUrl, anonKey }: { mode: string; executives: { id: string; name: string }[]; supabaseUrl: string; anonKey: string }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const demo = async (role: string) => {
    setBusy(true);
    await api("/api/auth/demo-role", { method: "POST", json: { role } });
    router.push(role === "admin" ? "/dashboard" : "/portal");
    router.refresh();
  };
  const live = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const sb = createBrowserClient(supabaseUrl, anonKey);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.push(next && next.startsWith("/") ? next : "/");
    router.refresh();
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#070b16] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#d6b16a]/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[420px] w-[420px] rounded-full bg-[#3b5bdb]/10 blur-3xl" />
        <Logo />
        <div className="relative">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[.3em] text-[#d6b16a]">Plots · Villas · Apartments</p>
          <h1 className="h-display max-w-lg text-5xl leading-[1.05] text-white">Every enquiry answered. Every lead in the right hands.</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">An AI sales agent that speaks English and Kannada, qualifies buyers, routes them to your executives and books site visits — with your team in full control.</p>
        </div>
        <p className="text-[11px] tracking-wider text-slate-500">Developed by <span className="font-semibold text-[#d6b16a]">NEXOBOVA HQ</span></p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 rounded-2xl bg-[#070b16] p-4 lg:hidden"><Logo /></div>
          <h2 className="h-display text-3xl">Sign in</h2>
          {mode === "demo" ? (
            <>
              <p className="muted mt-1 text-sm">DEMO MODE — no credentials needed. Choose a view:</p>
              <div className="mt-6 space-y-2.5">
                <button disabled={busy} onClick={() => demo("admin")} className="card flex w-full items-center gap-3 p-4 text-left transition hover:-translate-y-0.5">
                  <ShieldCheck className="gold h-5 w-5" />
                  <div><div className="text-sm font-semibold">Admin — Command Center</div><div className="muted text-xs">Dashboard, AI agent, leads, settings</div></div>
                </button>
                {executives.slice(0, 4).map((e) => (
                  <button key={e.id} disabled={busy} onClick={() => demo(`exec:${e.id}`)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:-translate-y-0.5">
                    <Briefcase className="muted h-5 w-5" />
                    <div><div className="text-sm font-semibold">{e.name}</div><div className="muted text-xs">Executive portal — only their own leads</div></div>
                  </button>
                ))}
              </div>
              {busy && <div className="mt-4 flex items-center gap-2 text-sm"><Spinner /> Opening…</div>}
            </>
          ) : (
            <form onSubmit={live} className="mt-6 space-y-4">
              <label className="block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="block"><span className="label">Password</span><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : <UserCog className="h-4 w-4" />} Sign in</button>
              <p className="muted text-xs">Accounts are created by an administrator in Supabase Auth.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
