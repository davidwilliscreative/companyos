import type { Workspace } from "@/data/access";
import { daysBetween } from "./dates";
import { interpretAccount, interpretProject } from "./interpret";
import type { Issue } from "./issues";

/**
 * Rows and preset views for the Clients and Projects lists. Kept out of the
 * pages so the preset rules can be tested and stay the same wherever a view
 * is linked from (Home links to several of them).
 */

/** Renewals inside this window count as "soon". */
export const RENEWAL_WINDOW_DAYS = 120;
export const ACCOUNT_VIEWS = ["mine", "attention", "renewals", "overdue"] as const;
export type AccountView = (typeof ACCOUNT_VIEWS)[number];
export const PROJECT_VIEWS = ["mine", "intervention", "gaps"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];
export const STATUS_RANK = { at_risk: 0, watch: 1, unknown: 2, good: 3, restricted: 4, none: 5 } as const;

export function parseView<T extends string>(views: readonly T[], x: unknown): T | null {
  return typeof x === "string" && (views as readonly string[]).includes(x) ? (x as T) : null;
}

export function accountRows(ws: Workspace, allIssues: Issue[]) {
  const a = ws.analysis;
  const issues = allIssues.filter((i) => i.kind !== "opportunity");
  return ws.data.accounts.map((acc) => {
    const own = issues.filter((i) => i.accountIds.includes(acc.id));
    const it = interpretAccount(ws, acc.id, allIssues);
    const projects = ws.data.projects.filter((p) => p.accountId === acc.id && p.status !== "completed");
    const lines = ws.finance?.summary.lines.filter((l) => l.accountId === acc.id) ?? null;
    const revenue = lines ? lines.reduce((s, l) => s + (l.earned ?? 0), 0) : null;
    const cost = lines ? lines.reduce((s, l) => s + l.labor + l.contractor + l.expenses, 0) : null;
    const margin = revenue && cost !== null ? (revenue - cost) / revenue : null;
    const sub = ws.data.subscriptions.find((s) => s.accountId === acc.id);
    const overdue = a.receivables.overdue.filter((s) => s.invoice.accountId === acc.id).reduce((s, x) => s + x.outstanding, 0);
    const renewal = a.renewals.find((r) => r.accountId === acc.id);
    const renewalDays = renewal ? daysBetween(ws.org.demoDate, renewal.renewalDate) : null;
    const renewalRisk = own.some((i) => i.kind === "relationship");
    const budget = ws.data.projects.filter((p) => p.accountId === acc.id && p.billing === "internal").reduce((s, p) => s + (p.budgetCost ?? 0), 0);
    const urgent = own.filter((i) => i.severity === "critical" || i.severity === "high");
    return { acc, it, own, urgent, projects, revenue, margin, sub, overdue, renewal, renewalDays, renewalRisk, budget };
  });
}
export type AccountRow = ReturnType<typeof accountRows>[number];

export function inAccountView(r: AccountRow, view: AccountView | null, userId: string): boolean {
  switch (view) {
    case "mine":
      return r.acc.ownerId === userId;
    case "attention":
      return r.own.length > 0 || r.it.overall === "at_risk";
    case "renewals":
      return r.renewalDays !== null && r.renewalDays <= RENEWAL_WINDOW_DAYS;
    case "overdue":
      return r.overdue > 0;
    default:
      return true;
  }
}

export function projectRows(ws: Workspace, issues: Issue[]) {
  const a = ws.analysis;
  const gapIds = new Set(a.capacity.gaps.map((g) => g.projectId));
  return ws.data.projects.map((p) => {
    const f = a.projectFin[p.id];
    const worst = ws.data.milestones
      .filter((m) => m.projectId === p.id)
      .map((m) => a.milestones[m.id])
      .filter((x) => x && x.state !== "done");
    const order = ["late", "blocked", "awaiting_client", "at_risk", "on_track"] as const;
    const worstState = order.find((s) => worst.some((w) => w.state === s));
    const marginProblem = !!f && f.margin.variance !== null && f.margin.variance < -0.05;
    const budgetProblem = !!f && f.budget.forecastVsBudget !== null && f.budget.forecastVsBudget > 0;
    const scheduleProblem = worstState === "late" || worstState === "blocked" || worstState === "awaiting_client" || (f?.schedule.slipDays ?? 0) > 14;
    const own = issues.filter((i) => i.kind !== "opportunity" && i.projectIds.includes(p.id));
    const it = interpretProject(ws, p.id, issues);
    const active = p.status !== "completed";
    const intervention = active && (it.overall === "at_risk" || own.some((i) => i.severity === "critical" || i.severity === "high"));
    const staffingGap = active && (gapIds.has(p.id) || own.some((i) => i.kind === "staffing"));
    return { p, f, worstState, marginProblem, budgetProblem, scheduleProblem, own, it, intervention, staffingGap };
  });
}
export type ProjectRow = ReturnType<typeof projectRows>[number];

export function inProjectView(r: ProjectRow, view: ProjectView | null, userId: string): boolean {
  switch (view) {
    case "mine":
      return r.p.ownerId === userId && r.p.status !== "completed";
    case "intervention":
      return r.intervention;
    case "gaps":
      return r.staffingGap;
    default:
      return true;
  }
}
