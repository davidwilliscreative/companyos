"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Categorical slots in fixed order (validated for colour-vision deficiency), plus recessive chart chrome. */
const C = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", ink: "#0e1015", muted: "#a6aab5", grid: "#eeeef2", axis: "#7c8190", bad: "#be123c" };
const AXIS = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;
const TOOLTIP = {
  contentStyle: { borderRadius: 12, border: "1px solid #e7e7ec", boxShadow: "0 8px 24px -8px rgba(14,16,21,0.18)", fontSize: 12, padding: "8px 12px" },
  labelStyle: { color: C.ink, fontWeight: 600, marginBottom: 4 },
  cursor: { fill: "rgba(14,16,21,0.04)" },
} as const;
const LEGEND = { wrapperStyle: { fontSize: 12, paddingTop: 8 }, iconType: "circle" as const, iconSize: 8 };

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

/** Earned revenue vs direct cost by month, with delivery margin as its own small chart (one axis each). */
export function RevenueChart({ data, symbol, title, stacked = false, labels = { earned: "Earned revenue", directCost: "Direct cost", margin: "Delivery margin" } }: { data: MonthDatum[]; symbol: string; title: string; stacked?: boolean; labels?: { earned: string; directCost: string; margin: string } }) {
  const fmt = compact(symbol);
  const margins = data.map((d) => ({ label: d.label, marginPct: d.margin === null ? null : Math.round(d.margin * 100) }));
  const hasMargin = margins.some((m) => m.marginPct !== null);
  return (
    <div className={`grid gap-6 ${stacked ? "" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"}`}>
      <figure>
        <figcaption className="mb-2 text-[13px] font-medium text-ink-soft">{title}</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" {...AXIS} tickFormatter={(v: string) => v.slice(0, 3)} />
              <YAxis {...AXIS} tickFormatter={fmt} width={56} />
              <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} />
              <Legend {...LEGEND} />
              <Bar dataKey="earned" name={labels.earned} fill={C.s1} radius={[4, 4, 0, 0]} />
              <Bar dataKey="directCost" name={labels.directCost} fill={C.s2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      {hasMargin && (
        <figure>
          <figcaption className="mb-2 text-[13px] font-medium text-ink-soft">{labels.margin}</figcaption>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={margins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...AXIS} tickFormatter={(v: string) => v.slice(0, 3)} />
                <YAxis {...AXIS} tickFormatter={(v: number) => `${v}%`} width={52} domain={[0, 100]} />
                <Tooltip {...TOOLTIP} cursor={{ stroke: C.muted, strokeDasharray: "3 3" }} formatter={(v) => [`${v}%`, labels.margin]} />
                <Line dataKey="marginPct" name={labels.margin} stroke={C.ink} strokeWidth={2} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </div>
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
            <XAxis dataKey="label" {...AXIS} tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis {...AXIS} tickFormatter={fmt} width={56} />
            <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} />
            <Legend {...LEGEND} />
            <Bar dataKey="earned" name="Earned" fill={C.s1} radius={[4, 4, 0, 0]} />
            <Bar dataKey="invoiced" name="Invoiced" fill={C.s2} radius={[4, 4, 0, 0]} />
            <Bar dataKey="collected" name="Collected" fill={C.s3} radius={[4, 4, 0, 0]} />
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
            <XAxis dataKey="week" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmt} width={60} />
            <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} />
            <Legend {...LEGEND} />
            <ReferenceLine y={0} stroke={C.bad} strokeDasharray="4 3" />
            <Bar dataKey="inflows" name="Inflows" fill={C.s1} radius={[4, 4, 0, 0]} />
            <Bar dataKey="outflowsNeg" name="Outflows" fill={C.s2} radius={[0, 0, 4, 4]} />
            <Line dataKey="closing" name="Closing balance" stroke={C.ink} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip {...TOOLTIP} />
            <Legend {...LEGEND} />
            <Line dataKey="seats" name="Licensed seats" stroke={C.muted} strokeWidth={2} strokeDasharray="4 3" dot={false} />
            <Line dataKey="active" name="Active seats" stroke={C.s1} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
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
          <XAxis dataKey="label" {...AXIS} tick={{ fontSize: 10, fill: C.axis }} />
          <YAxis domain={[0, 100]} {...AXIS} tick={{ fontSize: 10, fill: C.axis }} width={28} />
          <Tooltip {...TOOLTIP} />
          <Line dataKey="score" name="Health" stroke={C.s1} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
