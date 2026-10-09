"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const C = { accent: "#2f5d8a", good: "#2e6b4f", warn: "#c2862a", bad: "#a33a2e", muted: "#9aa1ad", grid: "#ecece7" };

function compact(sym: string) {
  return (v: number) => {
    const a = Math.abs(v);
    const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1000 ? `${Math.round(a / 1000)}k` : `${Math.round(a)}`;
    return `${v < 0 ? "−" : ""}${sym}${s}`;
  };
}

export interface MonthDatum {
  label: string;
  earned: number;
  directCost: number;
  invoiced: number;
  collected: number;
  margin: number | null;
}

/** Earned revenue, direct cost and delivery margin by month. */
export function RevenueChart({ data, symbol, title }: { data: MonthDatum[]; symbol: string; title: string }) {
  const fmt = compact(symbol);
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.map((d) => ({ ...d, marginPct: d.margin === null ? null : Math.round(d.margin * 100) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis yAxisId="m" tick={{ fontSize: 11 }} tickFormatter={fmt} width={56} />
            <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={40} domain={[-20, 100]} />
            <Tooltip formatter={(v, name) => (name === "Delivery margin" ? `${v}%` : fmt(Number(v)))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="m" dataKey="earned" name="Earned revenue" fill={C.accent} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="m" dataKey="directCost" name="Direct cost" fill={C.muted} radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" dataKey="marginPct" name="Delivery margin" stroke={C.good} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Earned vs invoiced vs collected by month: three distinct measures. */
export function BillingChart({ data, symbol }: { data: MonthDatum[]; symbol: string }) {
  const fmt = compact(symbol);
  return (
    <figure>
      <figcaption className="sr-only">Earned, invoiced and collected by month</figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={56} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="earned" name="Earned" fill={C.accent} radius={[3, 3, 0, 0]} />
            <Bar dataKey="invoiced" name="Invoiced" fill={C.warn} radius={[3, 3, 0, 0]} />
            <Bar dataKey="collected" name="Collected" fill={C.good} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CashChart({ data, symbol }: { data: { week: string; closing: number; inflows: number; outflows: number }[]; symbol: string }) {
  const fmt = compact(symbol);
  return (
    <figure>
      <figcaption className="sr-only">Weekly closing cash balance forecast</figcaption>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.map((d) => ({ ...d, outflowsNeg: -d.outflows }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={60} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke={C.bad} />
            <Bar dataKey="inflows" name="Inflows" fill={C.good} radius={[3, 3, 0, 0]} />
            <Bar dataKey="outflowsNeg" name="Outflows" fill={C.muted} radius={[0, 0, 3, 3]} />
            <Line dataKey="closing" name="Closing balance" stroke={C.accent} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function UsageChart({ data }: { data: { label: string; active: number | null; seats: number }[] }) {
  return (
    <figure>
      <figcaption className="sr-only">Active seats by month versus licensed seats</figcaption>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="seats" name="Licensed seats" stroke={C.muted} strokeDasharray="4 3" dot={false} />
            <Line dataKey="active" name="Active seats" stroke={C.accent} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function HealthTrend({ data }: { data: { label: string; score: number | null }[] }) {
  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} />
          <Tooltip />
          <Line dataKey="score" name="Health" stroke={C.accent} strokeWidth={2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
