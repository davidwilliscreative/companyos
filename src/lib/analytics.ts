import type { Dataset, EvidenceLink, ID, ISODate, Opportunity, Severity, Signal } from "@/domain/types";
import { getProfile } from "@/domain/profiles";
import type { OrgOverlay } from "@/data/state";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { capacityOverview, type CapacityOverview } from "./calc/capacity";
import { periodByKey, receivables, type Period } from "./calc/company";
import { milestoneState, projectFinancials, type MilestoneState, type ProjectFinancials } from "./calc/finance";
import { accountHealth, type AccountHealth } from "./calc/health";
import { indexOf } from "./calc/index";
import { detectSignals } from "./signals/engine";

/**
 * Analysis = everything derived from a dataset at the demo date. Computed on
 * the server from the full dataset; access.ts scopes it per role before any
 * UI or assistant code sees it.
 */

export interface AttentionItem {
  id: string;
  kind: "account" | "renewal" | "margin" | "schedule" | "invoice" | "capacity" | "opportunity" | "data" | "action";
  title: string;
  why: string;
  next: string;
  severity: Severity;
  impactValue: number | null;
  impactLabel: string;
  ownerId: ID;
  dueDate: ISODate;
  accountId?: ID;
  projectId?: ID;
  links: EvidenceLink[];
  score: number;
}

export interface Analysis {
  asOf: ISODate;
  period: Period;
  projectFin: Record<ID, ProjectFinancials>;
  milestones: Record<ID, { state: MilestoneState; due: ISODate; slipDays: number }>;
  signals: Signal[];
  opportunities: Opportunity[];
  health: Record<ID, AccountHealth>;
  healthPrev: Record<ID, number | null>;
  receivables: ReturnType<typeof receivables>;
  capacity: CapacityOverview;
  attention: AttentionItem[];
  renewals: { accountId: ID; contractId: ID; name: string; renewalDate: ISODate; noticeDate: ISODate | null; annualValue: number }[];
}

const SEV_W: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function mergeReviews(ds: Dataset, raw: ReturnType<typeof detectSignals>, overlay: OrgOverlay | null): Signal[] {
  return raw.map((s) => {
    const r = overlay?.signalReviews[s.id];
    const review = r ? { status: r.status, by: r.by, at: r.at, note: r.note } : { status: "unreviewed" as const };
    const newEvidence = !!r && r.status === "dismissed" && s.lastEvidenceOn > r.lastEvidenceAtReview;
    return { ...s, review: newEvidence ? { ...review, status: "unreviewed" as const, note: `Previously dismissed on ${r!.at.slice(0, 10)}; new evidence since.` } : review, newEvidenceSinceReview: newEvidence };
  });
}

function buildOpportunities(ds: Dataset, signals: Signal[], health: Record<ID, AccountHealth>, overlay: OrgOverlay | null): Opportunity[] {
  if (!getProfile(ds.org.profileId).modules.expansion) return [];
  const out: Opportunity[] = [];
  for (const s of signals) {
    if (s.category !== "expansion_interest" || s.autoResolved) continue;
    const text = s.evidence.map((e) => e.excerpt.toLowerCase()).join(" ");
    const offerings = ds.org.serviceCatalog.map((o) => ({ o, hits: o.keywords.filter((k) => text.includes(k)).length })).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits);
    const best = offerings[0]?.o;
    const h = health[s.accountId];
    const risks = signals.filter((x) => x.accountId === s.accountId && x.polarity === "risk" && !x.autoResolved && x.review.status !== "dismissed" && (x.severity === "high" || x.severity === "critical"));
    const budgetMention = /budget|q1|q4|next quarter/.test(text);
    let readiness: Opportunity["readiness"] = "early";
    const reasons: string[] = [];
    if (h?.score !== null && h?.score !== undefined) reasons.push(`account health ${h.score}/100`);
    if (budgetMention) reasons.push("client mentioned budget or timing");
    if (risks.length) reasons.push(`${risks.length} unresolved high-severity risk${risks.length === 1 ? "" : "s"} on the account`);
    if ((h?.score ?? 0) >= 70 && !risks.length && budgetMention) readiness = "ready";
    else if ((h?.score ?? 0) >= 55 && !risks.length) readiness = "developing";
    const seed = ds.opportunitySeeds[s.id];
    const edit = overlay?.opportunityEdits[s.id];
    const clientEv = s.evidence.filter((e) => e.authorSide === "client");
    const strongest = (best && clientEv.find((e) => best.keywords.some((k) => e.excerpt.toLowerCase().includes(k)))) ?? clientEv[0] ?? s.evidence[0];
    out.push({
      id: `opp_${s.accountId}`,
      orgId: ds.org.id,
      accountId: s.accountId,
      signalId: s.id,
      need: strongest?.excerpt ?? s.summary,
      offering: best ? best.name : "No matching offering in the service catalog",
      offeringId: best?.id,
      evidence: s.evidence,
      readiness,
      readinessReason: `${readiness === "ready" ? "Ready" : readiness === "developing" ? "Developing" : "Early"}: ${reasons.join("; ") || "limited information"}.`,
      nextStep: edit?.nextStep ?? seed?.nextStep ?? "Qualify need, budget, timing and decision-maker.",
      ownerId: s.ownerId,
      estimatedValue: edit?.estimatedValue !== undefined ? edit.estimatedValue : seed?.estimatedValue ?? null,
      estimatedBy: edit?.estimatedBy ?? seed?.estimatedBy,
      status: edit?.status ?? (s.review.status === "dismissed" ? "dismissed" : s.review.status === "confirmed" ? "qualified" : "open"),
    });
  }
  return out;
}

export function renewalsList(ds: Dataset) {
  const out: Analysis["renewals"] = [];
  for (const c of ds.contracts) {
    if (!c.renewalDate || !c.accountId) continue;
    if (c.renewalDate < ds.org.demoDate) continue;
    out.push({ accountId: c.accountId, contractId: c.id, name: c.name, renewalDate: c.renewalDate, noticeDate: c.noticeDays ? addDays(c.renewalDate, -c.noticeDays) : null, annualValue: (c.monthlyFee ?? 0) * 12 + (c.annualValue ?? 0) });
  }
  for (const s of ds.subscriptions) {
    if (s.renewalDate < ds.org.demoDate) continue;
    out.push({ accountId: s.accountId, contractId: s.id, name: `${s.plan} subscription`, renewalDate: s.renewalDate, noticeDate: null, annualValue: s.mrr * 12 });
  }
  return out.sort((a, b) => (a.renewalDate < b.renewalDate ? -1 : 1));
}

export function computeAnalysis(ds: Dataset, overlay: OrgOverlay | null, periodKey?: string): Analysis {
  const asOf = ds.org.demoDate;
  const idx = indexOf(ds);
  const profile = getProfile(ds.org.profileId);
  const period = periodByKey(ds, periodKey);

  const projectFin: Record<ID, ProjectFinancials> = {};
  for (const p of ds.projects) projectFin[p.id] = projectFinancials(ds, p, asOf);
  const milestones: Analysis["milestones"] = {};
  for (const m of ds.milestones) milestones[m.id] = milestoneState(m, asOf);

  const signals = mergeReviews(ds, detectSignals(ds, { asOf }), overlay);
  const prevAsOf = addDays(asOf, -30);
  const prevSignals = mergeReviews(ds, detectSignals(ds, { asOf: prevAsOf }), null);
  const health: Record<ID, AccountHealth> = {};
  const healthPrev: Record<ID, number | null> = {};
  for (const a of ds.accounts) {
    health[a.id] = accountHealth(ds, a, signals, asOf);
    healthPrev[a.id] = a.since > prevAsOf ? null : accountHealth(ds, a, prevSignals, prevAsOf).score;
  }
  const opportunities = buildOpportunities(ds, signals, health, overlay);
  const ar = receivables(ds, asOf);
  const capacity = capacityOverview(ds, period.start < ds.org.dataStart ? ds.org.dataStart : period.start, period.end);
  const renewals = renewalsList(ds);

  // ---------- Prioritized attention queue ----------
  const items: AttentionItem[] = [];
  const add = (i: Omit<AttentionItem, "score">) => {
    const impact = i.impactValue ?? 0;
    items.push({ ...i, score: SEV_W[i.severity] * 100 + Math.min(99, Math.log10(1 + Math.abs(impact)) * 15) - Math.max(0, daysBetween(asOf, i.dueDate)) * 0.5 });
  };
  const ownerOf = (accountId?: ID) => (accountId ? idx.account.get(accountId)?.ownerId : undefined) ?? ds.org.demoPersonas.executive;

  for (const a of ds.accounts) {
    const h = health[a.id];
    const prev = healthPrev[a.id];
    const delta = h.score !== null && prev !== null ? h.score - prev : null;
    if (h.status === "insufficient") {
      add({ id: `att_data_${a.id}`, kind: "data", title: `Not enough current information on ${a.name}`, why: h.dataGaps.slice(0, 2).join("; "), next: "Confirm status directly with the owner and fix the missing data sources.", severity: "medium", impactValue: null, impactLabel: "Visibility gap", ownerId: a.ownerId, dueDate: addDays(asOf, 3), accountId: a.id, links: [{ type: "account", id: a.id }] });
    } else if (h.status === "at_risk" || (delta !== null && delta <= -10)) {
      const top = h.components.flatMap((c) => c.factors).filter((f) => f.effect < 0).sort((x, y) => x.effect - y.effect).slice(0, 2);
      add({ id: `att_acct_${a.id}`, kind: "account", title: `${a.name} health ${h.score}/100${delta !== null && delta < 0 ? ` (down ${-delta} in 30 days)` : ""}`, why: top.map((f) => f.label).join("; ") || "Multiple negative factors", next: "Review the account summary and agree a recovery owner and plan.", severity: h.status === "at_risk" ? "high" : "medium", impactValue: null, impactLabel: "Relationship", ownerId: a.ownerId, dueDate: addDays(asOf, 2), accountId: a.id, links: [{ type: "account", id: a.id }, ...top.filter((f) => f.link).map((f) => f.link as EvidenceLink)] });
    }
  }

  for (const r of renewals) {
    const days = daysBetween(asOf, r.renewalDate);
    if (days > 75) continue;
    const risk = signals.find((s) => s.accountId === r.accountId && s.category === "renewal_risk" && !s.autoResolved && s.review.status !== "dismissed");
    const h = health[r.accountId];
    if (!risk && (h?.score ?? 100) >= 70) continue;
    const name = idx.account.get(r.accountId)?.name ?? r.accountId;
    add({ id: `att_renew_${r.contractId}`, kind: "renewal", title: `${name} renewal on ${fmtDate(r.renewalDate)} is at risk`, why: risk ? `${risk.summary}. ${risk.evidence.length} supporting messages.` : `Health ${h?.score}/100 ahead of renewal.`, next: r.noticeDate ? `Agree a renewal plan before the notice date (${fmtDate(r.noticeDate)}).` : "Agree a renewal plan with the executive sponsor.", severity: risk && (risk.severity === "critical" || risk.severity === "high") ? "critical" : "high", impactValue: r.annualValue, impactLabel: "Annual contract value at stake", ownerId: ownerOf(r.accountId), dueDate: r.noticeDate && r.noticeDate > asOf ? r.noticeDate : addDays(asOf, 7), accountId: r.accountId, links: [{ type: "account", id: r.accountId }, ...(risk ? [{ type: "signal" as const, id: risk.id }] : [])] });
  }

  if (profile.modules.projectMargins) {
    for (const p of ds.projects) {
      const f = projectFin[p.id];
      if (p.status === "completed" || f.margin.forecastAtCompletion === null || f.margin.target === null) continue;
      const gap = f.margin.forecastAtCompletion - f.margin.target;
      if (gap > -0.05) continue;
      const shortfall = (f.revenue.atCompletion ?? 0) * f.margin.target - (f.margin.forecastProfit ?? 0);
      add({ id: `att_margin_${p.id}`, kind: "margin", title: `${p.name} forecast margin ${(f.margin.forecastAtCompletion * 100).toFixed(0)}% vs ${(f.margin.target * 100).toFixed(0)}% target`, why: f.unbilled.items.length ? `${f.unbilled.items.map((u) => u.label).join("; ")}.` : `Forecast cost ${Math.round(f.cost.forecastTotal).toLocaleString()} against revenue ${Math.round(f.revenue.atCompletion ?? 0).toLocaleString()}.`, next: "Review the calculation, then test pricing or staffing in the what-if calculator before the next client conversation.", severity: gap < -0.25 ? "high" : "medium", impactValue: shortfall, impactLabel: "Profit below target at completion", ownerId: p.ownerId, dueDate: addDays(asOf, 7), accountId: p.accountId, projectId: p.id, links: [{ type: "project", id: p.id }, { type: "calculation", id: `margin:${p.id}` }] });
    }
  }
  for (const p of ds.projects) {
    if (p.billing !== "internal" || p.status === "completed") continue;
    const f = projectFin[p.id];
    if (f.budget.forecastVsBudget !== null && f.budget.forecastVsBudget > (p.budgetCost ?? 0) * 0.05) {
      add({ id: `att_budget_${p.id}`, kind: "margin", title: `${p.name} forecast over budget`, why: `Forecast cost exceeds the approved budget by ${Math.round(f.budget.forecastVsBudget).toLocaleString()}.`, next: "Decide whether to fund the overrun, descope, or re-phase.", severity: "medium", impactValue: f.budget.forecastVsBudget, impactLabel: "Forecast overrun", ownerId: p.ownerId, dueDate: addDays(asOf, 10), accountId: p.accountId, projectId: p.id, links: [{ type: "project", id: p.id }, { type: "calculation", id: `margin:${p.id}` }] });
    }
  }

  for (const m of ds.milestones) {
    const st = milestones[m.id];
    if (st.state === "done") continue;
    const p = idx.project.get(m.projectId);
    if (!p || p.status === "completed") continue;
    if (st.state === "awaiting_client" && m.awaitingClientSince && daysBetween(m.awaitingClientSince, asOf) >= 14) {
      add({ id: `att_ms_${m.id}`, kind: "schedule", title: `${p.name}: "${m.name}" waiting on ${p.kind === "client" ? "the client" : "approval"} for ${daysBetween(m.awaitingClientSince, asOf)} days`, why: m.blockedReason ?? "Awaiting approval", next: "Escalate to the decision-maker with a decision date and the cost of further delay.", severity: "high", impactValue: m.billingAmount ?? null, impactLabel: m.billingAmount ? "Milestone billing held" : "Schedule", ownerId: m.ownerId, dueDate: addDays(asOf, 2), accountId: p.accountId, projectId: p.id, links: [{ type: "milestone", id: m.id }, { type: "project", id: p.id }] });
    } else if (st.state === "late" || (st.state === "blocked" && daysBetween(asOf, st.due) <= 14) || st.slipDays >= 30) {
      add({ id: `att_ms_${m.id}`, kind: "schedule", title: `${p.name}: "${m.name}" ${st.state === "late" ? "is late" : st.state === "blocked" ? "is blocked" : `has slipped ${st.slipDays} days`}`, why: m.blockedReason ?? m.dueChanges.at(-1)?.reason ?? "Behind plan", next: "Confirm the owner, the blocker and a realistic date.", severity: st.state === "late" || st.state === "blocked" ? "high" : "medium", impactValue: m.billingAmount ?? null, impactLabel: m.billingAmount ? "Milestone billing at risk" : "Schedule", ownerId: m.ownerId, dueDate: addDays(asOf, 3), accountId: p.accountId, projectId: p.id, links: [{ type: "milestone", id: m.id }, { type: "project", id: p.id }] });
    }
  }

  for (const s of ar.overdue) {
    if (s.daysOverdue < 10) continue;
    add({ id: `att_inv_${s.invoice.id}`, kind: "invoice", title: `Invoice ${s.invoice.number} (${idx.account.get(s.invoice.accountId)?.name}) is ${s.daysOverdue} days overdue`, why: `Outstanding ${Math.round(s.outstanding).toLocaleString()} since ${fmtDate(s.invoice.dueDate)}.`, next: s.daysOverdue > 60 ? "Escalate collection and confirm a payment date; excluded from the base-case cash forecast." : "Chase payment and confirm a date.", severity: s.daysOverdue > 60 ? "high" : "medium", impactValue: s.outstanding, impactLabel: "Cash outstanding", ownerId: ds.org.demoPersonas.finance, dueDate: addDays(asOf, 2), accountId: s.invoice.accountId, links: [{ type: "invoice", id: s.invoice.id }, { type: "account", id: s.invoice.accountId }] });
  }

  for (const pc of capacity.overallocated) {
    const projects = pc.projects.map((x) => idx.project.get(x.projectId)?.name).filter(Boolean);
    const blockedTasks = ds.tasks.filter((t) => t.assigneeId === pc.person.id && t.status === "blocked");
    add({ id: `att_cap_${pc.person.id}`, kind: "capacity", title: `${pc.person.name} is planned at up to ${Math.round(pc.upcoming.peakPct * 100)}% of capacity in the next 4 weeks`, why: `Assigned to ${projects.length} active projects (${projects.join(", ")}).${blockedTasks.length ? ` ${blockedTasks.length} task(s) blocked waiting on them.` : ""}`, next: "Rebalance assignments or add capacity before the next milestone.", severity: pc.upcoming.peakPct > 1.1 ? "high" : "medium", impactValue: null, impactLabel: `${projects.length} projects affected`, ownerId: idx.project.get(pc.projects[0]?.projectId ?? "")?.ownerId ?? ds.org.demoPersonas.executive, dueDate: addDays(asOf, 4), links: [{ type: "person", id: pc.person.id }, ...blockedTasks.map((t) => ({ type: "task" as const, id: t.id }))] });
  }

  for (const o of opportunities) {
    if (o.readiness === "early" || o.status === "dismissed") continue;
    add({ id: `att_opp_${o.id}`, kind: "opportunity", title: `${idx.account.get(o.accountId)?.name}: ${o.offering}`, why: `“${o.need}”`, next: o.nextStep, severity: o.readiness === "ready" ? "medium" : "low", impactValue: o.estimatedValue, impactLabel: o.estimatedValue ? "Manual estimate (not committed revenue)" : "Value not estimated", ownerId: o.ownerId, dueDate: addDays(asOf, 7), accountId: o.accountId, links: [{ type: "opportunity", id: o.id }, { type: "signal", id: o.signalId }] });
  }

  for (const act of ds.actions) {
    if ((act.status === "open" || act.status === "in_progress") && act.dueDate < asOf) {
      add({ id: `att_act_${act.id}`, kind: "action", title: `Overdue action: ${act.title}`, why: `Due ${fmtDate(act.dueDate)}, status ${act.status.replace("_", " ")}.`, next: "Owner to update status or agree a new date.", severity: act.severity, impactValue: null, impactLabel: act.impact, ownerId: act.ownerId, dueDate: asOf, accountId: act.accountId, links: [...act.links] });
    }
  }

  items.sort((a, b) => b.score - a.score);
  return { asOf, period, projectFin, milestones, signals, opportunities, health, healthPrev, receivables: ar, capacity, attention: items, renewals };
}
