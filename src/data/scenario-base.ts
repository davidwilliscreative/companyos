import type { Project } from "@/domain/types";
import type { ScenarioBase } from "@/lib/calc/scenario";
import { monthsBetween, maxDate } from "@/lib/dates";
import type { Workspace } from "./access";

/** Project-level aggregates for the what-if calculator. No individual compensation is included. */
export function scenarioBaseFor(ws: Workspace, p: Project): ScenarioBase | null {
  const f = ws.analysis.projectFin[p.id];
  if (!f || p.billing === "internal" || p.status === "completed") return null;
  const c = ws.data.contracts.find((x) => x.id === p.contractId);
  const remainingMonths = p.billing === "retainer" && c ? monthsBetween(maxDate(c.startDate, f.measurementStart), c.endDate).length - (f.retainer?.months.length ?? 0) : 0;
  const factor = p.futureBillRateFactor ?? 1;
  const remainingRevenue = (f.revenue.atCompletion ?? 0) - (f.revenue.earnedToDate ?? 0);
  return {
    billing: p.billing,
    actualCost: f.cost.directToDate,
    earnedToDate: f.revenue.earnedToDate ?? 0,
    revenueAtCompletion: f.revenue.atCompletion ?? 0,
    remainingHours: f.hours.remaining,
    remainingCostRate: f.cost.remainingRate ?? 0,
    remainingExpenses: f.cost.remainingExpenses,
    // Rates are expressed before any previously applied price change; priceFactor carries it.
    remainingBillRate: p.billing === "time_materials" && f.hours.remaining > 0 ? remainingRevenue / f.hours.remaining / factor : 0,
    remainingMonths,
    monthlyFee: c?.monthlyFee ?? 0,
    priceFactor: factor,
    targetMargin: f.margin.target ?? ws.org.defaultTargetMargin,
  };
}
