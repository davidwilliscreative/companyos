import type { Dataset, ID, ISODate, Invoice } from "@/domain/types";
import { addDays, addMonths, daysBetween, endOfMonth, fmtMonth, maxDate, minDate, mondaysBetween, monthsBetween, startOfMonth } from "@/lib/dates";
import { annualLoadedCost, billRateOn, compOn, costRateOn, earnedRevenue, invoiceOutstanding, milestoneDueOn, projectCosts } from "./finance";
import { indexOf } from "./index";

/* ------------------------------------------------------------------ *
 * Reporting periods
 * ------------------------------------------------------------------ */

export interface Period {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
}

export function reportingPeriods(ds: Dataset): Period[] {
  const lastMonthEnd = addDays(startOfMonth(ds.org.demoDate), -1);
  const lastMonthStart = startOfMonth(lastMonthEnd);
  const qStartMonth = Math.floor((Number(lastMonthEnd.slice(5, 7)) - 1) / 3) * 3 + 1;
  const qStart = `${lastMonthEnd.slice(0, 4)}-${String(qStartMonth).padStart(2, "0")}-01`;
  const sixStart = addMonths(lastMonthStart, -5);
  return [
    { key: "month", label: `${fmtMonth(lastMonthStart.slice(0, 7))} (last full month)`, start: lastMonthStart, end: lastMonthEnd },
    { key: "quarter", label: `Q${Math.ceil(qStartMonth / 3)} ${qStart.slice(0, 4)} (last full quarter)`, start: qStart, end: endOfMonth(addMonths(qStart, 2)) },
    { key: "six", label: `Last 6 months (${fmtMonth(sixStart.slice(0, 7))} – ${fmtMonth(lastMonthStart.slice(0, 7))})`, start: sixStart, end: lastMonthEnd },
    { key: "ytd", label: `Year to date ${ds.org.demoDate.slice(0, 4)}`, start: `${ds.org.demoDate.slice(0, 4)}-01-01`, end: lastMonthEnd },
  ];
}

export function periodByKey(ds: Dataset, key: string | undefined): Period {
  const all = reportingPeriods(ds);
  return all.find((p) => p.key === key) ?? all[1];
}

/** Portion of a period that falls before loaded history. Never treated as zero activity. */
export function coverage(ds: Dataset, period: Period): { coveredStart: ISODate; missingDays: number; note: string | null } {
  const coveredStart = maxDate(period.start, ds.org.dataStart);
  const missingDays = Math.max(0, daysBetween(period.start, coveredStart));
  return {
    coveredStart,
    missingDays,
    note: missingDays > 0 ? `History before ${ds.org.dataStart} is not loaded. Figures cover ${coveredStart} to ${period.end} only; the earlier ${missingDays} days are unknown, not zero.` : null,
  };
}

/* ------------------------------------------------------------------ *
 * Period P&L view (delivery margin vs simplified operating result)
 * ------------------------------------------------------------------ */

export interface ProjectPeriodLine {
  projectId: ID;
  accountId?: ID;
  earned: number | null;
  labor: number;
  contractor: number;
  expenses: number;
  hours: number;
  billableHours: number;
  hoursWithoutCostRate: number;
}

export interface PeriodSummary {
  period: Period;
  /** Client project revenue + recognized subscription revenue. */
  earnedRevenue: number;
  projectRevenue: number;
  subscriptionRevenue: number;
  clientDirectCost: number;
  deliveryMargin: number | null;
  deliveryProfit: number;
  invoiced: number;
  collected: number;
  payroll: number;
  absorbedEmployeeLabor: number;
  nonClientLabor: number;
  internalContractorAndExpenses: number;
  overhead: number;
  operatingResult: number;
  lines: ProjectPeriodLine[];
  missing: string[];
}

function monthsInPeriod(period: Period): string[] {
  return monthsBetween(period.start, period.end);
}

/** Loaded payroll cost of employees for the period (by month, prorated for start/end dates). */
export function payrollCost(ds: Dataset, start: ISODate, end: ISODate): { total: number; missingPeople: ID[] } {
  let total = 0;
  const missing = new Set<ID>();
  for (const ym of monthsBetween(start, end)) {
    const ms = maxDate(`${ym}-01`, start);
    const me = minDate(endOfMonth(`${ym}-01`), end);
    const daysInMonth = daysBetween(`${ym}-01`, endOfMonth(`${ym}-01`)) + 1;
    for (const p of ds.people) {
      if (p.type !== "employee") continue;
      const from = maxDate(ms, p.startDate);
      const to = p.endDate ? minDate(me, p.endDate) : me;
      if (from > to) continue;
      const loaded = annualLoadedCost(compOn(ds, p.id, from));
      if (loaded === null) {
        missing.add(p.id);
        continue;
      }
      total += (loaded / 12) * ((daysBetween(from, to) + 1) / daysInMonth);
    }
  }
  return { total, missingPeople: [...missing] };
}

export function periodSummary(ds: Dataset, period: Period): PeriodSummary {
  const idx = indexOf(ds);
  const cov = coverage(ds, period);
  const start = cov.coveredStart;
  const end = minDate(period.end, ds.org.demoDate);
  const lines: ProjectPeriodLine[] = [];
  const missing: string[] = [];
  if (cov.note) missing.push(cov.note);

  let earned = 0;
  let clientCost = 0;
  let absorbed = 0;
  let internalOther = 0;
  let hoursNoRate = 0;
  for (const p of ds.projects) {
    const c = projectCosts(ds, p.id, start, end);
    const rev = earnedRevenue(ds, p, start, end);
    lines.push({ projectId: p.id, accountId: p.accountId, earned: rev, labor: c.laborCost, contractor: c.contractorCost, expenses: c.expenses, hours: c.hours, billableHours: c.billableHours, hoursWithoutCostRate: c.hoursWithoutCostRate });
    hoursNoRate += c.hoursWithoutCostRate;
    if (p.kind === "client") {
      earned += rev ?? 0;
      clientCost += c.laborCost + c.contractorCost + c.expenses;
      absorbed += c.laborCost;
    } else {
      internalOther += c.contractorCost + c.expenses;
    }
  }
  if (hoursNoRate > 0) missing.push(`${Math.round(hoursNoRate)} hours in this period have no cost rate, so delivery cost is understated.`);

  let subscriptionRevenue = 0;
  for (const sub of ds.subscriptions) {
    const months = monthsBetween(start, end).filter((ym) => endOfMonth(`${ym}-01`) <= end && `${ym}-01` >= startOfMonth(sub.startDate) && `${ym}-01` <= sub.renewalDate).length;
    subscriptionRevenue += months * sub.mrr;
  }
  const projectRevenue = earned;
  earned += subscriptionRevenue;

  const invoiced = ds.invoices.filter((i) => i.issueDate >= start && i.issueDate <= end).reduce((s, i) => s + i.amount, 0);
  const collected = ds.payments.filter((p) => p.date >= start && p.date <= end).reduce((s, p) => s + p.amount, 0);
  const pay = payrollCost(ds, start, end);
  if (pay.missingPeople.length) missing.push(`Payroll excludes ${pay.missingPeople.map((id) => idx.person.get(id)?.name ?? id).join(", ")} (no compensation record).`);
  const overhead = monthsInPeriod({ ...period, start }).length * ds.org.overheadMonthly.reduce((s, o) => s + o.amount, 0);

  // Salary costs are counted once: payroll = labor absorbed by client projects + everything else.
  const nonClientLabor = pay.total - absorbed;
  const operatingResult = earned - pay.total - (clientCost - absorbed) - internalOther - overhead;

  return {
    period,
    earnedRevenue: earned,
    projectRevenue,
    subscriptionRevenue,
    clientDirectCost: clientCost,
    deliveryMargin: projectRevenue > 0 ? (projectRevenue - clientCost) / projectRevenue : null,
    deliveryProfit: projectRevenue - clientCost,
    invoiced,
    collected,
    payroll: pay.total,
    absorbedEmployeeLabor: absorbed,
    nonClientLabor,
    internalContractorAndExpenses: internalOther,
    overhead,
    operatingResult,
    lines,
    missing,
  };
}

export interface MonthPoint {
  ym: string;
  label: string;
  earned: number;
  directCost: number;
  margin: number | null;
  invoiced: number;
  collected: number;
}

export function monthlySeries(ds: Dataset, months = 6): MonthPoint[] {
  const lastMonthEnd = addDays(startOfMonth(ds.org.demoDate), -1);
  const first = addMonths(startOfMonth(lastMonthEnd), -(months - 1));
  return monthsBetween(maxDate(first, ds.org.dataStart), lastMonthEnd).map((ym) => {
    const s = periodSummary(ds, { key: ym, label: ym, start: `${ym}-01`, end: endOfMonth(`${ym}-01`) });
    return { ym, label: fmtMonth(ym), earned: s.earnedRevenue, directCost: s.clientDirectCost, margin: s.deliveryMargin, invoiced: s.invoiced, collected: s.collected };
  });
}

/* ------------------------------------------------------------------ *
 * Receivables
 * ------------------------------------------------------------------ */

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export interface InvoiceStatus {
  invoice: Invoice;
  outstanding: number;
  paid: number;
  paidOn: ISODate | null;
  daysOverdue: number;
  bucket: AgingBucket | "paid";
}

export function invoiceStatus(ds: Dataset, inv: Invoice, asOf = ds.org.demoDate): InvoiceStatus {
  const { outstanding, paid, paidOn } = invoiceOutstanding(ds, inv, asOf);
  const daysOverdue = Math.max(0, daysBetween(inv.dueDate, asOf));
  let bucket: InvoiceStatus["bucket"] = "paid";
  if (outstanding > 0) bucket = daysOverdue === 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
  return { invoice: inv, outstanding, paid, paidOn, daysOverdue: outstanding > 0 ? daysOverdue : 0, bucket };
}

export function receivables(ds: Dataset, asOf = ds.org.demoDate) {
  const statuses = ds.invoices.filter((i) => i.issueDate <= asOf).map((i) => invoiceStatus(ds, i, asOf));
  const open = statuses.filter((s) => s.outstanding > 0);
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const s of open) buckets[s.bucket as AgingBucket] += s.outstanding;
  const overdue = open.filter((s) => s.daysOverdue > 0);
  return {
    open: open.sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding),
    overdue,
    buckets,
    totalOutstanding: open.reduce((s, x) => s + x.outstanding, 0),
    totalOverdue: overdue.reduce((s, x) => s + x.outstanding, 0),
  };
}

/** Average days paid after due date, from fully paid invoices (observed behavior). */
export function paymentBehavior(ds: Dataset, accountId: ID, asOf = ds.org.demoDate): { avgDaysLate: number | null; sample: number } {
  const paid = (indexOf(ds).invoicesByAccount.get(accountId) ?? []).map((i) => invoiceStatus(ds, i, asOf)).filter((s) => s.paidOn);
  if (!paid.length) return { avgDaysLate: null, sample: 0 };
  const avg = paid.reduce((s, x) => s + daysBetween(x.invoice.dueDate, x.paidOn!), 0) / paid.length;
  return { avgDaysLate: Math.round(avg), sample: paid.length };
}

/* ------------------------------------------------------------------ *
 * Cash forecast
 * ------------------------------------------------------------------ */

export interface CashAssumptions {
  weeks: number;
  /** Use each account's observed average days-late, or a flat delay. */
  collectionTiming: "observed" | "on_due_date";
  /** Invoices overdue by more than this many days are excluded from the base case. */
  excludeOverdueBeyondDays: number | null;
  includeFutureBilling: boolean;
  paymentTermsDays: number;
  payrollDayOfMonth: number;
  contractorPaymentLagDays: number;
}

export const DEFAULT_CASH_ASSUMPTIONS: CashAssumptions = {
  weeks: 13,
  collectionTiming: "observed",
  excludeOverdueBeyondDays: 60,
  includeFutureBilling: true,
  paymentTermsDays: 30,
  payrollDayOfMonth: 25,
  contractorPaymentLagDays: 30,
};

export interface CashItem {
  date: ISODate;
  amount: number;
  kind: "collection" | "future_billing" | "payroll" | "contractors" | "overhead" | "expenses";
  label: string;
  ref?: { type: "invoice" | "project" | "account"; id: ID };
}

export interface CashWeek {
  weekStart: ISODate;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  items: CashItem[];
}

export interface CashForecast {
  assumptions: CashAssumptions;
  opening: { amount: number; date: ISODate };
  weeks: CashWeek[];
  lowPoint: { weekStart: ISODate; closing: number };
  excluded: { invoiceId: ID; amount: number; reason: string }[];
  totals: { inflows: number; outflows: number };
  notes: string[];
}

export function cashForecast(ds: Dataset, a: CashAssumptions = DEFAULT_CASH_ASSUMPTIONS): CashForecast {
  const asOf = ds.org.demoDate;
  const horizonEnd = addDays(asOf, a.weeks * 7 - 1);
  const items: CashItem[] = [];
  const excluded: CashForecast["excluded"] = [];
  const notes: string[] = [];
  const delayFor = (accountId: ID) => (a.collectionTiming === "observed" ? Math.max(0, paymentBehavior(ds, accountId).avgDaysLate ?? 0) : 0);

  // 1. Open invoices
  for (const s of receivables(ds).open) {
    if (a.excludeOverdueBeyondDays !== null && s.daysOverdue > a.excludeOverdueBeyondDays) {
      excluded.push({ invoiceId: s.invoice.id, amount: s.outstanding, reason: `${s.daysOverdue} days overdue: excluded from base case until a payment date is confirmed` });
      continue;
    }
    const expected = maxDate(addDays(s.invoice.dueDate, delayFor(s.invoice.accountId)), addDays(asOf, s.daysOverdue > 0 ? 7 : 0));
    items.push({ date: expected, amount: s.outstanding, kind: "collection", label: `Collect ${s.invoice.number}`, ref: { type: "invoice", id: s.invoice.id } });
  }

  // 2. Future billing (retainers, fixed-fee milestones, T&M from planned hours, subscriptions)
  if (a.includeFutureBilling) {
    for (const p of ds.projects) {
      if (!p.accountId || p.status === "completed") continue;
      const contract = ds.contracts.find((c) => c.id === p.contractId);
      const delay = delayFor(p.accountId);
      if (p.billing === "retainer" && contract?.monthlyFee) {
        for (let m = addMonths(startOfMonth(asOf), 1); m <= minDate(horizonEnd, contract.endDate); m = addMonths(m, 1)) {
          items.push({ date: addDays(m, a.paymentTermsDays + delay), amount: contract.monthlyFee * (p.futureBillRateFactor ?? 1), kind: "future_billing", label: `${p.name}: retainer ${m.slice(0, 7)}`, ref: { type: "project", id: p.id } });
        }
      } else if (p.billing === "fixed_fee") {
        for (const m of indexOf(ds).milestonesByProject.get(p.id) ?? []) {
          if (!m.billingAmount || (m.completedOn && m.completedOn <= asOf)) continue;
          const alreadyInvoiced = ds.invoices.some((i) => i.projectId === p.id && i.issueDate >= (m.completedOn ?? "9999"));
          if (alreadyInvoiced) continue;
          const due = milestoneDueOn(m, asOf);
          items.push({ date: addDays(due, a.paymentTermsDays + delay), amount: m.billingAmount, kind: "future_billing", label: `${p.name}: milestone "${m.name}" (due ${due})`, ref: { type: "project", id: p.id } });
        }
      } else if (p.billing === "time_materials") {
        for (let m = startOfMonth(asOf); m <= horizonEnd; m = addMonths(m, 1)) {
          const me = minDate(endOfMonth(m), p.currentEndDate);
          let value = 0;
          for (const as of p.assignments) {
            if (!as.billable) continue;
            const weeks = mondaysBetween(maxDate(maxDate(as.from, m), asOf), minDate(as.to, me)).length;
            value += weeks * as.hoursPerWeek * (billRateOn(ds, as.personId, asOf) ?? 0) * (p.futureBillRateFactor ?? 1);
          }
          if (value > 0) items.push({ date: addDays(addMonths(m, 1), a.paymentTermsDays + delay), amount: value, kind: "future_billing", label: `${p.name}: T&M ${m.slice(0, 7)} (planned hours)`, ref: { type: "project", id: p.id } });
        }
      }
    }
    for (const sub of ds.subscriptions) {
      for (let m = addMonths(startOfMonth(asOf), 1); m <= minDate(horizonEnd, sub.renewalDate); m = addMonths(m, 1)) {
        items.push({ date: addDays(m, a.paymentTermsDays + delayFor(sub.accountId)), amount: sub.mrr, kind: "future_billing", label: `${indexOf(ds).account.get(sub.accountId)?.name}: subscription ${m.slice(0, 7)}`, ref: { type: "account", id: sub.accountId } });
      }
    }
    notes.push("Future billing assumes retainers and subscriptions bill on the 1st, fixed-fee milestones bill on their current due date, and T&M bills monthly in arrears from planned billable hours. Subscriptions are assumed to continue to their renewal date only.");
  }

  // 3. Outflows
  for (let m = startOfMonth(asOf); m <= horizonEnd; m = addMonths(m, 1)) {
    const payDay = `${m.slice(0, 7)}-${String(a.payrollDayOfMonth).padStart(2, "0")}`;
    if (payDay >= asOf && payDay <= horizonEnd) {
      const pay = payrollCost(ds, m, endOfMonth(m));
      items.push({ date: payDay, amount: -pay.total, kind: "payroll", label: `Payroll ${m.slice(0, 7)} (salary + employer costs)` });
      if (pay.missingPeople.length && m === startOfMonth(asOf)) notes.push(`Payroll excludes ${pay.missingPeople.length} employee(s) without a compensation record, so outflows are understated.`);
    }
    const overheadDay = maxDate(m, asOf);
    if (overheadDay <= horizonEnd && ds.org.overheadMonthly.length) items.push({ date: overheadDay, amount: -ds.org.overheadMonthly.reduce((s, o) => s + o.amount, 0), kind: "overhead", label: `Overhead ${m.slice(0, 7)}` });
    // Contractors paid the month after work is done, from planned hours.
    let contractorCost = 0;
    for (const p of ds.projects) {
      for (const as of p.assignments) {
        const person = indexOf(ds).person.get(as.personId);
        if (person?.type !== "contractor") continue;
        const weeks = mondaysBetween(maxDate(maxDate(as.from, m), asOf), minDate(as.to, endOfMonth(m))).length;
        contractorCost += weeks * as.hoursPerWeek * (costRateOn(ds, as.personId, asOf) ?? 0);
      }
    }
    const cDay = addDays(endOfMonth(m), a.contractorPaymentLagDays);
    if (contractorCost > 0 && cDay <= horizonEnd) items.push({ date: cDay, amount: -contractorCost, kind: "contractors", label: `Contractors for ${m.slice(0, 7)} (planned hours)` });
  }
  for (const p of ds.projects) {
    if (p.status === "completed" || p.remainingExpenseEstimate <= 0) continue;
    const end = minDate(p.currentEndDate, horizonEnd);
    if (end < asOf) continue;
    items.push({ date: end, amount: -p.remainingExpenseEstimate, kind: "expenses", label: `${p.name}: remaining direct expenses`, ref: { type: "project", id: p.id } });
  }

  const weeks: CashWeek[] = [];
  let balance = ds.org.openingCash.amount;
  for (let i = 0; i < a.weeks; i++) {
    const ws = addDays(asOf, i * 7);
    const we = addDays(ws, 6);
    const wi = items.filter((x) => x.date >= ws && x.date <= we).sort((x, y) => (x.date < y.date ? -1 : 1));
    const inflows = wi.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
    const outflows = -wi.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0);
    const opening = balance;
    balance = opening + inflows - outflows;
    weeks.push({ weekStart: ws, opening, inflows, outflows, closing: balance, items: wi });
  }
  const low = weeks.reduce((m, w) => (w.closing < m.closing ? w : m), weeks[0]);
  return {
    assumptions: a,
    opening: { amount: ds.org.openingCash.amount, date: ds.org.openingCash.date },
    weeks,
    lowPoint: { weekStart: low.weekStart, closing: low.closing },
    excluded,
    totals: { inflows: weeks.reduce((s, w) => s + w.inflows, 0), outflows: weeks.reduce((s, w) => s + w.outflows, 0) },
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Revenue concentration
 * ------------------------------------------------------------------ */

export function revenueConcentration(ds: Dataset, period: Period) {
  const s = periodSummary(ds, period);
  const byAccount = new Map<ID, number>();
  for (const l of s.lines) if (l.accountId && l.earned) byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + l.earned);
  for (const sub of ds.subscriptions) {
    const months = monthsBetween(maxDate(period.start, ds.org.dataStart), minDate(period.end, ds.org.demoDate)).filter((ym) => endOfMonth(`${ym}-01`) <= ds.org.demoDate && `${ym}-01` >= startOfMonth(sub.startDate) && `${ym}-01` <= sub.renewalDate).length;
    byAccount.set(sub.accountId, (byAccount.get(sub.accountId) ?? 0) + months * sub.mrr);
  }
  const total = [...byAccount.values()].reduce((a, b) => a + b, 0);
  const rows = [...byAccount.entries()].map(([accountId, revenue]) => ({ accountId, revenue, share: total > 0 ? revenue / total : 0 })).sort((a, b) => b.revenue - a.revenue);
  return { total, rows, top1: rows[0]?.share ?? 0, top3: rows.slice(0, 3).reduce((x, r) => x + r.share, 0) };
}
