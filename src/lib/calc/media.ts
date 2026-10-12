import type { Dataset, ID, ISODate, MediaFlight } from "@/domain/types";
import { addDays, daysBetween, fmtDate, maxDate, minDate } from "@/lib/dates";

/**
 * Media pacing. Each flight is planned to spend its budget evenly across its dates; pacing compares
 * platform-reported spend with that plan up to the last reported week. The projection assumes the
 * recent run rate (last two reported weeks) continues to the end of the flight. KPI performance uses
 * the last four reported weeks, so it reflects how the flight is doing now, not in its first month.
 *
 * Thresholds (documented on the calculations page):
 *  - over pace: projected spend more than 5% over budget, or spend to date more than 10% ahead of plan
 *  - under pace: projected spend more than 10% under budget
 *  - KPI behind: recent CPA or ROAS more than 10% worse than target
 *  - no data: the flight has started but nothing was reported in the last 14 days
 */

export type PacingStatus = "not_started" | "on_pace" | "over" | "under" | "no_data" | "ended";
export type KpiStatus = "ahead" | "on_target" | "behind" | null;

export interface FlightPacing {
  flight: MediaFlight;
  status: PacingStatus;
  /** Last day covered by reported spend (Sunday of the last reported week), or null. */
  dataThrough: ISODate | null;
  spent: number;
  expected: number;
  /** spent / expected, or null before any plan accrues. */
  pacing: number | null;
  projected: number;
  /** (projected − budget) / budget */
  projectedVariance: number;
  kpiRecent: number | null;
  kpiToDate: number | null;
  /** Relative to target, positive is better for either metric. */
  kpiGap: number | null;
  kpiStatus: KpiStatus;
  /** Plain-language reason for the status. */
  summary: string;
}

const kpiValue = (metric: MediaFlight["kpi"]["metric"], spend: number, conversions: number, revenue: number): number | null => {
  if (metric === "CPA") return conversions > 0 ? spend / conversions : null;
  return spend > 0 ? revenue / spend : null;
};

export const fmtKpi = (metric: MediaFlight["kpi"]["metric"], v: number | null, symbol = "$") => (v === null ? "—" : metric === "CPA" ? `${symbol}${v.toFixed(2)}` : `${v.toFixed(2)}x`);

export function flightPacing(f: MediaFlight, asOf: ISODate): FlightPacing {
  const weeks = [...f.weeks].sort((a, b) => (a.week < b.week ? -1 : 1));
  const spent = weeks.reduce((s, w) => s + w.spend, 0);
  const last = weeks.at(-1);
  const dataThrough = last ? minDate(addDays(last.week, 6), f.end) : null;
  const totalDays = daysBetween(f.start, f.end) + 1;
  const cutoff = dataThrough ?? addDays(f.start, -1);
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(f.start, cutoff) + 1));
  const expected = (f.budget * elapsed) / totalDays;
  const recent = weeks.slice(-2);
  const recentDays = recent.reduce((s, w) => s + daysBetween(maxDate(w.week, f.start), minDate(addDays(w.week, 6), f.end)) + 1, 0);
  const runRate = recentDays > 0 ? recent.reduce((s, w) => s + w.spend, 0) / recentDays : 0;
  const remaining = Math.max(0, totalDays - elapsed);
  const projected = spent + runRate * remaining;
  const projectedVariance = f.budget > 0 ? (projected - f.budget) / f.budget : 0;

  const last4 = weeks.slice(-4);
  const sum = (xs: typeof weeks, k: "spend" | "conversions" | "revenue") => xs.reduce((s, w) => s + w[k], 0);
  const kpiRecent = kpiValue(f.kpi.metric, sum(last4, "spend"), sum(last4, "conversions"), sum(last4, "revenue"));
  const kpiToDate = kpiValue(f.kpi.metric, spent, sum(weeks, "conversions"), sum(weeks, "revenue"));
  const kpiGap = kpiRecent === null ? null : f.kpi.metric === "CPA" ? (f.kpi.target - kpiRecent) / f.kpi.target : (kpiRecent - f.kpi.target) / f.kpi.target;
  const kpiStatus: KpiStatus = kpiGap === null ? null : kpiGap >= 0.05 ? "ahead" : kpiGap < -0.1 ? "behind" : "on_target";
  const pacing = expected > 0 ? spent / expected : null;

  let status: PacingStatus;
  let summary: string;
  const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
  if (f.start > asOf) {
    status = "not_started";
    summary = `Starts ${fmtDate(f.start)}`;
  } else if (!dataThrough || daysBetween(dataThrough, minDate(asOf, f.end)) > 14) {
    status = "no_data";
    summary = dataThrough ? `No spend reported since ${fmtDate(dataThrough)}` : "No spend reported since the flight started";
  } else if (f.end < asOf && dataThrough >= f.end) {
    status = "ended";
    summary = `Ended; spent ${pct(spent / f.budget)} of budget`;
  } else if (projectedVariance > 0.05 || (pacing !== null && pacing > 1.1)) {
    status = "over";
    summary = `Spending ahead of plan: projected ${pct(projectedVariance)} over budget at the current run rate`;
  } else if (projectedVariance < -0.1) {
    status = "under";
    summary = `Spending behind plan: projected ${pct(projectedVariance)} of budget left unspent at the current run rate`;
  } else {
    status = "on_pace";
    summary = "On pace";
  }
  return { flight: f, status, dataThrough, spent, expected, pacing, projected, projectedVariance, kpiRecent, kpiToDate, kpiGap, kpiStatus, summary };
}

export function mediaPacing(ds: Dataset, asOf: ISODate = ds.org.demoDate): Record<ID, FlightPacing> {
  return Object.fromEntries(ds.mediaFlights.map((f) => [f.id, flightPacing(f, asOf)]));
}

/** Flights that need someone to act: off pace, behind on KPI, or without recent data. */
export function needsAttention(p: FlightPacing): boolean {
  if (p.status === "not_started" || p.status === "ended") return false;
  return p.status !== "on_pace" || p.kpiStatus === "behind";
}
