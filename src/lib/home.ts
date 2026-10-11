import type { Workspace } from "@/data/access";
import type { RoleId } from "@/domain/types";
import { aggregateScope } from "./permissions";
import type { ChangeItem } from "./changes";
import { daysBetween, fmtDate } from "./dates";
import { buildIssues, issuesForRole, type Issue } from "./issues";
import { fmtMoney, fmtPct } from "./money";

/**
 * Role Homes. Each role gets a short briefing, about four figures with their
 * scope and period, the 3–5 issues that matter most to that role, and what
 * changed since the last visit. Everything else lives in its module.
 */

export interface Metric {
  label: string;
  value: string;
  /** Who the figure covers: "Company-wide", "Your accounts", "All connections". */
  scope: string;
  /** When the figure applies, e.g. "Q3 2026 · Jul 1 – Sep 30" or "As of Oct 5". */
  period: string;
  time: "historical" | "current" | "forecast";
  kind: "observed" | "calculated" | "inferred" | "estimate";
  sub?: string;
  /** Short warnings shown on the figure, e.g. "Incomplete costs". `detail` is the full sentence. */
  warnings: { label: string; detail: string }[];
  href?: string;
  calcHref?: string;
  tone?: "good" | "warn" | "bad";
}

export interface HomeModel {
  role: RoleId;
  greeting: string;
  focus: string;
  briefing: string[];
  metrics: Metric[];
  issues: Issue[];
  /** Urgent counts are always shown, even when the list is cut to the top few. */
  counts: { total: number; urgent: number; executive: number; shownUrgent: number };
  since: { from: string; label: string; items: ChangeItem[]; more: number };
  /** Source problems that affect the figures on this page. */
  dataWarnings: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function homeFor(ws: Workspace): HomeModel {
  const role = ws.ctx.role;
  const all = buildIssues(ws);
  const ranked = issuesForRole(all, role, ws.user.id);
  const top = ranked.slice(0, 5);
  const urgent = ranked.filter((i) => i.severity === "critical" || i.severity === "high");
  const money = (n: number | null | undefined) => fmtMoney(n, ws.org.reportingCurrency, { compact: true });
  const a = ws.analysis;
  const fin = ws.finance;
  const t = ws.profile.terms;
  const mode = ws.profile.modules.financeMode;
  const scope = aggregateScope(ws.caps);
  const periodLabel = `${a.period.label.replace(/ \(.*\)$/, "")} · ${fmtDate(a.period.start, { year: false })} – ${fmtDate(a.period.end)}`;
  const asOf = `As of ${fmtDate(ws.org.demoDate)}`;
  const costWarning = fin && fin.summary.missing.length ? [{ label: "Incomplete costs", detail: fin.summary.missing.join(" ") }] : [];
  const sourceWarn = (re: RegExp) => ws.sources.filter((s) => s.affects.some((x) => re.test(x))).map((s) => ({ label: "Source out of date", detail: s.summary }));

  const metrics: Metric[] = [];
  const briefing: string[] = [];

  const lead = top[0];
  const issueSentence = ranked.length ? `${plural(ranked.length, "issue needs", "issues need")} attention${urgent.length ? `, ${urgent.length} of them urgent` : ""}. Most pressing: ${lead.title}.` : "Nothing needs attention right now.";

  switch (role) {
    case "executive": {
      const exec = ranked.filter((i) => i.executive);
      briefing.push(exec.length ? `${plural(exec.length, "issue needs", "issues need")} an executive decision. First: ${exec[0].title}.` : issueSentence);
      if (fin && mode === "delivery") {
        briefing.push(
          `${a.period.label}: ${money(fin.summary.earnedRevenue)} earned at a ${fmtPct(fin.summary.deliveryMargin)} delivery margin. After payroll for non-billable time and overhead, the operating result is ${money(fin.summary.operatingResult)}${costWarning.length ? "; costs are incomplete, so both read better than they are" : ""}.`,
        );
      }
      if (fin?.cash) briefing.push(`Cash is forecast to bottom out at ${money(fin.cash.lowPoint.closing)} in the week of ${fmtDate(fin.cash.lowPoint.weekStart)}.`);
      if (fin && mode === "delivery") {
        metrics.push({
          label: "Operating result",
          value: money(fin.summary.operatingResult),
          scope,
          period: periodLabel,
          time: "historical",
          kind: "calculated",
          sub: "After all payroll and overhead",
          warnings: costWarning,
          href: "/finance",
          calcHref: "/calculations#operating",
          tone: fin.summary.operatingResult < 0 ? "bad" : undefined,
        });
        metrics.push({
          label: "Delivery margin",
          value: fmtPct(fin.summary.deliveryMargin),
          scope,
          period: periodLabel,
          time: "historical",
          kind: "calculated",
          sub: `Before overhead · target ${fmtPct(ws.org.defaultTargetMargin)}`,
          warnings: costWarning,
          href: "/finance",
          calcHref: "/calculations#delivery-margin",
          tone: fin.summary.deliveryMargin !== null && fin.summary.deliveryMargin < ws.org.defaultTargetMargin ? "warn" : undefined,
        });
      }
      pushRevenueMetrics(ws, metrics, scope, periodLabel, asOf);
      if (fin?.cash)
        metrics.push({
          label: "Cash low point",
          value: money(fin.cash.lowPoint.closing),
          scope,
          period: `Next ${fin.cash.weeks.length} weeks · week of ${fmtDate(fin.cash.lowPoint.weekStart)}`,
          time: "forecast",
          kind: "calculated",
          sub: "Base case; excludes invoices 60+ days overdue",
          warnings: sourceWarn(/cash|receivable/i),
          href: "/finance#cash",
          calcHref: "/calculations#cash",
          tone: fin.cash.lowPoint.closing < 0 ? "bad" : undefined,
        });
      pushRenewalAtRisk(ws, all, metrics, scope, money);
      pushBudgetMetrics(ws, metrics, scope, asOf, money);
      break;
    }
    case "finance": {
      const ar = a.receivables;
      const oldest = Math.max(0, ...ar.overdue.map((s) => s.daysOverdue));
      if (ws.profile.modules.invoices)
        briefing.push(ar.overdue.length ? `${money(ar.totalOverdue)} is overdue across ${ar.overdue.length} invoice${ar.overdue.length === 1 ? "" : "s"}; the oldest is ${oldest} days late.` : "No invoices are overdue.");
      const marginIssues = ranked.filter((i) => i.kind === "margin" || i.kind === "budget");
      const overBudget = marginIssues.filter((i) => i.kind === "budget").length;
      const belowMargin = marginIssues.length - overBudget;
      if (marginIssues.length)
        briefing.push(
          `${[belowMargin ? `${plural(belowMargin, t.project.toLowerCase(), t.projects.toLowerCase())} below target margin` : "", overBudget ? `${plural(overBudget, t.project.toLowerCase(), t.projects.toLowerCase())} forecast more than 5% over budget` : ""].filter(Boolean).join("; ")}. Largest: ${marginIssues[0].title}.`.replace(
            /^./,
            (c) => c.toUpperCase(),
          ),
        );
      if (costWarning.length) briefing.push(`Cost records are incomplete for ${a.period.label}: ${fin!.summary.missing[0]}`);
      if (ws.profile.modules.invoices)
        metrics.push({
          label: "Overdue receivables",
          value: money(ar.totalOverdue),
          scope,
          period: asOf,
          time: "current",
          kind: "observed",
          sub: `${ar.overdue.length} invoice${ar.overdue.length === 1 ? "" : "s"} · oldest ${oldest} days`,
          warnings: sourceWarn(/receivable/i),
          href: "/finance#receivables",
          tone: ar.totalOverdue > 0 ? "warn" : undefined,
        });
      if (fin?.cash)
        metrics.push({
          label: "Cash low point",
          value: money(fin.cash.lowPoint.closing),
          scope,
          period: `Next ${fin.cash.weeks.length} weeks`,
          time: "forecast",
          kind: "calculated",
          sub: `Week of ${fmtDate(fin.cash.lowPoint.weekStart)} · base case`,
          warnings: sourceWarn(/cash|receivable/i),
          href: "/finance#cash",
          calcHref: "/calculations#cash",
          tone: fin.cash.lowPoint.closing < 0 ? "bad" : undefined,
        });
      const unbilled = ws.data.projects.reduce((s, p) => s + (a.projectFin[p.id]?.unbilled.totalValue ?? 0), 0);
      if (mode === "delivery")
        metrics.push({ label: "Unbilled work", value: money(unbilled), scope, period: asOf, time: "current", kind: "calculated", sub: "Delivered but not yet invoiced or priced", warnings: [], href: "/finance#unbilled" });
      if (fin && mode === "delivery")
        metrics.push({
          label: "Delivery margin",
          value: fmtPct(fin.summary.deliveryMargin),
          scope,
          period: periodLabel,
          time: "historical",
          kind: "calculated",
          sub: `Before overhead · operating result ${money(fin.summary.operatingResult)}`,
          warnings: costWarning,
          href: "/finance",
          calcHref: "/calculations#delivery-margin",
        });
      pushRevenueMetrics(ws, metrics, scope, periodLabel, asOf);
      pushBudgetMetrics(ws, metrics, scope, asOf, money);
      break;
    }
    case "account_owner": {
      const mine = ranked.filter((i) => i.ownerId === ws.user.id);
      briefing.push(
        `Across your ${plural(ws.data.accounts.length, t.account.toLowerCase(), t.accounts.toLowerCase())}, ${ranked.length ? plural(ranked.length, "issue needs", "issues need") : "nothing needs"} attention${mine.length ? `; ${mine.length} ${mine.length === 1 ? "is" : "are"} yours to act on` : ""}.`,
      );
      if (lead) briefing.push(`Most pressing: ${lead.title}.`);
      const withIssues = new Set(ranked.flatMap((i) => i.accountIds));
      const unknown = ws.data.accounts.filter((x) => a.health[x.id]?.status === "insufficient");
      metrics.push({
        label: `${t.accounts} with open issues`,
        value: `${ws.data.accounts.filter((x) => withIssues.has(x.id)).length} of ${ws.data.accounts.length}`,
        scope,
        period: asOf,
        time: "current",
        kind: "calculated",
        sub: unknown.length ? `${unknown.length} without enough data to judge` : `${urgent.length} urgent issue${urgent.length === 1 ? "" : "s"}`,
        warnings: [],
        href: "/accounts?view=attention",
        tone: urgent.length ? "warn" : undefined,
      });
      const nextRenewal = a.renewals[0];
      if (mode !== "budget")
        metrics.push({
          label: "Next renewal",
          value: nextRenewal ? fmtDate(nextRenewal.renewalDate) : "None",
          scope,
          period: asOf,
          time: "current",
          kind: "observed",
          sub: nextRenewal ? `${ws.data.accounts.find((x) => x.id === nextRenewal.accountId)?.name}${nextRenewal.annualValue !== null ? ` · ${money(nextRenewal.annualValue)} a year` : ""}` : "No renewals on file",
          warnings: [],
          href: "/accounts?view=renewals",
          tone: nextRenewal && daysBetween(ws.org.demoDate, nextRenewal.renewalDate) <= 60 ? "warn" : undefined,
        });
      if (ws.profile.modules.invoices && ws.caps.viewCommercialTerms)
        metrics.push({
          label: "Overdue invoices",
          value: money(a.receivables.totalOverdue),
          scope,
          period: asOf,
          time: "current",
          kind: "observed",
          sub: `${a.receivables.overdue.length} invoice${a.receivables.overdue.length === 1 ? "" : "s"}`,
          warnings: sourceWarn(/receivable/i),
          href: "/finance#receivables",
          tone: a.receivables.totalOverdue > 0 ? "warn" : undefined,
        });
      const myActions = ws.data.actions.filter((x) => x.ownerId === ws.user.id && (x.status === "open" || x.status === "in_progress"));
      const overdue = myActions.filter((x) => x.dueDate < ws.org.demoDate);
      metrics.push({
        label: "Your open plans",
        value: String(myActions.length),
        scope: "Assigned to you",
        period: asOf,
        time: "current",
        kind: "observed",
        sub: overdue.length ? `${overdue.length} overdue` : "None overdue",
        warnings: [],
        href: "/actions?owner=me",
        tone: overdue.length ? "bad" : undefined,
      });
      break;
    }
    case "admin": {
      const sys = all.filter((i) => i.kind === "system");
      const affected = [...new Set(ws.sources.flatMap((s) => s.affects))];
      briefing.push(
        ws.sources.length
          ? `${plural(ws.sources.length, "connection needs", "connections need")} attention. Until fixed, ${affected.length === 1 ? `${affected[0].toLowerCase()} may be outdated` : `${affected.length} reports may be outdated, including ${affected.slice(0, 2).join(" and ").toLowerCase()}`}.`
          : "All connections are healthy.",
      );
      const mappings = sys.find((i) => i.id === "iss_sys_mappings");
      if (mappings) briefing.push(`${mappings.title}; unmapped records are left out of health and time figures.`);
      const batches = ws.overlay.imports.batches;
      metrics.push({
        label: "Connections with problems",
        value: `${ws.sources.length} of ${ws.data.connectors.filter((c) => c.state !== "not_configured").length}`,
        scope: "All connections",
        period: asOf,
        time: "current",
        kind: "observed",
        sub: ws.sources.filter((s) => s.severity === "high").length ? `${ws.sources.filter((s) => s.severity === "high").length} failing` : "None failing",
        warnings: [],
        href: "/integrations",
        tone: ws.sources.some((s) => s.severity === "high") ? "bad" : ws.sources.length ? "warn" : "good",
      });
      metrics.push({
        label: "Mappings to review",
        value: String(mappings?.impacts[0]?.value ?? 0),
        scope: "All connections",
        period: asOf,
        time: "current",
        kind: "observed",
        sub: "Records not yet matched",
        warnings: [],
        href: "/integrations#mappings",
        tone: mappings ? "warn" : undefined,
      });
      metrics.push({ label: "Reports affected", value: String(affected.length), scope: "Company-wide", period: asOf, time: "current", kind: "calculated", sub: affected[0] ?? "None", warnings: [], href: "/integrations" });
      metrics.push({
        label: "Imports this session",
        value: String(batches.length),
        scope: "Spreadsheet imports",
        period: "Since the demo was last reset",
        time: "current",
        kind: "observed",
        sub: batches.length ? `Last: ${batches[batches.length - 1].dataset}` : "No imports yet",
        warnings: [],
        href: "/integrations#imports",
      });
      break;
    }
  }

  // Since the last visit: a synthetic baseline one week before the demo date.
  const relevant = ws.changes.items.filter((c) => (role === "admin" ? c.kind === "import" || c.kind === "milestone" || c.kind === "project" : true));
  const sorted = [...relevant].sort((x, y) => (x.direction === y.direction ? (x.date < y.date ? 1 : -1) : x.direction === "worse" ? -1 : 1));

  return {
    role,
    greeting: `Good morning, ${ws.user.name.split(" ")[0]}`,
    focus: roleFocus(ws, role),
    briefing,
    metrics: metrics.slice(0, 4),
    issues: top,
    counts: { total: ranked.length, urgent: urgent.length, executive: ranked.filter((i) => i.executive).length, shownUrgent: top.filter((i) => i.severity === "critical" || i.severity === "high").length },
    since: { from: ws.changes.since, label: `Since your last visit on ${fmtDate(ws.changes.since)}`, items: sorted.slice(0, 5), more: Math.max(0, sorted.length - 5) },
    dataWarnings: role === "admin" ? [] : ws.sources.filter((s) => s.severity === "high").map((s) => s.summary),
  };
}

/** What each Home is for, in the profile's own terms. */
function roleFocus(ws: Workspace, role: RoleId): string {
  const mode = ws.profile.modules.financeMode;
  const accounts = ws.profile.terms.accounts.toLowerCase();
  switch (role) {
    case "executive":
      return mode === "budget" ? "Decisions that need you, budgets and delivery across the organization, and the plans already in place." : "Decisions that need you, the company's results and cash, and the plans already in place.";
    case "finance":
      return mode === "budget"
        ? "Budgets, forecast spend, overruns and the cost records behind them."
        : mode === "subscription"
          ? "Collections, recurring revenue, budget exceptions, cash and the cost records behind them."
          : "Collections, unbilled work, margins, cash and the cost records behind them.";
    case "account_owner":
      return `Your ${accounts}: their issues${mode === "budget" ? "" : ", renewals"} and the plans you own.`;
    case "admin":
      return "Connections, mappings and imports, and which reports they affect.";
  }
}

function pushRevenueMetrics(ws: Workspace, metrics: Metric[], scope: string, periodLabel: string, asOf: string) {
  if (ws.profile.modules.financeMode !== "subscription") return;
  const money = (n: number) => fmtMoney(n, ws.org.reportingCurrency, { compact: true });
  const arr = ws.data.subscriptions.filter((s) => s.renewalDate >= ws.org.demoDate).reduce((s, x) => s + x.mrr * 12, 0);
  if (ws.caps.viewCommercialTerms)
    metrics.unshift({
      label: "Annual recurring revenue",
      value: money(arr),
      scope,
      period: asOf,
      time: "current",
      kind: "calculated",
      sub: "Monthly recurring revenue × 12, active subscriptions",
      warnings: [],
      href: "/finance",
      calcHref: "/calculations#earned",
    });
  if (ws.finance) metrics.push({ label: "Recognized revenue", value: money(ws.finance.summary.earnedRevenue), scope, period: periodLabel, time: "historical", kind: "calculated", warnings: [], href: "/finance" });
}

function pushRenewalAtRisk(ws: Workspace, issues: Issue[], metrics: Metric[], scope: string, money: (n: number) => string) {
  if (ws.profile.modules.financeMode === "budget") return;
  const atRisk = issues.filter((i) => i.kind === "relationship" && i.impacts.some((x) => x.label.startsWith("Annual contract value")));
  const value = atRisk.flatMap((i) => i.impacts.filter((x) => x.label.startsWith("Annual contract value") && x.value !== null)).reduce((s, x) => s + (x.value ?? 0), 0);
  metrics.push({
    label: "Renewals at risk",
    value: atRisk.length ? money(value) : "None",
    scope,
    period: "Renewing in the next 75 days",
    time: "forecast",
    kind: "inferred",
    sub: atRisk.length ? `${atRisk.length} contract${atRisk.length === 1 ? "" : "s"}, annual value` : "No at-risk renewals",
    warnings: [],
    href: "/accounts?view=renewals",
    tone: atRisk.length ? "bad" : undefined,
  });
}

function pushBudgetMetrics(ws: Workspace, metrics: Metric[], scope: string, asOf: string, money: (n: number) => string) {
  if (ws.profile.modules.financeMode !== "budget") return;
  const internal = ws.data.projects.filter((p) => p.billing === "internal" && p.status !== "completed");
  const budget = internal.reduce((s, p) => s + (p.budgetCost ?? 0), 0);
  metrics.push({ label: "Approved budget", value: money(budget), scope, period: `${internal.length} active ${ws.profile.terms.projects.toLowerCase()}`, time: "current", kind: "observed", warnings: [], href: "/finance" });
  if (ws.caps.viewProjectCosts) {
    const forecast = internal.reduce((s, p) => s + (ws.analysis.projectFin[p.id]?.cost.forecastTotal ?? 0), 0);
    const overBy = internal.map((p) => ({ p, v: ws.analysis.projectFin[p.id]?.budget.forecastVsBudget ?? 0 })).filter((x) => x.v > 0);
    const over = overBy.length;
    // Issues are raised above 5% of budget; say how many cross that line so the count matches the issue list.
    const material = overBy.filter((x) => x.v > (x.p.budgetCost ?? 0) * 0.05).length;
    metrics.push({
      label: "Forecast cost at completion",
      value: money(forecast),
      scope,
      period: asOf,
      time: "forecast",
      kind: "calculated",
      sub: `${forecast > budget ? "Over" : "Under"} budget by ${money(Math.abs(forecast - budget))}${over ? ` · ${over} forecast over budget${material < over ? `, ${material} by more than 5%` : ""}` : ""}`,
      warnings: [],
      href: "/finance",
      tone: forecast > budget ? "bad" : "good",
    });
  }
  const late = ws.data.milestones.filter((m) => ["late", "blocked", "awaiting_client"].includes(ws.analysis.milestones[m.id]?.state ?? "")).length;
  metrics.push({ label: "Milestones late or blocked", value: String(late), scope, period: asOf, time: "current", kind: "observed", warnings: [], href: "/projects?view=intervention", tone: late ? "warn" : undefined });
  metrics.push({
    label: "People over capacity",
    value: String(ws.analysis.capacity.overallocated.length),
    scope,
    period: "Next 4 weeks",
    time: "forecast",
    kind: "calculated",
    warnings: [],
    href: "/team",
    tone: ws.analysis.capacity.overallocated.length ? "warn" : undefined,
  });
}
