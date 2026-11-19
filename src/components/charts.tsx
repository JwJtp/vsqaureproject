"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

// Brand palette tuned for both themes: champagne gold, navy-slate, and supporting hues.
export const PALETTE = ["#b8913f", "#3b5bdb", "#0ea5a4", "#a855f7", "#e8590c", "#64748b", "#d6336c", "#2f9e44"];

export function TrendChart({ data, keys }: { data: Record<string, unknown>[]; keys: { key: string; label: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={k.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={k.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2} fill={`url(#g-${k.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, labels }: { data: { name: string; value: number }[]; height?: number; labels?: Record<string, string> }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [v as number, labels?.[n as string] ?? n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-2xl font-semibold tabular-nums">{total}</div><div className="muted text-[10px] uppercase tracking-wider">total</div></div>
        </div>
      </div>
      <ul className="scroll-thin w-full space-y-1.5 text-sm" style={{ maxHeight: height, overflow: "auto" }}>
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 truncate"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{labels?.[d.name] ?? d.name}</span>
            <span className="tabular-nums font-medium">{d.value} <span className="muted text-xs">({total ? Math.round((d.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBar({ data, height = 240, color = "#b8913f", valueKey = "value", nameKey = "name" }: { data: Record<string, unknown>[]; height?: number; color?: string; valueKey?: string; nameKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey={nameKey} width={130} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
        <Tooltip cursor={{ fill: "rgba(184,145,63,.08)" }} />
        <Bar dataKey={valueKey} fill={color} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBar({ data, bars, height = 260, xKey = "name" }: { data: Record<string, unknown>[]; bars: { key: string; label: string; color: string }[]; height?: number; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -18, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickFormatter={(v: string) => (String(v).length > 12 ? String(v).slice(0, 11) + "…" : v)} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "rgba(184,145,63,.08)" }} />
        {bars.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[6, 6, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Funnel({ data }: { data: { stage: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const prev = i ? data[i - 1].value : null;
        return (
          <div key={d.stage}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">{d.stage}</span>
              <span className="tabular-nums"><b>{d.value}</b>{prev !== null && <span className="muted"> · {prev ? Math.round((d.value / prev) * 100) : 0}%</span>}</span>
            </div>
            <div className="h-7 overflow-hidden rounded-lg panel-2">
              <div className="h-full rounded-lg transition-all duration-700" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: `linear-gradient(90deg, #0b1222, ${["#1a2541", "#24314f", "#6b5a2e", "#967332", "#b8913f", "#dcc07c"][i] ?? "#b8913f"})` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
