import type { CompensationRecord, Dataset, ID, ISODate, Invoice, Milestone, Organization, Person, Project } from "@/domain/types";
import { addDays, daysBetween, endOfMonth, maxDate, minDate, mondaysBetween, monthsBetween, startOfMonth } from "@/lib/dates";
import { indexOf } from "./index";

/* ------------------------------------------------------------------ *
 * Labor cost and billing rates
 * ------------------------------------------------------------------ */

/**
 * Hourly labor cost.
 *   Employee:   (annual salary + annual employer costs) / (configured annual working hours × FTE)
 *   Contractor: contracted hourly cost
 * Returns null when an input is missing (never guesses).
 */
export function hourlyLaborCost(rec: CompensationRecord | undefined, person: Pick<Person, "type" | "fte">, org: Pick<Organization, "annualWorkingHours">): number | null {
  if (!rec) return null;
  if (person.type === "contractor") return rec.hourlyCost ?? null;
  if (rec.annualSalary === undefined || rec.annualSalary === null) return null;
  if (!org.annualWorkingHours || org.annualWorkingHours <= 0) return null;
  const employer = rec.annualEmployerCosts ?? 0;
  const fte = person.fte > 0 ? person.fte : 1;
  return (rec.annualSalary + employer) / (org.annualWorkingHours * fte);
}

/** The compensation record in effect on a date (latest effectiveFrom <= date). */
export function compOn(ds: Dataset, personId: ID, date: ISODate): CompensationRecord | undefined {
  const recs = indexOf(ds).compByPerson.get(personId) ?? [];
  let hit: CompensationRecord | undefined;
  for (const r of recs) if (r.effectiveFrom <= date) hit = r;
  return hit;
}

export function costRateOn(ds: Dataset, personId: ID, date: ISODate): number | null {
  const person = indexOf(ds).person.get(personId);
  if (!person) return null;
  return hourlyLaborCost(compOn(ds, personId, date), person, ds.org);
}

/** Billable rates are kept separate from labor costs and are effective-dated. */
export function billRateOn(ds: Dataset, personId: ID, date: ISODate): number | null {
  let best: { from: ISODate; rate: number } | null = null;
  for (const r of ds.billRates) {
    if (r.personId !== personId || r.effectiveFrom > date) continue;
    if (!best || r.effectiveFrom > best.from) best = { from: r.effectiveFrom, rate: r.hourlyRate };
  }
  return best?.rate ?? null;
}

/** Annual loaded cost of an employee (salary + employer costs), for payroll views. */
export function annualLoadedCost(rec: CompensationRecord | undefined): number | null {
  if (!rec || rec.annualSalary === undefined) return null;
  return rec.annualSalary + (rec.annualEmployerCosts ?? 0);
}

/* ------------------------------------------------------------------ *
 * Margin helpers
 * ------------------------------------------------------------------ */

/** Delivery margin = (revenue − direct delivery costs) / revenue. Null when revenue is zero or unknown. */
export function deliveryMargin(revenue: number | null, directCost: number): number | null {
  if (revenue === null || revenue === undefined) return null;
  if (revenue === 0) return null;
  return (revenue - directCost) / revenue;
}

/** Utilization = billable hours / available hours for the same period. */
export function utilization(billableHours: number, availableHours: number): number | null {
  if (availableHours <= 0) return null;
  return billableHours / availableHours;
}

/* ------------------------------------------------------------------ *
 * Project financials
 * ------------------------------------------------------------------ */

export interface CostBreakdown {
  hours: number;
  billableHours: number;
  laborCost: number;
  contractorCost: number;
  expenses: number;
  hoursWithoutCostRate: number;
  peopleWithoutCostRate: ID[];
  billableValue: number;
  billableHoursWithoutRate: number;
}

/** Direct cost of recorded time and expenses for a project within [start, end]. */
export function projectCosts(ds: Dataset, projectId: ID, start: ISODate, end: ISODate): CostBreakdown {
  const idx = indexOf(ds);
  const out: CostBreakdown = { hours: 0, billableHours: 0, laborCost: 0, contractorCost: 0, expenses: 0, hoursWithoutCostRate: 0, peopleWithoutCostRate: [], billableValue: 0, billableHoursWithoutRate: 0 };
  const missing = new Set<ID>();
  for (const e of idx.entriesByProject.get(projectId) ?? []) {
    if (e.date < start || e.date > end) continue;
    out.hours += e.hours;
    if (e.billable) {
      out.billableHours += e.hours;
      const br = billRateOn(ds, e.personId, e.date);
      if (br === null) out.billableHoursWithoutRate += e.hours;
      else out.billableValue += br * e.hours;
    }
    const rate = costRateOn(ds, e.personId, e.date);
    if (rate === null) {
      out.hoursWithoutCostRate += e.hours;
      missing.add(e.personId);
      continue;
    }
    const person = idx.person.get(e.personId);
    if (person?.type === "contractor") out.contractorCost += rate * e.hours;
    else out.laborCost += rate * e.hours;
  }
  for (const x of ds.expenses) if (x.projectId === projectId && x.date >= start && x.date <= end) out.expenses += x.amount;
  out.peopleWithoutCostRate = [...missing];
  return out;
}

export function contractFor(ds: Dataset, p: Project) {
  return p.contractId ? ds.contracts.find((c) => c.id === p.contractId) : undefined;
}

/** Revenue at completion for a fixed-fee project: fee plus approved billable change orders. */
export function fixedFeeValue(ds: Dataset, p: Project): number | null {
  const c = contractFor(ds, p);
  if (c?.fixedFee === undefined) return null;
  const changeOrders = p.scopeChanges.filter((s) => s.billable && s.approved).reduce((s, x) => s + (x.amount ?? 0), 0);
  return c.fixedFee + changeOrders;
}

/** Start of the measurement window: history before the loaded data start is unknown, not zero. */
export function measurementStart(ds: Dataset, p: Project): ISODate {
  return maxDate(p.startDate, ds.org.dataStart);
}

function cumulativeHours(ds: Dataset, projectId: ID, through: ISODate): number {
  let h = 0;
  for (const e of indexOf(ds).entriesByProject.get(projectId) ?? []) if (e.date <= through) h += e.hours;
  return h;
}

/** Completed retainer months in [start, end] that fall inside the contract and measurement window. */
export function retainerMonths(ds: Dataset, p: Project, start: ISODate, end: ISODate): string[] {
  const c = contractFor(ds, p);
  if (!c) return [];
  const from = maxDate(maxDate(c.startDate, measurementStart(ds, p)), start);
  const to = minDate(c.endDate, end);
  if (from > to) return [];
  return monthsBetween(from, to).filter((ym) => {
    const ms = `${ym}-01`;
    const me = endOfMonth(ms);
    // Recognized at month end, only for months fully inside the range.
    return ms >= startOfMonth(from) && me <= to && me <= ds.org.demoDate && ms >= startOfMonth(maxDate(c.startDate, measurementStart(ds, p)));
  });
}

/**
 * Earned (recognized) revenue for a project within [start, end].
 *  - Time & materials: billable hours × effective bill rate.
 *  - Fixed fee: contract value × change in effort-based percent complete
 *    (hours to date / estimated hours at completion).
 *  - Retainer: monthly fee for each completed month in the period.
 *  - Internal: no revenue (returns null).
 */
export function earnedRevenue(ds: Dataset, p: Project, start: ISODate, end: ISODate): number | null {
  if (p.billing === "internal") return null;
  const mStart = measurementStart(ds, p);
  const s = maxDate(start, mStart);
  const e = minDate(end, ds.org.demoDate);
  if (s > e) return 0;
  if (p.billing === "time_materials") return projectCosts(ds, p.id, s, e).billableValue;
  if (p.billing === "retainer") {
    const c = contractFor(ds, p);
    if (!c?.monthlyFee) return null;
    return retainerMonths(ds, p, s, e).length * c.monthlyFee;
  }
  // fixed fee
  const value = fixedFeeValue(ds, p);
  if (value === null) return null;
  const hoursToDate = cumulativeHours(ds, p.id, ds.org.demoDate);
  const atCompletion = hoursToDate + (p.status === "completed" ? 0 : p.remainingHoursEstimate);
  if (atCompletion <= 0) return 0;
  const before = cumulativeHours(ds, p.id, addDays(s, -1));
  const through = cumulativeHours(ds, p.id, e);
  let pct = (through - before) / atCompletion;
  if (p.status === "completed" && e >= (p.completedOn ?? p.currentEndDate)) {
    // A completed fixed-fee project recognizes its full value by completion.
    pct = (atCompletion - before) / atCompletion;
  }
  return value * pct;
}

export interface UnbilledItem {
  label: string;
  hours: number;
  value: number;
  kind: "absorbed_scope" | "pending_change" | "retainer_overage";
}

export interface RetainerMonth {
  ym: string;
  hours: number;
  included: number;
  overageHours: number;
}

export interface ProjectFinancials {
  projectId: ID;
  billing: Project["billing"];
  asOf: ISODate;
  measurementStart: ISODate;
  hours: { actual: number; billable: number; remaining: number; atCompletion: number; budget: number; withoutCostRate: number };
  cost: { labor: number; contractor: number; expenses: number; directToDate: number; remainingLabor: number; remainingExpenses: number; forecastTotal: number; remainingRate: number | null; budget: number | null };
  revenue: { basis: string; atCompletion: number | null; earnedToDate: number | null; invoicedToDate: number; collectedToDate: number; wip: number | null };
  margin: { actualToDate: number | null; forecastAtCompletion: number | null; target: number | null; variance: number | null; profitToDate: number | null; forecastProfit: number | null };
  budget: { hoursConsumedPct: number | null; costConsumedPct: number | null; forecastVsBudget: number | null };
  schedule: { currentEnd: ISODate; originalEnd: ISODate; slipDays: number; forecastCompletion: ISODate | null; forecastBasis: string; unstaffedHours: number };
  unbilled: { items: UnbilledItem[]; totalValue: number; totalHours: number };
  retainer?: { months: RetainerMonth[]; includedPerMonth: number; overageHours: number };
  lastTimeEntry: ISODate | null;
  missing: string[];
  notes: string[];
}

/** Hours-weighted average of a per-entry rate over the project's most recent entries. */
function recentWeightedRate(ds: Dataset, projectId: ID, rateFn: (personId: ID, date: ISODate) => number | null, opts: { billableOnly?: boolean } = {}): number | null {
  const entries = (indexOf(ds).entriesByProject.get(projectId) ?? []).filter((e) => (opts.billableOnly ? e.billable : true));
  if (!entries.length) return null;
  const last = entries.reduce((m, e) => (e.date > m ? e.date : m), entries[0].date);
  const cutoff = addDays(last, -56);
  let h = 0;
  let v = 0;
  for (const e of entries) {
    if (e.date < cutoff) continue;
    const r = rateFn(e.personId, e.date);
    if (r === null) continue;
    h += e.hours;
    v += e.hours * r;
  }
  return h > 0 ? v / h : null;
}

/** Hours-weighted cost rate of the people planned on the project going forward. */
function plannedCostRate(ds: Dataset, p: Project, from: ISODate): { rate: number | null; unpricedPeople: ID[] } {
  let h = 0;
  let v = 0;
  const unpriced = new Set<ID>();
  for (const a of p.assignments) {
    if (a.to < from) continue;
    const r = costRateOn(ds, a.personId, from);
    if (r === null) {
      unpriced.add(a.personId);
      continue;
    }
    h += a.hoursPerWeek;
    v += a.hoursPerWeek * r;
  }
  return { rate: h > 0 ? v / h : null, unpricedPeople: [...unpriced] };
}

export function plannedHoursBetween(p: Project, from: ISODate, to: ISODate): number {
  let total = 0;
  for (const a of p.assignments) {
    const s = maxDate(a.from, from);
    const e = minDate(a.to, to);
    if (s > e) continue;
    total += mondaysBetween(s, e).length * a.hoursPerWeek;
  }
  return total;
}

function forecastCompletion(p: Project, asOf: ISODate): { date: ISODate | null; basis: string; unstaffed: number } {
  if (p.status === "completed") return { date: p.completedOn ?? p.currentEndDate, basis: "Completed", unstaffed: 0 };
  if (p.remainingHoursEstimate <= 0) return { date: asOf, basis: "No remaining effort estimated", unstaffed: 0 };
  if (p.billing === "retainer") return { date: p.currentEndDate, basis: "Retainer runs to contract end", unstaffed: 0 };
  // Walk forward week by week through planned assignments until remaining effort is covered.
  let remaining = p.remainingHoursEstimate;
  let week = asOf;
  for (let i = 0; i < 104; i++) {
    const weekly = p.assignments.filter((a) => a.from <= week && a.to >= week).reduce((s, a) => s + a.hoursPerWeek, 0);
    remaining -= weekly;
    if (remaining <= 0) return { date: addDays(week, 4), basis: "Remaining estimate burned down against planned assignments", unstaffed: 0 };
    week = addDays(week, 7);
    if (week > addDays(p.currentEndDate, 7) && weekly === 0) break;
  }
  const plannedToEnd = plannedHoursBetween(p, asOf, p.currentEndDate);
  return { date: null, basis: "Planned assignments do not cover the remaining estimate", unstaffed: Math.max(0, p.remainingHoursEstimate - plannedToEnd) };
}

export function invoiceOutstanding(ds: Dataset, inv: Invoice, asOf: ISODate): { paid: number; outstanding: number; paidOn: ISODate | null } {
  const pays = (indexOf(ds).paymentsByInvoice.get(inv.id) ?? []).filter((p) => p.date <= asOf);
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, Math.round((inv.amount - paid) * 100) / 100);
  const paidOn = outstanding === 0 && pays.length ? pays.reduce((m, p) => (p.date > m ? p.date : m), pays[0].date) : null;
  return { paid, outstanding, paidOn };
}

export function projectFinancials(ds: Dataset, p: Project, asOf: ISODate = ds.org.demoDate): ProjectFinancials {
  const idx = indexOf(ds);
  const mStart = measurementStart(ds, p);
  const missing: string[] = [];
  const notes: string[] = [];
  const c = contractFor(ds, p);
  const costs = projectCosts(ds, p.id, mStart, asOf);
  const entries = idx.entriesByProject.get(p.id) ?? [];
  const lastTimeEntry = entries.length ? entries.reduce((m, e) => (e.date > m ? e.date : m), entries[0].date) : null;
  const remaining = p.status === "completed" ? 0 : p.remainingHoursEstimate;
  const atCompletionHours = costs.hours + remaining;

  if (p.startDate < ds.org.dataStart) notes.push(`Figures are measured from ${ds.org.dataStart} (start of loaded history). Earlier revenue and cost are excluded on both sides.`);
  if (costs.hoursWithoutCostRate > 0) {
    const names = costs.peopleWithoutCostRate.map((id) => idx.person.get(id)?.name ?? id).join(", ");
    missing.push(`${Math.round(costs.hoursWithoutCostRate)} recorded hours have no labor cost rate (${names}). Labor cost is understated until compensation data is provided.`);
  }
  if (costs.billableHoursWithoutRate > 0) missing.push(`${Math.round(costs.billableHoursWithoutRate)} billable hours have no bill rate; earned revenue is understated.`);
  if (p.status === "active" && lastTimeEntry) {
    const lastWeek = addDays(asOf, -7 - ((new Date(`${asOf}T00:00:00Z`).getUTCDay() + 6) % 7));
    const expected = p.assignments.some((a) => a.from <= lastWeek && a.to >= lastWeek);
    if (expected && daysBetween(lastTimeEntry, lastWeek) >= 14) missing.push(`No time recorded since the week of ${lastTimeEntry}, although people are assigned. Actual hours and cost are likely incomplete.`);
  }
  const estimateAge = daysBetween(p.estimateUpdatedOn, asOf);
  if (p.status === "active" && estimateAge > 30) missing.push(`Remaining-effort estimate is ${estimateAge} days old.`);

  // Forecast cost to complete
  const planned = plannedCostRate(ds, p, asOf);
  const recentCost = recentWeightedRate(ds, p.id, (pid, d) => costRateOn(ds, pid, d));
  const remainingRate = p.remainingCostRateOverride ?? planned.rate ?? recentCost;
  if (remaining > 0 && planned.unpricedPeople.length && p.remainingCostRateOverride === undefined) {
    missing.push(`Forecast cost uses the rate of priced team members only; ${planned.unpricedPeople.map((id) => idx.person.get(id)?.name ?? id).join(", ")} has no cost rate.`);
  }
  const remainingLabor = remaining > 0 ? (remainingRate ?? 0) * remaining : 0;
  if (remaining > 0 && remainingRate === null) missing.push("No cost rate available to price remaining effort.");
  const remainingExpenses = p.status === "completed" ? 0 : p.remainingExpenseEstimate;
  const directToDate = costs.laborCost + costs.contractorCost + costs.expenses;
  const forecastTotal = directToDate + remainingLabor + remainingExpenses;

  // Revenue basis
  let basis = "";
  let atCompletionRevenue: number | null = null;
  let retainer: ProjectFinancials["retainer"];
  const earnedToDate = earnedRevenue(ds, p, mStart, asOf);
  if (p.billing === "time_materials") {
    basis = "Time & materials: billable hours × effective bill rate. At completion adds remaining hours at the recent billable share and blended bill rate.";
    const recentBill = recentWeightedRate(ds, p.id, (pid, d) => billRateOn(ds, pid, d), { billableOnly: true });
    const share = costs.hours > 0 ? costs.billableHours / costs.hours : 1;
    atCompletionRevenue = (earnedToDate ?? 0) + remaining * share * (recentBill ?? 0) * (p.futureBillRateFactor ?? 1);
    if (remaining > 0 && recentBill === null) missing.push("No recent billable rate to project remaining revenue.");
  } else if (p.billing === "fixed_fee") {
    atCompletionRevenue = fixedFeeValue(ds, p);
    basis = "Fixed fee: revenue earned by effort-based percent complete (hours to date ÷ estimated hours at completion). At completion = fee + approved billable change orders.";
    if (atCompletionRevenue === null) missing.push("Contract fee is missing.");
  } else if (p.billing === "retainer") {
    basis = "Retainer: monthly fee recognized for each completed month. At completion = fee × months in the measured contract term.";
    if (c?.monthlyFee) {
      const termMonths = monthsBetween(maxDate(c.startDate, mStart), c.endDate).length;
      const recognizedMonths = retainerMonths(ds, p, mStart, asOf).length;
      atCompletionRevenue = recognizedMonths * c.monthlyFee + (termMonths - recognizedMonths) * c.monthlyFee * (p.futureBillRateFactor ?? 1);
      const included = c.includedHoursPerMonth ?? 0;
      const months: RetainerMonth[] = monthsBetween(maxDate(c.startDate, mStart), minDate(c.endDate, asOf))
        .filter((ym) => endOfMonth(`${ym}-01`) <= asOf)
        .map((ym) => {
          const h = entries.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + e.hours, 0);
          return { ym, hours: h, included, overageHours: Math.max(0, h - included) };
        });
      retainer = { months, includedPerMonth: included, overageHours: months.reduce((s, m) => s + m.overageHours, 0) };
    } else missing.push("Monthly retainer fee is missing.");
  } else {
    basis = "Internal initiative: no revenue. Tracked against its approved cost budget.";
  }

  // Margins: actual-to-date compares cumulative earned revenue with cumulative cost over the same window.
  const actualToDate = p.billing === "internal" ? null : deliveryMargin(earnedToDate, directToDate);
  const forecastAtCompletion = p.billing === "internal" ? null : deliveryMargin(atCompletionRevenue, forecastTotal);
  const target = p.billing === "internal" ? null : p.targetMargin ?? ds.org.defaultTargetMargin;

  // Invoicing
  const invs = (idx.invoicesByProject.get(p.id) ?? []).filter((i) => i.issueDate <= asOf);
  const invoicedToDate = invs.reduce((s, i) => s + i.amount, 0);
  const collectedToDate = invs.reduce((s, i) => s + invoiceOutstanding(ds, i, asOf).paid, 0);

  // Unbilled work: value of hours delivered that the contract does not pay for.
  const blendedBill = recentWeightedRate(ds, p.id, (pid, d) => billRateOn(ds, pid, d)) ?? 0;
  const items: UnbilledItem[] = [];
  for (const s of p.scopeChanges) {
    if (s.billable && s.approved) continue;
    items.push({ label: s.description, hours: s.hours, value: s.hours * blendedBill, kind: s.approved ? "absorbed_scope" : "pending_change" });
  }
  if (retainer && retainer.overageHours > 0) {
    items.push({ label: `Hours above the ${retainer.includedPerMonth} h/month included in the retainer`, hours: retainer.overageHours, value: retainer.overageHours * blendedBill, kind: "retainer_overage" });
  }

  const fc = forecastCompletion(p, asOf);
  const budgetCost = p.billing === "internal" ? p.budgetCost ?? null : null;

  return {
    projectId: p.id,
    billing: p.billing,
    asOf,
    measurementStart: mStart,
    hours: { actual: costs.hours, billable: costs.billableHours, remaining, atCompletion: atCompletionHours, budget: p.budgetHours, withoutCostRate: costs.hoursWithoutCostRate },
    cost: { labor: costs.laborCost, contractor: costs.contractorCost, expenses: costs.expenses, directToDate, remainingLabor, remainingExpenses, forecastTotal, remainingRate, budget: budgetCost },
    revenue: { basis, atCompletion: atCompletionRevenue, earnedToDate, invoicedToDate, collectedToDate, wip: earnedToDate === null ? null : earnedToDate - invoicedToDate },
    margin: {
      actualToDate,
      forecastAtCompletion,
      target,
      variance: forecastAtCompletion !== null && target !== null ? forecastAtCompletion - target : null,
      profitToDate: earnedToDate === null ? null : earnedToDate - directToDate,
      forecastProfit: atCompletionRevenue === null ? null : atCompletionRevenue - forecastTotal,
    },
    budget: {
      hoursConsumedPct: p.budgetHours > 0 ? costs.hours / p.budgetHours : null,
      costConsumedPct: budgetCost ? directToDate / budgetCost : null,
      forecastVsBudget: budgetCost ? forecastTotal - budgetCost : null,
    },
    schedule: {
      currentEnd: p.currentEndDate,
      originalEnd: p.originalEndDate,
      slipDays: daysBetween(p.originalEndDate, p.currentEndDate),
      forecastCompletion: fc.date,
      forecastBasis: fc.basis,
      unstaffedHours: fc.unstaffed,
    },
    unbilled: { items, totalValue: items.reduce((s, i) => s + i.value, 0), totalHours: items.reduce((s, i) => s + i.hours, 0) },
    retainer,
    lastTimeEntry,
    missing,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Milestones
 * ------------------------------------------------------------------ */

export function milestoneDueOn(m: Milestone, asOf: ISODate): ISODate {
  let due = m.originalDue;
  for (const c of [...m.dueChanges].sort((a, b) => (a.changedOn < b.changedOn ? -1 : 1))) if (c.changedOn <= asOf) due = c.newDue;
  return due;
}

export type MilestoneState = "done" | "late" | "blocked" | "awaiting_client" | "at_risk" | "on_track";

export function milestoneState(m: Milestone, asOf: ISODate): { state: MilestoneState; due: ISODate; slipDays: number } {
  const due = milestoneDueOn(m, asOf);
  const slipDays = daysBetween(m.originalDue, m.completedOn && m.completedOn <= asOf ? m.completedOn : due);
  if (m.completedOn && m.completedOn <= asOf) return { state: "done", due, slipDays };
  if (m.awaitingClientSince && m.awaitingClientSince <= asOf) return { state: "awaiting_client", due, slipDays };
  if (due < asOf) return { state: "late", due, slipDays };
  if (m.blockedReason) return { state: "blocked", due, slipDays };
  if (slipDays > 0 || daysBetween(asOf, due) <= 7) return { state: slipDays > 0 ? "at_risk" : "on_track", due, slipDays };
  return { state: "on_track", due, slipDays };
}
