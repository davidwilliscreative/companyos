/**
 * What-if calculator. Pure and client-safe: it works from project-level
 * aggregates (no individual compensation), so any role allowed to see a
 * project's cost aggregates can use it. Nothing here mutates data; applying a
 * scenario is a separate, explicit server action.
 */

export interface ScenarioBase {
  billing: "fixed_fee" | "retainer" | "time_materials";
  /** Cost already incurred (actual to date). */
  actualCost: number;
  /** Revenue already earned (same window as actualCost). */
  earnedToDate: number;
  /** Revenue at completion under current terms. */
  revenueAtCompletion: number;
  remainingHours: number;
  /** Blended cost per remaining hour under the current staffing plan. */
  remainingCostRate: number;
  remainingExpenses: number;
  /** Blended bill rate for T&M remaining hours (billable share applied). */
  remainingBillRate: number;
  /** Retainer: remaining months and monthly fee. */
  remainingMonths: number;
  monthlyFee: number;
  /** Price multiplier already applied to future rates/fees (1 = none). */
  priceFactor: number;
  targetMargin: number;
}

export interface ScenarioInputs {
  /** Fixed fee: new total contract value. */
  contractValue: number;
  /** T&M / retainer: percentage change applied to future rates or fees (e.g. 0.1 = +10%). */
  priceChangePct: number;
  remainingHours: number;
  /** Share of remaining hours moved to a substitute resource (0..1). */
  substituteShare: number;
  /** Hourly cost of the substitute resource (e.g. a contractor quote). */
  substituteCostRate: number;
  targetMargin: number;
}

export interface ScenarioResult {
  revenueAtCompletion: number;
  remainingCost: number;
  forecastCost: number;
  blendedRemainingRate: number;
  margin: number | null;
  profit: number;
  gapToTarget: number | null;
  /** Revenue needed to hit the target margin with this cost plan. */
  requiredRevenueForTarget: number | null;
  /** Maximum remaining hours that still hit the target at this price and staffing. */
  maxRemainingHoursForTarget: number | null;
}

export function defaultInputs(base: ScenarioBase): ScenarioInputs {
  return {
    contractValue: Math.round(base.revenueAtCompletion),
    priceChangePct: Math.round((base.priceFactor - 1) * 1000) / 1000,
    remainingHours: Math.round(base.remainingHours),
    substituteShare: 0,
    substituteCostRate: 95,
    targetMargin: base.targetMargin,
  };
}

export function runScenario(base: ScenarioBase, inp: ScenarioInputs): ScenarioResult {
  const hours = Math.max(0, inp.remainingHours);
  const share = Math.min(1, Math.max(0, inp.substituteShare));
  const blended = base.remainingCostRate * (1 - share) + inp.substituteCostRate * share;
  const remainingCost = hours * blended + base.remainingExpenses;
  const forecastCost = base.actualCost + remainingCost;

  let revenue: number;
  if (base.billing === "fixed_fee") revenue = inp.contractValue;
  else if (base.billing === "time_materials") {
    // Remaining revenue scales with remaining hours at the (adjusted) bill rate.
    revenue = base.earnedToDate + hours * base.remainingBillRate * (1 + inp.priceChangePct);
  } else revenue = base.earnedToDate + base.remainingMonths * base.monthlyFee * (1 + inp.priceChangePct);

  const margin = revenue > 0 ? (revenue - forecastCost) / revenue : null;
  const target = inp.targetMargin;
  const requiredRevenueForTarget = target < 1 ? forecastCost / (1 - target) : null;

  // Hours h such that (R(h) − C(h)) / R(h) = target.
  let maxHours: number | null = null;
  if (base.billing === "time_materials") {
    const br = base.remainingBillRate * (1 + inp.priceChangePct);
    const denom = (1 - target) * br - blended;
    const numer = base.actualCost + base.remainingExpenses - (1 - target) * base.earnedToDate;
    if (denom > 0) maxHours = Math.max(0, numer / denom);
    else maxHours = numer <= 0 ? Infinity : 0;
    if (maxHours !== null && !Number.isFinite(maxHours)) maxHours = null;
  } else if (blended > 0) {
    const allowedCost = revenue * (1 - target);
    maxHours = Math.max(0, (allowedCost - base.actualCost - base.remainingExpenses) / blended);
  }

  return {
    revenueAtCompletion: revenue,
    remainingCost,
    forecastCost,
    blendedRemainingRate: blended,
    margin,
    profit: revenue - forecastCost,
    gapToTarget: margin === null ? null : margin - target,
    requiredRevenueForTarget,
    maxRemainingHoursForTarget: maxHours,
  };
}
