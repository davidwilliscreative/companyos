import type { Workspace } from "@/data/access";
import type { ID } from "@/domain/types";
import { daysBetween, fmtDate } from "./dates";
import type { Issue } from "./issues";
import { fmtPct, fmtPts } from "./money";

/**
 * Status in plain words, by dimension. A single health score hides
 * contradictions (a "healthy" client with a loss-making, late project), so
 * each dimension is judged separately and hard facts override the weighted
 * score: a blocked milestone is a delivery problem whatever the average says.
 * The score itself stays available behind "Why this status?".
 */

export type Level = "good" | "watch" | "at_risk" | "unknown" | "restricted" | "none";

export interface Dimension {
  key: "relationship" | "delivery" | "financial" | "data" | "intervention";
  label: string;
  level: Level;
  /** Short status word for the badge, e.g. "At risk", "Plan overdue". */
  status: string;
  /** One sentence: the main reason. */
  reason: string;
}

export interface Interpretation {
  overall: Level;
  overallLabel: string;
  headline: string;
  dimensions: Dimension[];
}

export const LEVEL_LABEL: Record<Level, string> = { good: "Good", watch: "Watch", at_risk: "At risk", unknown: "Not enough data", restricted: "Restricted", none: "No active work" };
const RANK: Record<Level, number> = { at_risk: 3, watch: 2, good: 1, unknown: 0, restricted: -1, none: -1 };
const worse = (a: Level, b: Level): Level => (RANK[b] > RANK[a] ? b : a);
const fromScore = (s: number | null | undefined): Level => (s === null || s === undefined ? "unknown" : s >= 75 ? "good" : s >= 55 ? "watch" : "at_risk");

function interventionDimension(ws: Workspace, issues: Issue[]): Dimension {
  const v = (id: ID) => ws.data.people.find((p) => p.id === id)?.name ?? "the owner";
  const label = "Intervention";
  issues = issues.filter((i) => i.kind !== "opportunity");
  if (!issues.length) return { key: "intervention", label, level: "good", status: "None needed", reason: "No open issues." };
  const exec = issues.find((i) => i.executive);
  const overdue = issues.find((i) => i.nextUpdateOverdue);
  const unplanned = issues.filter((i) => !i.plans.some((p) => p.relation === "plan") && (i.severity === "high" || i.severity === "critical"));
  if (exec && !exec.plans.some((p) => p.relation === "plan")) return { key: "intervention", label, level: "at_risk", status: "Executive decision needed", reason: exec.executiveReason ?? exec.title };
  if (overdue) {
    const p = overdue.plans.find((x) => x.relation === "plan")!;
    return { key: "intervention", label, level: "at_risk", status: "Plan overdue", reason: `${p.title} (${v(p.ownerId)}) was due ${fmtDate(p.dueDate)}.` };
  }
  if (unplanned.length) return { key: "intervention", label, level: "watch", status: "Needs a plan", reason: `${unplanned.length} urgent issue${unplanned.length === 1 ? " has" : "s have"} no plan yet.` };
  const p = issues.flatMap((i) => i.plans.filter((x) => x.relation === "plan"))[0];
  if (!p) return { key: "intervention", label, level: "watch", status: "No plan yet", reason: `${issues.length} open issue${issues.length === 1 ? "" : "s"}; suggested next step: ${issues[0].next}` };
  const without = issues.filter((i) => !i.plans.some((x) => x.relation === "plan")).length;
  return { key: "intervention", label, level: "good", status: "Plan in place", reason: `${p.title} (${v(p.ownerId)}), next update ${fmtDate(p.dueDate)}.${without ? ` ${without} other issue${without === 1 ? " has" : "s have"} no plan yet.` : ""}` };
}

/** "Relationship is at risk; delivery and financial are fine." Reasons stay in the rows below. */
function summarize(core: Dimension[]): string {
  const say = (ds: Dimension[]) => ds.map((d, i) => (i === 0 ? d.label : d.label.toLowerCase())).join(" and ");
  const bad = core.filter((d) => d.level === "at_risk");
  const watch = core.filter((d) => d.level === "watch");
  const good = core.filter((d) => d.level === "good");
  const unknown = core.filter((d) => d.level === "unknown");
  const parts: string[] = [];
  if (bad.length) parts.push(`${say(bad)} ${bad.length === 1 ? "is" : "are"} at risk`);
  if (watch.length) parts.push(`${say(watch)} ${watch.length === 1 ? "needs" : "need"} watching`);
  if (good.length && (bad.length || watch.length)) parts.push(`${say(good)} ${good.length === 1 ? "is" : "are"} fine`);
  if (unknown.length) parts.push(`${say(unknown)} cannot be judged yet`);
  const text = parts.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))).join("; ");
  return text ? `${text}.` : "";
}

export function interpretAccount(ws: Workspace, accountId: ID, issues: Issue[]): Interpretation {
  const a = ws.analysis;
  const h = a.health[accountId];
  const comp = (k: string) => h?.components.find((c) => c.key === k);
  const mode = ws.profile.modules.financeMode;
  const projects = ws.data.projects.filter((p) => p.accountId === accountId && p.status !== "completed");
  const mine = issues.filter((i) => i.accountIds.includes(accountId));
  const dims: Dimension[] = [];

  // Relationship: what the client says, with unresolved high-severity signals overriding the average.
  {
    const c = comp("relationship");
    let level = fromScore(c?.score);
    let reason = c?.score === null || !c ? "Not enough recent client communication to judge." : c.factors.filter((f) => f.effect < 0).sort((x, y) => x.effect - y.effect)[0]?.label ?? "No concerns in recent messages.";
    const risks = a.signals.filter((s) => s.accountId === accountId && s.polarity === "risk" && !s.autoResolved && s.review.status !== "dismissed");
    const top = risks.sort((x, y) => (x.severity === "critical" ? -1 : y.severity === "critical" ? 1 : 0))[0];
    if (top && top.confidence !== "low" && (top.severity === "critical" || top.severity === "high")) {
      level = "at_risk";
      reason = `${top.summary} (${top.severity} severity, ${top.confidence} confidence${top.review.status === "unreviewed" ? ", not yet reviewed" : ""}).`;
    } else if (top && top.confidence !== "low") level = worse(level, "watch");
    const positive = a.signals.find((s) => s.accountId === accountId && s.polarity === "positive" && !s.autoResolved);
    if (positive && level !== "good") reason = `${reason.replace(/\.?$/, ".")} Positive feedback elsewhere is noted but does not cancel this.`;
    dims.push({ key: "relationship", label: mode === "budget" ? "Stakeholders" : "Relationship", level, status: LEVEL_LABEL[level], reason });
  }

  // Delivery (or product usage for subscription businesses).
  if (mode === "subscription") {
    const c = comp("usage");
    const level = fromScore(c?.score);
    dims.push({ key: "delivery", label: "Product usage", level, status: LEVEL_LABEL[level], reason: c?.factors.filter((f) => f.effect < 0)[0]?.label ?? c?.note ?? (level === "unknown" ? "No recent usage data." : "Usage is steady.") });
  } else {
    let level: Level = projects.length ? fromScore(comp("delivery")?.score) : "none";
    let reason = projects.length ? "Milestones are on track." : "No active work.";
    const ms = ws.data.milestones.filter((m) => projects.some((p) => p.id === m.projectId)).map((m) => ({ m, st: a.milestones[m.id] })).filter((x) => x.st && x.st.state !== "done");
    const hard = ms.find((x) => x.st.state === "blocked" || x.st.state === "late");
    const soft = ms.find((x) => x.st.state === "awaiting_client" || x.st.slipDays >= 30);
    if (hard) {
      level = "at_risk";
      reason = `"${hard.m.name}" is ${hard.st.state}${hard.m.blockedReason ? `: ${hard.m.blockedReason}` : ""}.`;
    } else if (soft) {
      level = worse(level, "watch");
      reason = soft.st.state === "awaiting_client" ? `"${soft.m.name}" is waiting on approval.` : `"${soft.m.name}" has slipped ${soft.st.slipDays} days.`;
    } else if (level === "unknown" && projects.length) reason = "Not enough recent delivery data.";
    dims.push({ key: "delivery", label: mode === "budget" ? "Initiative delivery" : "Delivery", level, status: LEVEL_LABEL[level], reason });
  }

  // Financial: hard facts (loss-making forecast, overdue invoices, overrun) override the component score.
  {
    const label = mode === "budget" ? "Budget" : mode === "subscription" ? "Payments" : "Financial";
    if (!ws.caps.viewProjectCosts && !ws.caps.viewCommercialTerms) {
      dims.push({ key: "financial", label, level: "restricted", status: "Restricted", reason: "Financial detail is not available to your role." });
    } else {
      let level = fromScore(comp(mode === "budget" ? "budget" : "financial")?.score);
      const reasons: string[] = [];
      for (const p of projects) {
        const f = a.projectFin[p.id];
        if (!f) continue;
        if (f.margin.forecastAtCompletion !== null && f.margin.target !== null) {
          const gap = f.margin.forecastAtCompletion - f.margin.target;
          if (f.margin.forecastAtCompletion < 0) {
            level = "at_risk";
            reasons.push(`${p.name} is forecast to lose money (${fmtPct(f.margin.forecastAtCompletion)} margin, ${fmtPts(gap)} against target)`);
          } else if (gap <= -0.05) {
            level = worse(level, "watch");
            reasons.push(`${p.name} is forecast ${fmtPts(gap)} below its margin target`);
          }
        }
        if (f.budget.forecastVsBudget !== null && f.budget.forecastVsBudget > 0 && p.billing === "internal") {
          level = worse(level, "watch");
          reasons.push(`${p.name} is forecast over budget`);
        }
      }
      for (const r of a.receivables.overdue.filter((x) => x.invoice.accountId === accountId)) {
        level = worse(level, r.daysOverdue > 60 ? "at_risk" : "watch");
        reasons.push(`invoice ${r.invoice.number} is ${r.daysOverdue} days overdue`);
      }
      const reason = reasons.length ? `${reasons[0].charAt(0).toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? `; ${reasons.slice(1).join("; ")}` : ""}.` : level === "unknown" ? "Not enough financial data." : "No overdue invoices or margin problems.";
      dims.push({ key: "financial", label, level, status: LEVEL_LABEL[level], reason });
    }
  }

  // Data confidence: how much of the picture is actually known.
  {
    const gaps = h?.dataGaps ?? [];
    // A stale source lowers confidence only where this account has data that depends on it.
    const hasInvoices = a.receivables.open.some((r) => r.invoice.accountId === accountId);
    const stale = ws.sources.filter((s) => s.affects.some((x) => (/receivable/i.test(x) && hasInvoices) || /usage/i.test(x)));
    const missingCost = projects.some((p) => (a.projectFin[p.id]?.hours.withoutCostRate ?? 0) > 0);
    const completeness = h?.completeness ?? 0;
    const level: Level = h?.status === "insufficient" || completeness < 0.6 ? "at_risk" : gaps.length || missingCost || completeness < 0.9 ? "watch" : stale.length ? "watch" : "good";
    const status = level === "good" ? "High" : level === "watch" ? "Medium" : "Low";
    const reason = gaps[0] ?? (missingCost ? "Some hours have no cost rate, so costs are understated." : stale[0] ? `Invoice and payment status may be out of date (${stale[0].provider} sync problem).` : "Records are complete and current.");
    dims.push({ key: "data", label: "Data confidence", level, status, reason });
  }

  dims.push(interventionDimension(ws, mine));

  const core = dims.filter((d) => d.key === "relationship" || d.key === "delivery" || d.key === "financial");
  const known = core.filter((d) => d.level !== "unknown" && d.level !== "restricted" && d.level !== "none");
  const overall: Level = h?.status === "insufficient" && !known.some((d) => d.level === "at_risk") ? "unknown" : known.reduce<Level>((m, d) => worse(m, d.level), known.length ? "good" : "unknown");
  const headline = overall === "unknown" ? "Not enough current information to judge; missing data is not treated as healthy." : overall === "good" ? "No problems in relationship, delivery or finances." : summarize(core);
  return { overall, overallLabel: overall === "unknown" ? "Not enough data" : overall === "good" ? "On track" : overall === "watch" ? "Watch" : "At risk", headline, dimensions: dims };
}

/** Same dimensions for one project: delivery, financial, data and intervention. */
export function interpretProject(ws: Workspace, projectId: ID, issues: Issue[]): Interpretation {
  const a = ws.analysis;
  const p = ws.data.projects.find((x) => x.id === projectId)!;
  const f = a.projectFin[projectId];
  const mine = issues.filter((i) => i.projectIds.includes(projectId));
  const dims: Dimension[] = [];
  const ms = ws.data.milestones.filter((m) => m.projectId === projectId).map((m) => ({ m, st: a.milestones[m.id] })).filter((x) => x.st && x.st.state !== "done");
  const hard = ms.find((x) => x.st.state === "blocked" || x.st.state === "late");
  const soft = ms.find((x) => x.st.state === "awaiting_client" || x.st.slipDays >= 30);
  const slip = daysBetween(p.originalEndDate, p.currentEndDate);
  {
    const level: Level = p.status === "completed" ? "good" : hard ? "at_risk" : soft || slip >= 30 ? "watch" : "good";
    const reason = hard ? `"${hard.m.name}" is ${hard.st.state}${hard.m.blockedReason ? `: ${hard.m.blockedReason}` : ""}.` : soft ? (soft.st.state === "awaiting_client" ? `"${soft.m.name}" is waiting on approval.` : `"${soft.m.name}" has slipped ${soft.st.slipDays} days.`) : slip > 0 ? `End date moved ${slip} days.` : "Milestones are on track.";
    dims.push({ key: "delivery", label: "Delivery", level, status: LEVEL_LABEL[level], reason });
  }
  if (!ws.caps.viewProjectCosts || !f) dims.push({ key: "financial", label: p.billing === "internal" ? "Budget" : "Financial", level: "restricted", status: "Restricted", reason: "Project costs are not available to your role." });
  else if (p.billing === "internal") {
    const over = f.budget.forecastVsBudget ?? 0;
    const level: Level = over > (p.budgetCost ?? 0) * 0.05 ? "at_risk" : over > 0 ? "watch" : "good";
    dims.push({ key: "financial", label: "Budget", level, status: LEVEL_LABEL[level], reason: over > 0 ? `Forecast cost exceeds the approved budget by ${Math.round((over / (p.budgetCost || 1)) * 100)}%.` : "Forecast within budget." });
  } else {
    const m = f.margin.forecastAtCompletion;
    const gap = m !== null && f.margin.target !== null ? m - f.margin.target : null;
    const level: Level = m === null ? "unknown" : m < 0 || (gap !== null && gap < -0.25) ? "at_risk" : gap !== null && gap <= -0.05 ? "watch" : "good";
    dims.push({ key: "financial", label: "Financial", level, status: LEVEL_LABEL[level], reason: m === null ? "No forecast available." : m < 0 ? `Forecast to lose money: ${fmtPct(m)} margin, ${fmtPts(gap)} against target.` : gap !== null && gap < 0 ? `Forecast margin ${fmtPct(m)}, ${fmtPts(gap)} against target.` : `Forecast margin ${fmtPct(m)}, at or above target.` });
  }
  {
    const missing = f?.missing ?? [];
    const level: Level = missing.length > 1 ? "at_risk" : missing.length ? "watch" : "good";
    dims.push({ key: "data", label: "Data confidence", level, status: level === "good" ? "High" : level === "watch" ? "Medium" : "Low", reason: missing[0] ?? "Time, cost and milestone records are complete." });
  }
  dims.push(interventionDimension(ws, mine));
  const core = dims.filter((d) => d.key === "delivery" || d.key === "financial");
  const known = core.filter((d) => !["unknown", "restricted", "none"].includes(d.level));
  const overall = known.reduce<Level>((m, d) => worse(m, d.level), known.length ? "good" : "unknown");
  return {
    overall,
    overallLabel: overall === "good" ? "On track" : overall === "watch" ? "Watch" : overall === "at_risk" ? "At risk" : "Not enough data",
    headline: overall === "good" ? "Delivery and finances are on track." : overall === "unknown" ? "Not enough information to judge." : summarize(core),
    dimensions: dims,
  };
}
