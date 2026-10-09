import { describe, expect, it } from "vitest";
import { buildDataset } from "@/data/dataset";
import { emptyOverlay } from "@/data/state";
import { deliveryMargin, fixedFeeValue, hourlyLaborCost, projectFinancials, utilization } from "@/lib/calc/finance";
import { runScenario, defaultInputs, type ScenarioBase } from "@/lib/calc/scenario";
import { convert, fmtMoney, fmtPct } from "@/lib/money";
import { invoiceStatus } from "@/lib/calc/company";

const org = { annualWorkingHours: 1800 };

describe("labor cost", () => {
  it("loads salary and employer costs over working hours and FTE", () => {
    const rec = { id: "c", orgId: "o", personId: "p", effectiveFrom: "2026-01-01", annualSalary: 90_000, annualEmployerCosts: 18_000, currency: "USD" as const, source: { system: "seed" as const } };
    expect(hourlyLaborCost(rec, { type: "employee", fte: 1 }, org)).toBeCloseTo(60);
    expect(hourlyLaborCost(rec, { type: "employee", fte: 0.5 }, org)).toBeCloseTo(120);
  });
  it("returns null, not zero, when compensation is missing", () => {
    expect(hourlyLaborCost(undefined, { type: "employee", fte: 1 }, org)).toBeNull();
  });
  it("uses hourly cost for contractors", () => {
    const rec = { id: "c", orgId: "o", personId: "p", effectiveFrom: "2026-01-01", hourlyCost: 95, currency: "USD" as const, source: { system: "seed" as const } };
    expect(hourlyLaborCost(rec, { type: "contractor", fte: 1 }, org)).toBe(95);
  });
});

describe("margins and ratios", () => {
  it("does not divide by zero revenue", () => {
    expect(deliveryMargin(0, 1000)).toBeNull();
    expect(deliveryMargin(null, 1000)).toBeNull();
    expect(deliveryMargin(1000, 1200)).toBeCloseTo(-0.2);
  });
  it("returns null utilization with no available hours", () => {
    expect(utilization(10, 0)).toBeNull();
    expect(utilization(30, 40)).toBeCloseTo(0.75);
  });
  it("formats missing and negative values honestly", () => {
    expect(fmtMoney(null, "USD")).toBe("—");
    expect(fmtMoney(Number.NaN, "USD")).toBe("—");
    expect(fmtMoney(-1500, "USD")).toBe("−$1,500");
    expect(fmtPct(Infinity)).toBe("—");
  });
  it("converts currencies through USD", () => {
    expect(convert(100, "EUR", "USD")).toBeCloseTo(108);
    expect(convert(convert(100, "GBP", "EUR"), "EUR", "GBP")).toBeCloseTo(100);
  });
});

describe("project financials (agency seed)", () => {
  const ds = buildDataset("agency", emptyOverlay());
  const harbor = ds.projects.find((p) => p.id === "pr_harbor_web")!;
  const f = projectFinancials(ds, harbor);

  it("fixed fee revenue at completion includes only approved billable change orders", () => {
    expect(fixedFeeValue(ds, harbor)).toBe(f.revenue.atCompletion);
    expect(f.unbilled.items.some((u) => u.kind === "pending_change")).toBe(true);
    expect(f.unbilled.items.some((u) => u.kind === "absorbed_scope")).toBe(true);
  });
  it("forecast cost = direct to date + remaining labor + remaining expenses", () => {
    expect(f.cost.forecastTotal).toBeCloseTo(f.cost.directToDate + f.cost.remainingLabor + f.cost.remainingExpenses, 6);
    expect(f.cost.directToDate).toBeCloseTo(f.cost.labor + f.cost.contractor + f.cost.expenses, 6);
  });
  it("Harbor is forecast well below target margin (scenario story)", () => {
    expect(f.margin.forecastAtCompletion!).toBeLessThan(0);
    expect(f.margin.variance!).toBeLessThan(-0.3);
  });
  it("earned, invoiced and collected are distinct measures", () => {
    expect(f.revenue.earnedToDate).not.toBeCloseTo(f.revenue.invoicedToDate, 0);
    expect(f.revenue.collectedToDate).toBeLessThanOrEqual(f.revenue.invoicedToDate);
  });
  it("internal initiatives have no revenue or margin", () => {
    const internal = ds.projects.find((p) => p.billing === "internal")!;
    const fi = projectFinancials(ds, internal);
    expect(fi.revenue.atCompletion).toBeNull();
    expect(fi.margin.forecastAtCompletion).toBeNull();
  });
  it("flags hours without a cost rate instead of assuming zero cost", () => {
    const anyMissing = ds.projects.some((p) => projectFinancials(ds, p).missing.some((m) => m.includes("no labor cost rate")));
    expect(anyMissing).toBe(true);
  });
  it("retainer overage is reported for Atlas", () => {
    const atlas = projectFinancials(ds, ds.projects.find((p) => p.id === "pr_atlas_ret")!);
    expect(atlas.retainer?.overageHours ?? 0).toBeGreaterThan(0);
  });
  it("partial payments leave the remainder outstanding", () => {
    const partial = ds.invoices.map((i) => invoiceStatus(ds, i)).find((s) => s.paid > 0 && s.outstanding > 0);
    if (partial) expect(partial.paid + partial.outstanding).toBeCloseTo(partial.invoice.amount, 2);
  });
});

describe("what-if scenarios", () => {
  const base: ScenarioBase = { billing: "fixed_fee", actualCost: 100_000, earnedToDate: 90_000, revenueAtCompletion: 150_000, remainingHours: 300, remainingCostRate: 100, remainingExpenses: 2_000, remainingBillRate: 0, remainingMonths: 0, monthlyFee: 0, priceFactor: 1, targetMargin: 0.4 };
  it("default inputs reproduce the current forecast", () => {
    const r = runScenario(base, defaultInputs(base));
    expect(r.forecastCost).toBe(132_000);
    expect(r.margin).toBeCloseTo((150_000 - 132_000) / 150_000);
  });
  it("substitute resources blend the remaining cost rate", () => {
    const r = runScenario(base, { ...defaultInputs(base), substituteShare: 0.5, substituteCostRate: 60 });
    expect(r.blendedRemainingRate).toBe(80);
    expect(r.remainingCost).toBe(300 * 80 + 2_000);
  });
  it("max remaining hours hits the target exactly", () => {
    const inp = { ...defaultInputs(base), contractValue: 220_000 };
    const r = runScenario(base, inp);
    expect(r.maxRemainingHoursForTarget!).toBeGreaterThan(0);
    const atMax = runScenario(base, { ...inp, remainingHours: r.maxRemainingHoursForTarget! });
    expect(atMax.margin!).toBeCloseTo(0.4, 6);
  });
  it("max remaining hours is zero when the target is already out of reach", () => {
    expect(runScenario(base, defaultInputs(base)).maxRemainingHoursForTarget).toBe(0);
  });
  it("T&M max hours solves for the target", () => {
    const tm: ScenarioBase = { ...base, billing: "time_materials", remainingBillRate: 200, revenueAtCompletion: 150_000 };
    const inp = defaultInputs(tm);
    const r = runScenario(tm, inp);
    const atMax = runScenario(tm, { ...inp, remainingHours: r.maxRemainingHoursForTarget! });
    expect(atMax.margin!).toBeCloseTo(0.4, 6);
  });
  it("zero revenue yields no margin rather than a division error", () => {
    const r = runScenario(base, { ...defaultInputs(base), contractValue: 0 });
    expect(r.margin).toBeNull();
  });
});
