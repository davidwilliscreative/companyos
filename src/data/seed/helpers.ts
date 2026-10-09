import type {
  BillRate,
  CompensationRecord,
  CurrencyCode,
  ID,
  ISODate,
  Invoice,
  Message,
  Organization,
  Payment,
  Project,
  Provenance,
  Thread,
  TimeEntry,
  TimeOff,
} from "@/domain/types";
import { addDays, endOfMonth, maxDate, minDate, mondaysBetween, monthsBetween, startOfMonth } from "@/lib/dates";

export const SEED: Provenance = { system: "seed" };
export const src = (system: Provenance["system"], dataset?: string): Provenance => ({ system, dataset });

/** Small deterministic PRNG so seeds are stable across runs. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Scale each person's planned assignments so their busiest week fits within
 * `cap` hours. Keeps the relative mix across projects. People in `exclude`
 * are left as planned (used for the deliberately overloaded scenario).
 */
export function normalizeLoads(projects: Project[], opts: { cap: number; exclude: ID[]; from: ISODate; to: ISODate }) {
  const weeks = mondaysBetween(opts.from, opts.to);
  const peak = new Map<ID, number>();
  for (const w of weeks) {
    const load = new Map<ID, number>();
    for (const p of projects) for (const a of p.assignments) if (a.from <= w && a.to >= w) load.set(a.personId, (load.get(a.personId) ?? 0) + a.hoursPerWeek);
    for (const [id, h] of load) peak.set(id, Math.max(peak.get(id) ?? 0, h));
  }
  for (const p of projects) {
    for (const a of p.assignments) {
      const pk = peak.get(a.personId) ?? 0;
      if (opts.exclude.includes(a.personId) || pk <= opts.cap) continue;
      a.hoursPerWeek = Math.max(1, Math.round((a.hoursPerWeek * opts.cap) / pk * 2) / 2);
    }
  }
}

export type HoursOverride = (ctx: { personId: ID; projectId: ID; week: ISODate; planned: number }) => number | null | undefined;

/** Monday of the last fully completed week before the demo date. */
export function lastCompleteWeek(org: Organization): ISODate {
  return addDays(org.demoDate, -7 - ((new Date(`${org.demoDate}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/**
 * Generate weekly time entries from project assignments. Hours vary by a small
 * deterministic jitter; `override` lets scenarios bend reality (overtime,
 * missing timesheets, paused work). Time off reduces hours proportionally.
 */
export function generateTimeEntries(
  org: Organization,
  projects: Project[],
  timeOff: TimeOff[],
  override?: HoursOverride,
): TimeEntry[] {
  const out: TimeEntry[] = [];
  const lastWeek = lastCompleteWeek(org);
  for (const p of projects) {
    const projectEnd = p.completedOn ?? p.currentEndDate;
    for (const a of p.assignments) {
      const from = maxDate(maxDate(a.from, p.startDate), org.dataStart);
      const to = minDate(minDate(a.to, projectEnd), lastWeek);
      for (const week of mondaysBetween(from, to)) {
        const r = mulberry32(hashString(`${p.id}:${a.personId}:${week}`))();
        let hours = a.hoursPerWeek * (0.88 + r * 0.24);
        const off = timeOff
          .filter((t) => t.personId === a.personId && t.start <= addDays(week, 4) && t.end >= week)
          .reduce((s, t) => s + Math.min(40, t.hours), 0);
        if (off > 0) hours *= Math.max(0, 1 - off / org.hoursPerWeek);
        const o = override?.({ personId: a.personId, projectId: p.id, week, planned: hours });
        if (o === null) continue;
        if (typeof o === "number") hours = o;
        hours = Math.round(hours * 2) / 2;
        if (hours <= 0) continue;
        out.push({
          id: `te_${p.id}_${a.personId}_${week}`,
          orgId: org.id,
          personId: a.personId,
          projectId: p.id,
          date: week,
          hours,
          billable: a.billable && p.billing !== "internal",
          source: src("clickup", "time-tracking"),
        });
      }
    }
  }
  return out;
}

export function rateOn(rates: BillRate[], personId: ID, date: ISODate): number | undefined {
  const r = rates
    .filter((x) => x.personId === personId && x.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  return r?.hourlyRate;
}

let invoiceCounter = 0;
export function resetInvoiceCounter(n = 0) {
  invoiceCounter = n;
}
export function nextInvoiceNumber(prefix: string): string {
  invoiceCounter += 1;
  return `${prefix}-${String(invoiceCounter).padStart(4, "0")}`;
}

/** Monthly-in-arrears invoices for T&M projects, built from the generated time entries. */
export function tmInvoices(org: Organization, p: Project, entries: TimeEntry[], rates: BillRate[], prefix: string, netDays = 30): Invoice[] {
  if (!p.accountId) return [];
  const out: Invoice[] = [];
  for (const ym of monthsBetween(maxDate(p.startDate, org.dataStart), org.demoDate)) {
    const ms = `${ym}-01`;
    const me = endOfMonth(ms);
    if (me >= org.demoDate) continue; // only bill completed months
    const value = entries
      .filter((e) => e.projectId === p.id && e.billable && e.date >= ms && e.date <= me)
      .reduce((s, e) => s + e.hours * (rateOn(rates, e.personId, e.date) ?? 0), 0);
    if (value <= 0) continue;
    const issue = addDays(me, 1);
    out.push({
      id: `inv_${p.id}_${ym}`,
      orgId: org.id,
      accountId: p.accountId,
      projectId: p.id,
      number: nextInvoiceNumber(prefix),
      issueDate: issue,
      dueDate: addDays(issue, netDays),
      amount: Math.round(value),
      currency: org.reportingCurrency,
      description: `${p.name}: time & materials, ${ym}`,
      source: src("accounting", "invoices"),
    });
  }
  return out;
}

/** Retainers are billed in advance on the first of each month. */
export function retainerInvoices(org: Organization, p: Project, monthlyFee: number, contractStart: ISODate, contractEnd: ISODate, prefix: string, netDays = 30): Invoice[] {
  if (!p.accountId) return [];
  const out: Invoice[] = [];
  for (const ym of monthsBetween(maxDate(contractStart, org.dataStart), minDate(contractEnd, org.demoDate))) {
    const issue = `${ym}-01`;
    if (issue > org.demoDate) continue;
    out.push({
      id: `inv_${p.id}_${ym}`,
      orgId: org.id,
      accountId: p.accountId,
      projectId: p.id,
      number: nextInvoiceNumber(prefix),
      issueDate: issue,
      dueDate: addDays(issue, netDays),
      amount: monthlyFee,
      currency: org.reportingCurrency,
      description: `${p.name}: monthly retainer, ${ym}`,
      source: src("accounting", "invoices"),
    });
  }
  return out;
}

export function fixedInvoice(org: Organization, p: Project, key: string, issueDate: ISODate, amount: number, description: string, prefix: string, netDays = 30): Invoice {
  return {
    id: `inv_${p.id}_${key}`,
    orgId: org.id,
    accountId: p.accountId!,
    projectId: p.id,
    number: nextInvoiceNumber(prefix),
    issueDate,
    dueDate: addDays(issueDate, netDays),
    amount,
    currency: org.reportingCurrency,
    description: `${p.name}: ${description}`,
    source: src("accounting", "invoices"),
  };
}

/**
 * Payments follow each account's observed behavior: a typical delay relative to
 * the due date, plus explicit unpaid invoices for scenarios.
 */
export function generatePayments(
  org: Organization,
  invoices: Invoice[],
  delayByAccount: Record<ID, number>,
  unpaid: Set<ID>,
  delayOverrides: Record<ID, number> = {},
): Payment[] {
  const out: Payment[] = [];
  for (const inv of invoices) {
    if (unpaid.has(inv.id)) continue;
    const delay = delayOverrides[inv.id] ?? delayByAccount[inv.accountId] ?? 0;
    const date = addDays(inv.dueDate, delay);
    if (date > org.demoDate) continue;
    out.push({
      id: `pay_${inv.id}`,
      orgId: org.id,
      invoiceId: inv.id,
      date,
      amount: inv.amount,
      currency: inv.currency,
      source: src("accounting", "payments"),
    });
  }
  return out;
}

export function comp(orgId: ID, personId: ID, effectiveFrom: ISODate, annualSalary: number, annualEmployerCosts: number, currency: CurrencyCode = "USD"): CompensationRecord {
  return { id: `comp_${personId}_${effectiveFrom}`, orgId, personId, effectiveFrom, annualSalary, annualEmployerCosts, currency, source: src("sheets", "compensation") };
}

export function contractorCost(orgId: ID, personId: ID, effectiveFrom: ISODate, hourlyCost: number, currency: CurrencyCode = "USD"): CompensationRecord {
  return { id: `comp_${personId}_${effectiveFrom}`, orgId, personId, effectiveFrom, hourlyCost, currency, source: src("sheets", "compensation") };
}

export function rate(orgId: ID, personId: ID, effectiveFrom: ISODate, hourlyRate: number, currency: CurrencyCode = "USD"): BillRate {
  return { id: `rate_${personId}_${effectiveFrom}`, orgId, personId, effectiveFrom, hourlyRate, currency, source: src("sheets", "billable-rates") };
}

export type MsgSpec = [sentAt: string, author: string, side: "client" | "internal", body: string];

export function thread(
  orgId: ID,
  id: ID,
  opts: { accountId?: ID; projectId?: ID; channel: "email" | "slack"; subject: string; location: string; tags?: string[] },
  messages: MsgSpec[],
): Thread {
  const msgs: Message[] = messages.map(([sentAt, author, side, body], i) => ({
    id: `${id}_m${i + 1}`,
    threadId: id,
    author,
    authorSide: side,
    sentAt: sentAt.length === 10 ? `${sentAt}T15:00:00Z` : sentAt,
    body,
  }));
  return {
    id,
    orgId,
    accountId: opts.accountId,
    projectId: opts.projectId,
    channel: opts.channel,
    subject: opts.subject,
    location: opts.location,
    tags: opts.tags ?? [],
    messages: msgs,
    source: src(opts.channel === "email" ? "gmail" : "slack", opts.location),
  };
}

export { startOfMonth };
