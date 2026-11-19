"use client";
import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw, Bot } from "lucide-react";
import { api, cx, Spinner } from "./ui";

export interface ChatLead {
  name: string | null; phone: string | null; property_type: string | null; preferred_location: string | null; budget_text: string | null;
  budget_max: number | null; configuration: string | null; purpose: string | null; timeline: string | null; site_visit_preference: string | null;
  score: number; priority: string; score_reasons: string[]; status: string; language: string | null;
}
type Msg = { id: string; direction: "in" | "out"; body: string; pending?: boolean };

function newSession() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return "web_" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ChatWidget({ storageKey = "vs-chat-session", onLead, compact, suggestions }: { storageKey?: string; onLead?: (l: ChatLead, meta: { escalated: boolean; provider: string | null; intent: string | null }) => void; compact?: boolean; suggestions?: string[] }) {
  const [session, setSession] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let s: string | null = null;
    try { s = sessionStorage.getItem(storageKey); } catch { /* storage unavailable */ }
    if (!s) {
      s = newSession();
      try { sessionStorage.setItem(storageKey, s); } catch { /* storage unavailable */ }
    }
    setSession(s);
    api<{ messages: Msg[] }>(`/api/chat?sessionId=${s}`).then((r) => setMsgs(r.messages)).catch(() => {});
  }, [storageKey]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  const send = async (t: string) => {
    if (!t.trim() || !session || busy) return;
    const id = crypto.randomUUID().slice(0, 18);
    setMsgs((m) => [...m, { id, direction: "in", body: t }]);
    setText("");
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ reply: string | null; lead: ChatLead; escalated: boolean; provider: string | null; intent: string | null; handledBy: string }>("/api/chat", { method: "POST", json: { sessionId: session, text: t, clientMessageId: id } });
      if (r.reply) setMsgs((m) => [...m, { id: id + "-r", direction: "out", body: r.reply! }]);
      else if (r.handledBy === "human") setMsgs((m) => [...m, { id: id + "-h", direction: "out", body: "✓ Message received — a V Square team member will reply here shortly." }]);
      onLead?.(r.lead, { escalated: r.escalated, provider: r.provider, intent: r.intent });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    const s = newSession();
    try { sessionStorage.setItem(storageKey, s); } catch { /* storage unavailable */ }
    setSession(s);
    setMsgs([]);
    setErr(null);
  };

  return (
    <div className={cx("flex flex-col overflow-hidden", compact ? "h-full" : "card h-[620px]")}>
      <div className="flex items-center gap-3 bg-gradient-to-r from-[#070b16] to-[#1a2541] px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-[#d6b16a]/40 bg-[#0b1222]"><Bot className="h-4 w-4 text-[#e9d6a7]" /></div>
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold">V Square Projects</div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Property assistant · English / ಕನ್ನಡ</div>
        </div>
        <button onClick={reset} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10" aria-label="New conversation" title="Start a new customer session"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4" style={{ background: "var(--panel-2)" }} aria-live="polite">
        {!msgs.length && (
          <div className="muted py-6 text-center text-sm">
            <p className="font-medium" style={{ color: "var(--text)" }}>Namaskara! 🙏</p>
            <p>Type like a customer would — in English, Kannada or a mix.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cx("flex", m.direction === "in" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.direction === "in" ? "rounded-br-md bg-[#0b1222] text-white dark:bg-[#d6b16a] dark:text-[#0b1222]" : "rounded-bl-md border hairline")} style={m.direction === "out" ? { background: "var(--panel)" } : undefined}>
              {m.body}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs muted"><Spinner className="h-3 w-3" /> Assistant is typing…</div>}
        {err && <div className="rounded-xl bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{err}</div>}
        <div ref={end} />
      </div>
      {suggestions && !msgs.length && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2 hairline">
          {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs hairline hover:border-[var(--gold)]">{s}</button>)}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t p-3 hairline" style={{ background: "var(--panel)" }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" maxLength={2000} />
        <button className="btn-primary" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
      <p className="muted px-3 pb-2 text-center text-[10px]" style={{ background: "var(--panel)" }}>By chatting you agree to be contacted about your enquiry. Type STOP to opt out.</p>
    </div>
  );
}
