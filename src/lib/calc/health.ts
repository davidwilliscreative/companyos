import type { Account, Dataset, ISODate, Signal } from "@/domain/types";
import { getProfile, type HealthComponentKey } from "@/domain/profiles";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { invoiceStatus } from "./company";
import { earnedRevenue, measurementStart, milestoneState, projectCosts, projectFinancials } from "./finance";
import { indexOf } from "./index";
import { launchReadiness } from "./launch";
import { flightPacing } from "./media";

/**
 * Account health is a transparent weighted score. Each component returns a
 * 0–100 score (or null when there is not enough data) plus the factors that
 * moved it. Missing components are excluded and reduce data completeness;
 * they never count as healthy.
 */

export interface HealthFactor {
  label: string;
  effect: number; // points added (+) or removed (−)
  kind: "observed" | "calculated" | "inferred";
  link?: { type: "project" | "milestone" | "invoice" | "signal" | "thread" | "task"; id: string };
}

export interface HealthComponent {
  key: HealthComponentKey;
  label: string;
  weight: number;
  score: number | null;
  factors: HealthFactor[];
  note?: string;
}

export type HealthStatus = "healthy" | "watch" | "at_risk" | "insufficient";

export interface AccountHealth {
  accountId: string;
  asOf: ISODate;
  score: number | null;
  status: HealthStatus;
  components: HealthComponent[];
  dataGaps: string[];
  completeness: number;
  lastClientContact: ISODate | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const SEV_POINTS = { low: 5, medium: 12, high: 25, critical: 40 } as const;
const CONF_FACTOR = { low: 0.5, medium: 0.8, high: 1 } as const;

function deliveryComponent(ds: Dataset, account: Account, asOf: ISODate): Omit<HealthComponent, "key" | "label" | "weight"> {
  const idx = indexOf(ds);
  const projects = (idx.projectsByAccount.get(account.id) ?? []).filter((p) => p.startDate <= asOf && (!p.completedOn || p.completedOn >= addDays(asOf, -30)));
  if (!projects.length) return { score: null, factors: [], note: "No active work" };
  let score = 100;
  const factors: HealthFactor[] = [];
  // Retail shelf dates: a launch whose final files will miss the printer's deadline weighs more than a slipped milestone.
  for (const l of ds.retailLaunches.filter((x) => x.accountId === account.id)) {
    const r = launchReadiness(ds, l, asOf);
    if (r.status === "at_risk" && r.milestoneState !== "done") {
      score -= 20;
      factors.push({ label: `${l.name}: final files forecast ${-(r.bufferDays ?? 0)} days after the print deadline for the ${fmtDate(l.shelfDate)} shelf date`, effect: -20, kind: "calculated", link: { type: "project", id: l.projectId } });
    } else if (r.status === "tight") {
      score -= 8;
      factors.push({ label: `${l.name}: ${r.bufferDays ?? 0} days of buffer before the print deadline`, effect: -8, kind: "calculated", link: { type: "project", id: l.projectId } });
    }
  }
  for (const p of projects) {
    for (const m of idx.milestonesByProject.get(p.id) ?? []) {
      if (m.originalDue > addDays(asOf, 60) && !m.dueChanges.length) continue;
      const st = milestoneState(m, asOf);
      if (st.state === "late") {
        score -= 18;
        factors.push({ label: `${m.name} is past its due date (${fmtDate(st.due)})`, effect: -18, kind: "observed", link: { type: "milestone", id: m.id } });
      } else if (st.state === "awaiting_client" || st.state === "blocked") {
        score -= 12;
        factors.push({ label: `${m.name} is ${st.state === "awaiting_client" ? "waiting on the client" : "blocked"}: ${m.blockedReason ?? ""}`.trim(), effect: -12, kind: "observed", link: { type: "milestone", id: m.id } });
      } else if (st.state !== "done" && st.slipDays > 0) {
        const pen = Math.min(10, Math.ceil(st.slipDays / 7) * 2);
        score -= pen;
        factors.push({ label: `${m.name} moved ${st.slipDays} days from its original date`, effect: -pen, kind: "observed", link: { type: "milestone", id: m.id } });
      }
    }
    const overdueTasks = (idx.tasksByProject.get(p.id) ?? []).filter((t) => t.due < asOf && (!t.completedOn || t.completedOn > asOf) && t.status !== "done");
    if (overdueTasks.length) {
      const pen = Math.min(15, overdueTasks.length * 4);
      score -= pen;
      factors.push({ label: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"} on ${p.name}`, effect: -pen, kind: "observed", link: { type: "project", id: p.id } });
    }
  }
  return { score: clamp(score), factors };
}

function financialComponent(ds: Dataset, account: Account, asOf: ISODate): Omit<HealthComponent, "key" | "label" | "weight"> {
  const idx = indexOf(ds);
  let score = 100;
  const factors: HealthFactor[] = [];
  const invoices = (idx.invoicesByAccount.get(account.id) ?? []).filter((i) => i.issueDate <= asOf);
  for (const inv of invoices) {
    const s = invoiceStatus(ds, inv, asOf);
    if (s.outstanding <= 0 || s.daysOverdue === 0) continue;
    const pen = s.daysOverdue > 60 ? 25 : s.daysOverdue > 30 ? 15 : 6;
    score -= pen;
    factors.push({ label: `Invoice ${inv.number} is ${s.daysOverdue} days overdue`, effect: -pen, kind: "observed", link: { type: "invoice", id: inv.id } });
  }
  if (getProfile(ds.org.profileId).modules.projectMargins) {
    let rev = 0;
    let cost = 0;
    let targetWeighted = 0;
    for (const p of idx.projectsByAccount.get(account.id) ?? []) {
      if (p.billing === "internal" || p.startDate > asOf) continue;
      const r = earnedRevenue(ds, p, measurementStart(ds, p), asOf) ?? 0;
      const c = projectCosts(ds, p.id, measurementStart(ds, p), asOf);
      rev += r;
      cost += c.laborCost + c.contractorCost + c.expenses;
      targetWeighted += r * (p.targetMargin ?? ds.org.defaultTargetMargin);
    }
    if (rev > 0) {
      const margin = (rev - cost) / rev;
      const target = targetWeighted / rev;
      if (margin < target) {
        const pen = Math.min(35, Math.round((target - margin) * 100));
        score -= pen;
        factors.push({ label: `Delivery margin to date ${(margin * 100).toFixed(0)}% vs target ${(target * 100).toFixed(0)}%`, effect: -pen, kind: "calculated" });
      } else factors.push({ label: `Delivery margin to date ${(margin * 100).toFixed(0)}% meets target`, effect: 0, kind: "calculated" });
    }
  }
  if (!invoices.length && !factors.length) return { score: null, factors: [], note: "No invoices or revenue yet" };
  return { score: clamp(score), factors };
}

/** Media profile: spend pacing and KPI results of the account's live flights. Not applicable when the client buys no media through us. */
function mediaComponent(ds: Dataset, account: Account, asOf: ISODate): Omit<HealthComponent, "key" | "label" | "weight"> & { notApplicable?: boolean } {
  const flights = ds.mediaFlights.filter((f) => f.accountId === account.id && f.start <= asOf && f.end >= addDays(asOf, -30));
  if (!flights.length) return { score: null, factors: [], notApplicable: true };
  let score = 100;
  let measured = 0;
  const factors: HealthFactor[] = [];
  for (const f of flights) {
    const p = flightPacing(f, asOf);
    if (p.status === "no_data") {
      factors.push({ label: `${f.channel} (${f.platform}): ${p.summary.toLowerCase()}`, effect: 0, kind: "observed", link: { type: "project", id: f.projectId } });
      continue;
    }
    measured++;
    if (p.status === "over" || p.status === "under") {
      const pen = Math.min(25, Math.round(Math.abs(p.projectedVariance) * 100));
      score -= pen;
      factors.push({ label: `${f.channel} (${f.platform}) projected ${Math.round(Math.abs(p.projectedVariance) * 100)}% ${p.status === "over" ? "over" : "under"} budget`, effect: -pen, kind: "calculated", link: { type: "project", id: f.projectId } });
    }
    if (p.kpiStatus === "behind") {
      const pen = Math.min(25, Math.round(-(p.kpiGap ?? 0) * 80));
      score -= pen;
      factors.push({ label: `${f.channel} (${f.platform}) ${f.kpi.metric} ${Math.round(-(p.kpiGap ?? 0) * 100)}% worse than target over the last 4 weeks`, effect: -pen, kind: "observed", link: { type: "project", id: f.projectId } });
    } else if (p.kpiStatus === "ahead") factors.push({ label: `${f.channel} (${f.platform}) ${f.kpi.metric} ${Math.round((p.kpiGap ?? 0) * 100)}% better than target`, effect: 0, kind: "observed", link: { type: "project", id: f.projectId } });
  }
  if (!measured) return { score: null, factors, note: "No recent platform reporting" };
  return { score: clamp(score), factors };
}

function relationshipComponent(signals: Signal[], account: Account, hasComms: boolean): Omit<HealthComponent, "key" | "label" | "weight"> {
  if (!hasComms) return { score: null, factors: [], note: "No authorized communications in the last 120 days" };
  let score = 85;
  const factors: HealthFactor[] = [];
  let bonus = 0;
  for (const s of signals) {
    if (s.accountId !== account.id || s.autoResolved || s.review.status === "dismissed" || s.review.status === "resolved") continue;
    if (s.polarity === "risk") {
      // Signals observed only in internal messages weigh less on the client relationship.
      const clientShare = s.evidence.length ? s.evidence.filter((e) => e.authorSide === "client").length / s.evidence.length : 0;
      const pen = Math.round(SEV_POINTS[s.severity] * CONF_FACTOR[s.confidence] * Math.max(0.3, clientShare) * (s.category === "renewal_risk" ? 1.5 : 1));
      score -= pen;
      factors.push({ label: `${s.summary} (${s.severity}, ${s.confidence} confidence)`, effect: -pen, kind: "inferred", link: { type: "signal", id: s.id } });
    } else {
      const b = s.polarity === "positive" ? 5 : 3;
      bonus += b;
      factors.push({ label: s.summary, effect: b, kind: "inferred", link: { type: "signal", id: s.id } });
    }
  }
  return { score: clamp(score + Math.min(12, bonus)), factors };
}

function engagementComponent(lastContact: ISODate | null, asOf: ISODate): Omit<HealthComponent, "key" | "label" | "weight"> {
  if (!lastContact) return { score: null, factors: [], note: "No client messages found" };
  const d = daysBetween(lastContact, asOf);
  const score = d <= 14 ? 100 : d <= 30 ? 80 : d <= 45 ? 55 : 30;
  return { score, factors: [{ label: `Last client message ${d} days ago (${fmtDate(lastContact)})`, effect: score - 100, kind: "observed" }] };
}

function usageComponent(ds: Dataset, account: Account): Omit<HealthComponent, "key" | "label" | "weight"> {
  const sub = ds.subscriptions.find((s) => s.accountId === account.id);
  if (!sub) return { score: null, factors: [], note: "No subscription" };
  const series = sub.activeSeatsByMonth;
  const latest = series[series.length - 1];
  if (latest === null || latest === undefined) return { score: null, factors: [{ label: "Latest month of usage data is missing", effect: 0, kind: "observed" }], note: "Usage data missing for the latest month" };
  const adoption = latest / sub.seats;
  const threeAgo = series[Math.max(0, series.length - 4)];
  const trend = threeAgo ? (latest - threeAgo) / threeAgo : 0;
  let score = adoption * 100;
  const factors: HealthFactor[] = [{ label: `${latest} of ${sub.seats} seats active (${Math.round(adoption * 100)}%)`, effect: Math.round(score - 100), kind: "observed" }];
  if (trend < -0.1) {
    const pen = Math.min(30, Math.round(-trend * 60));
    score -= pen;
    factors.push({ label: `Active seats down ${Math.round(-trend * 100)}% over 3 months`, effect: -pen, kind: "calculated" });
  } else if (trend > 0.1) factors.push({ label: `Active seats up ${Math.round(trend * 100)}% over 3 months`, effect: 0, kind: "calculated" });
  return { score: clamp(score), factors };
}

function budgetComponent(ds: Dataset, account: Account, asOf: ISODate): Omit<HealthComponent, "key" | "label" | "weight"> {
  const projects = ds.projects.filter((p) => p.businessUnitId === account.id && p.budgetCost);
  if (!projects.length) return { score: null, factors: [], note: "No budgeted initiatives" };
  let score = 100;
  const factors: HealthFactor[] = [];
  for (const p of projects) {
    const f = projectFinancials(ds, p, asOf);
    const over = (f.cost.forecastTotal - (p.budgetCost ?? 0)) / (p.budgetCost ?? 1);
    if (over > 0.02) {
      const pen = Math.min(40, Math.round(over * 150));
      score -= pen;
      factors.push({ label: `${p.name} forecast ${Math.round(over * 100)}% over budget`, effect: -pen, kind: "calculated", link: { type: "project", id: p.id } });
    }
  }
  return { score: clamp(score), factors };
}

export function lastClientContact(ds: Dataset, accountId: string, asOf: ISODate): ISODate | null {
  let last: ISODate | null = null;
  for (const t of indexOf(ds).threadsByAccount.get(accountId) ?? []) {
    for (const m of t.messages) {
      const d = m.sentAt.slice(0, 10);
      if (m.authorSide === "client" && d <= asOf && (!last || d > last)) last = d;
    }
  }
  return last;
}

export function accountHealth(ds: Dataset, account: Account, signals: Signal[], asOf: ISODate): AccountHealth {
  const profile = getProfile(ds.org.profileId);
  const lastContact = lastClientContact(ds, account.id, asOf);
  const hasComms = (indexOf(ds).threadsByAccount.get(account.id) ?? []).some((t) => t.messages.some((m) => m.sentAt.slice(0, 10) <= asOf && daysBetween(m.sentAt.slice(0, 10), asOf) <= 120));
  const components: HealthComponent[] = profile.healthComponents.flatMap((c) => {
    const r: Omit<HealthComponent, "key" | "label" | "weight"> & { notApplicable?: boolean } =
      c.key === "media" ? mediaComponent(ds, account, asOf)
      : c.key === "delivery" ? deliveryComponent(ds, account, asOf)
      : c.key === "financial" ? financialComponent(ds, account, asOf)
      : c.key === "relationship" ? relationshipComponent(signals, account, hasComms)
      : c.key === "engagement" ? engagementComponent(lastContact, asOf)
      : c.key === "usage" ? usageComponent(ds, account)
      : budgetComponent(ds, account, asOf);
    if (r.notApplicable) return [];
    return [{ key: c.key, label: c.label, weight: c.weight, score: r.score, factors: r.factors, ...(r.note ? { note: r.note } : {}) }];
  });

  const dataGaps: string[] = [];
  for (const c of components) if (c.score === null && c.note) dataGaps.push(`${c.label}: ${c.note}`);
  if (account.kind !== "business_unit" && lastContact && daysBetween(lastContact, asOf) > 30) dataGaps.push(`No client communication for ${daysBetween(lastContact, asOf)} days`);
  for (const p of indexOf(ds).projectsByAccount.get(account.id) ?? []) {
    if (p.status !== "active" || p.startDate > asOf) continue;
    const f = projectFinancials(ds, p, asOf);
    for (const m of f.missing) if (m.startsWith("No time recorded") || m.startsWith("Remaining-effort estimate")) dataGaps.push(`${p.name}: ${m}`);
  }
  for (const m of ds.mappings) if (m.suggestedAccountId === account.id && m.status === "needs_review") dataGaps.push(`Unconfirmed source mapping: ${m.externalName} (${m.reason})`);

  const scored = components.filter((c) => c.score !== null);
  const wsum = scored.reduce((s, c) => s + c.weight, 0);
  const score = wsum > 0 ? Math.round(scored.reduce((s, c) => s + (c.score as number) * c.weight, 0) / wsum) : null;
  // Components that don't apply to this account (no media bought through us) are left out, not counted as missing.
  const applicable = components.reduce((s, c) => s + c.weight, 0);
  const completeness = applicable > 0 ? components.reduce((s, c) => s + (c.score === null ? 0 : c.weight), 0) / applicable : 0;
  let status: HealthStatus = score === null ? "insufficient" : score >= 75 ? "healthy" : score >= 55 ? "watch" : "at_risk";
  // A critical, unreviewed risk caps the status at "watch" even if other components are strong.
  const critical = signals.some((s) => s.accountId === account.id && s.severity === "critical" && s.polarity === "risk" && !s.autoResolved && s.review.status !== "dismissed");
  if (status === "healthy" && critical) status = "watch";
  if (completeness < 0.7 || dataGaps.length >= 3) status = "insufficient";
  return { accountId: account.id, asOf, score, status, components, dataGaps, completeness, lastClientContact: lastContact };
}
