import { describe, expect, it } from "vitest";
import { buildDataset } from "@/data/dataset";
import { emptyOverlay } from "@/data/state";
import { AGING_BUCKETS, cashForecast, monthlySeries, periodSummary, receivables, reportingPeriods, revenueConcentration } from "@/lib/calc/company";
import { ws } from "./helpers";

describe.each(["agency", "cpg_branding", "media", "saas", "enterprise"] as const)("%s totals reconcile", (profile) => {
  const ds = buildDataset(profile, emptyOverlay());
  const periods = reportingPeriods(ds);

  it.each(periods.map((p) => [p.key, p] as const))("period %s: lines sum to totals", (_k, period) => {
    const s = periodSummary(ds, period);
    const client = s.lines.filter((l) => ds.projects.find((p) => p.id === l.projectId)?.kind === "client");
    expect(client.reduce((x, l) => x + (l.earned ?? 0), 0)).toBeCloseTo(s.projectRevenue, 4);
    expect(client.reduce((x, l) => x + l.labor + l.contractor + l.expenses, 0)).toBeCloseTo(s.clientDirectCost, 4);
    expect(s.earnedRevenue).toBeCloseTo(s.projectRevenue + s.subscriptionRevenue, 4);
    // Payroll is counted once.
    expect(s.payroll).toBeCloseTo(s.absorbedEmployeeLabor + s.nonClientLabor, 4);
    expect(s.operatingResult).toBeCloseTo(s.earnedRevenue - s.clientDirectCost - s.nonClientLabor - s.internalContractorAndExpenses - s.overhead, 4);
  });

  it("monthly series sums to the six-month period", () => {
    const six = periodSummary(ds, periods.find((p) => p.key === "six")!);
    const months = monthlySeries(ds, 6);
    expect(months.reduce((x, m) => x + m.earned, 0)).toBeCloseTo(six.earnedRevenue, 2);
    expect(months.reduce((x, m) => x + m.invoiced, 0)).toBeCloseTo(six.invoiced, 2);
    expect(months.reduce((x, m) => x + m.collected, 0)).toBeCloseTo(six.collected, 2);
  });

  it("aging buckets sum to total outstanding", () => {
    const ar = receivables(ds);
    expect(AGING_BUCKETS.reduce((x, b) => x + ar.buckets[b], 0)).toBeCloseTo(ar.totalOutstanding, 4);
    expect(ar.overdue.every((s) => s.daysOverdue > 0)).toBe(true);
  });

  it("concentration shares sum to 1", () => {
    const c = revenueConcentration(ds, periods[1]);
    if (c.total > 0) expect(c.rows.reduce((x, r) => x + r.share, 0)).toBeCloseTo(1, 6);
  });

  it("cash forecast rolls forward week by week", () => {
    const f = cashForecast(ds);
    let bal = f.opening.amount;
    for (const w of f.weeks) {
      expect(w.opening).toBeCloseTo(bal, 4);
      bal = w.opening + w.inflows - w.outflows;
      expect(w.closing).toBeCloseTo(bal, 4);
    }
  });
});

describe("agency cross-checks", () => {
  const ds = buildDataset("agency", emptyOverlay());
  it("invoices more than 60 days overdue are excluded from base-case cash, and included on request", () => {
    const base = cashForecast(ds);
    expect(base.excluded.length).toBeGreaterThan(0);
    const all = cashForecast(ds, { ...base.assumptions, excludeOverdueBeyondDays: null });
    expect(all.excluded).toHaveLength(0);
    expect(all.totals.inflows).toBeGreaterThan(base.totals.inflows);
  });
  it("opportunity estimates never enter revenue or cash", () => {
    const w = ws("agency", "executive");
    const estimated = w.analysis.opportunities.filter((o) => o.estimatedValue).reduce((x, o) => x + (o.estimatedValue ?? 0), 0);
    expect(estimated).toBeGreaterThan(0);
    const cash = w.finance!.cash!;
    expect(cash.weeks.flatMap((x) => x.items).some((i) => /opportunit|expansion/i.test(i.label))).toBe(false);
  });
  it("account and project stories agree: every margin alert matches its project's forecast", () => {
    const w = ws("agency", "executive");
    for (const item of w.analysis.attention.filter((i) => i.kind === "margin" && i.projectId)) {
      const f = w.analysis.projectFin[item.projectId!];
      if (f.margin.forecastAtCompletion !== null) expect(item.title).toContain(`${(f.margin.forecastAtCompletion * 100).toFixed(0)}%`);
    }
  });
  it("Lumen (missing data) is insufficient, not healthy", () => {
    const w = ws("agency", "executive");
    expect(w.analysis.health["a_lumen"].status).toBe("insufficient");
    expect(w.analysis.attention.some((i) => i.kind === "data" && i.accountId === "a_lumen")).toBe(true);
  });
  it("Brightwater renewal risk is the top critical item", () => {
    const w = ws("agency", "executive");
    expect(w.analysis.attention[0].kind).toBe("renewal");
    expect(w.analysis.attention[0].accountId).toBe("a_brightwater");
  });
});
