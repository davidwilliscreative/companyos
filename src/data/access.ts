import type { Account, CompensationRecord, Dataset, EvidenceLink, ID, Organization, Person, ProfileId, Project, RoleId, Signal, Thread } from "@/domain/types";
import { getProfile, type ProfileConfig } from "@/domain/profiles";
import { computeAnalysis, type Analysis } from "@/lib/analytics";
import { cashForecast, monthlySeries, periodSummary, revenueConcentration, DEFAULT_CASH_ASSUMPTIONS, type CashAssumptions, type CashForecast, type MonthPoint, type PeriodSummary } from "@/lib/calc/company";
import { annualLoadedCost, compOn, costRateOn } from "@/lib/calc/finance";
import { capsFor, type Capabilities } from "@/lib/permissions";
import { changesSince, type ChangeItem } from "@/lib/changes";
import type { AccountHealth, HealthComponent } from "@/lib/calc/health";
import { sourceStatuses, type SourceStatus } from "@/lib/system-health";
import { buildDataset } from "./dataset";
import { ORG_BY_PROFILE } from "./seed";
import { overlayFor, type OrgOverlay } from "./state";
import type { StateStore } from "./store";

/**
 * The permission boundary. Everything a screen or the assistant can read comes
 * from a Workspace, which is built from the full dataset and then filtered for
 * the organization and role. Restricted values are removed, not hidden in UI.
 */

export interface RequestContext {
  profileId: ProfileId;
  orgId: ID;
  role: RoleId;
  periodKey?: string;
}

export interface PersonCost {
  hourlyCost: number | null;
  annualLoaded: number | null;
  effectiveFrom: string | null;
}

export interface FinanceView {
  scope: "company" | "own_accounts";
  summary: PeriodSummary;
  monthly: MonthPoint[];
  cash: CashForecast | null;
  concentration: ReturnType<typeof revenueConcentration> | null;
}

export interface Workspace {
  ctx: RequestContext;
  caps: Capabilities;
  org: Organization;
  profile: ProfileConfig;
  user: Person;
  /** Redacted dataset: only permitted records; compensation removed unless allowed; message bodies removed where not allowed. */
  data: Dataset;
  compensation: CompensationRecord[] | null;
  personCosts: Record<ID, PersonCost> | null;
  analysis: Analysis;
  finance: FinanceView | null;
  overlay: OrgOverlay;
  changes: { since: string; until: string; items: ChangeItem[] };
  /** Plain-language status of unreliable sources and what they affect. Safe for every role. */
  sources: SourceStatus[];
  /** Non-sensitive planning data across all work (assignments, time off) for capacity questions. Other accounts' project names are redacted. */
  planning: Pick<Dataset, "org" | "people" | "projects" | "timeOff">;
  scopeNote: string | null;
  canViewThread: (t: Thread) => boolean;
  accountIds: Set<ID>;
}

function threadVisible(caps: Capabilities, t: Thread, accountIds: Set<ID>): boolean {
  if (caps.communications === "all") return true;
  if (caps.communications === "billing_only") return t.tags.includes("billing");
  if (caps.communications === "own_accounts") return !!t.accountId && accountIds.has(t.accountId);
  return false;
}

function redactSignal(s: Signal, visible: (threadId: ID) => boolean): Signal {
  const red = (e: Signal["evidence"][number]) => (visible(e.threadId) ? e : { ...e, excerpt: "Content restricted for your role", author: "Restricted" });
  return { ...s, evidence: s.evidence.map(red), counterEvidence: s.counterEvidence.map(red), resolutionEvidence: s.resolutionEvidence.map(red), explanation: s.evidence.every((e) => visible(e.threadId)) ? s.explanation : "Evidence comes from communications your role cannot read. The category, severity and dates are shown; ask an authorized colleague for detail." };
}

const RESTRICTED_FACTOR = "Financial detail restricted for your role";
const MONEYISH = /[$€£]\s?\d|\d[\d,.]*\s?(k|m)?\s?(USD|EUR|GBP)\b/i;

/** Remove contract values, billing amounts and budget figures from a project record when the role may not see them. */
function stripProject(p: Project, caps: Capabilities): Project {
  let out = p;
  if (!caps.viewCommercialTerms) out = { ...out, scopeChanges: out.scopeChanges.map((c) => ({ ...c, amount: undefined })) };
  if (!caps.viewProjectCosts) out = { ...out, budgetCost: undefined, remainingCostRateOverride: undefined, futureBillRateFactor: undefined, scenarioNote: out.scenarioNote ? "A what-if scenario has been applied to this forecast." : undefined };
  return out;
}

function redactHealth(h: AccountHealth, caps: Capabilities): AccountHealth {
  if (caps.viewCommercialTerms && caps.viewProjectCosts) return h;
  const restricted = (c: HealthComponent) => (c.key === "financial" && (!caps.viewCommercialTerms || !caps.viewProjectCosts)) || (c.key === "budget" && !caps.viewProjectCosts);
  return {
    ...h,
    components: h.components.map((c) => (restricted(c) ? { ...c, factors: c.factors.map((f) => ({ ...f, label: RESTRICTED_FACTOR, link: undefined })) } : c)),
    dataGaps: h.dataGaps,
  };
}

export function buildWorkspace(ctx: RequestContext, store: StateStore, opts: { cash?: CashAssumptions } = {}): Workspace {
  const state = store.read();
  const overlay = overlayFor(state, ctx.orgId);
  const full = buildDataset(ctx.profileId, overlay);
  if (full.org.id !== ctx.orgId) throw new Error("Organization mismatch");
  const caps = capsFor(ctx.role);
  const profile = getProfile(ctx.profileId);
  const userId = full.org.demoPersonas[ctx.role];
  const user = full.people.find((p) => p.id === userId)!;
  const analysis = computeAnalysis(full, overlay, ctx.periodKey);

  // ---- Record-level scoping ----
  const sameOrg = <T extends { orgId: ID }>(xs: T[]) => xs.filter((x) => x.orgId === ctx.orgId);
  const accounts: Account[] = sameOrg(full.accounts).filter((a) => caps.allAccounts || a.ownerId === userId);
  const accountIds = new Set(accounts.map((a) => a.id));
  const projectAllowed = (p: { accountId?: ID; ownerId: ID }) => caps.allAccounts || (p.accountId ? accountIds.has(p.accountId) : false);
  const projects = sameOrg(full.projects).filter(projectAllowed).map((p) => stripProject(p, caps));
  const projectIds = new Set(projects.map((p) => p.id));
  const visible = (t: Thread) => (t.accountId ? accountIds.has(t.accountId) || caps.allAccounts : caps.allAccounts) && threadVisible(caps, t, accountIds);
  const threadById = new Map(full.threads.map((t) => [t.id, t]));
  const visibleId = (id: ID) => {
    const t = threadById.get(id);
    return !!t && visible(t);
  };
  const commercial = caps.viewCommercialTerms;
  const redactImpact = (text: string) => (commercial || !MONEYISH.test(text) ? text : "Value restricted for your role");

  const data: Dataset = {
    ...full,
    accounts,
    projects,
    contracts: full.contracts.filter((c) => !c.accountId || accountIds.has(c.accountId) || caps.allAccounts).map((c) => (commercial ? c : { ...c, fixedFee: undefined, monthlyFee: undefined, annualValue: undefined })),
    milestones: full.milestones.filter((m) => projectIds.has(m.projectId)).map((m) => (commercial ? m : { ...m, billingAmount: undefined })),
    tasks: full.tasks.filter((t) => projectIds.has(t.projectId)),
    timeEntries: full.timeEntries.filter((e) => projectIds.has(e.projectId)),
    expenses: caps.viewProjectCosts ? full.expenses.filter((x) => !x.projectId || projectIds.has(x.projectId)) : [],
    // Invoice and payment amounts are commercial terms: roles without them receive no billing records at all.
    invoices: commercial ? full.invoices.filter((i) => accountIds.has(i.accountId)) : [],
    payments: commercial ? full.payments.filter((p) => full.invoices.some((i) => i.id === p.invoiceId && accountIds.has(i.accountId))) : [],
    subscriptions: commercial ? full.subscriptions.filter((s) => accountIds.has(s.accountId)) : [],
    billRates: caps.viewProjectCosts ? full.billRates : [],
    // Threads the role cannot read are dropped entirely, including metadata.
    threads: full.threads.filter(visible),
    compensation: caps.viewCompensation ? full.compensation : [],
    actions: full.actions.filter((a) => !a.accountId || accountIds.has(a.accountId) || caps.allAccounts).map((a) => (commercial ? a : { ...a, impact: redactImpact(a.impact), links: a.links.filter((l) => l.type !== "invoice") })),
    // Mapping rows name accounts, so only all-account roles receive them.
    mappings: caps.allAccounts ? full.mappings : [],
    // Connector internals (mailboxes, channel names, failure text) are system detail.
    connectors: caps.viewSystemDetail ? full.connectors : full.connectors.map((c) => ({ ...c, scopes: [], included: [], excluded: [], failures: c.failures.map((f) => ({ at: f.at, message: "Sync problem (detail visible to administrators)" })) })),
    opportunitySeeds: commercial ? full.opportunitySeeds : {},
  };

  // ---- Analysis scoping ----
  const pick = <T,>(rec: Record<ID, T>, allowed: Set<ID>) => Object.fromEntries(Object.entries(rec).filter(([k]) => allowed.has(k))) as Record<ID, T>;
  const milestoneIds = new Set(data.milestones.map((m) => m.id));
  const health = Object.fromEntries(Object.entries(pick(analysis.health, accountIds)).map(([k, h]) => [k, redactHealth(h, caps)])) as Record<ID, AccountHealth>;
  const linkAllowed = (l: EvidenceLink) => (l.type === "invoice" ? commercial : l.type === "calculation" ? caps.viewProjectCosts || caps.viewCompanyFinance : true);
  const emptyReceivables = { open: [], overdue: [], buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }, totalOutstanding: 0, totalOverdue: 0 } as typeof analysis.receivables;
  const scoped: Analysis = {
    ...analysis,
    projectFin: caps.viewProjectCosts ? pick(analysis.projectFin, projectIds) : {},
    milestones: pick(analysis.milestones, milestoneIds),
    signals: analysis.signals.filter((s) => accountIds.has(s.accountId)).map((s) => redactSignal(s, visibleId)),
    opportunities: analysis.opportunities.filter((o) => accountIds.has(o.accountId)).map((o) => ({ ...o, estimatedValue: commercial ? o.estimatedValue : null, evidence: o.evidence.map((e) => (visibleId(e.threadId) ? e : { ...e, excerpt: "Content restricted for your role", author: "Restricted" })), need: o.evidence.every((e) => visibleId(e.threadId)) ? o.need : "Restricted for your role" })),
    health,
    healthPrev: pick(analysis.healthPrev, accountIds),
    receivables: !commercial
      ? emptyReceivables
      : (() => {
          const filt = (xs: typeof analysis.receivables.open) => xs.filter((s) => accountIds.has(s.invoice.accountId));
          const open = filt(analysis.receivables.open);
          const overdue = filt(analysis.receivables.overdue);
          const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as typeof analysis.receivables.buckets;
          for (const s of open) buckets[s.bucket as keyof typeof buckets] += s.outstanding;
          return { open, overdue, buckets, totalOutstanding: open.reduce((s, x) => s + x.outstanding, 0), totalOverdue: overdue.reduce((s, x) => s + x.outstanding, 0) };
        })(),
    attention: analysis.attention
      .filter((i) => {
        if (i.accountId) return accountIds.has(i.accountId);
        if (i.projectId) return projectIds.has(i.projectId);
        if (i.kind === "capacity") return caps.allAccounts || i.links.some((l) => l.type === "task" && data.tasks.some((t) => t.id === l.id));
        return caps.allAccounts;
      })
      .filter((i) => (i.kind === "margin" ? caps.viewProjectCosts : true))
      .filter((i) => (i.kind === "invoice" ? commercial : true))
      .map((i) => {
        let item = { ...i, links: i.links.filter(linkAllowed) };
        if (!commercial && i.impactValue !== null && ["renewal", "schedule", "opportunity"].includes(i.kind)) item = { ...item, impactValue: null, impactLabel: i.kind === "renewal" ? "Contract value restricted for your role" : i.kind === "opportunity" ? "Estimate restricted for your role" : "Schedule" };
        if (!commercial && i.kind === "action") item = { ...item, impactLabel: redactImpact(i.impactLabel) };
        if (i.kind === "capacity" && !caps.allAccounts) {
          // Name only permitted projects; everything else is "other work".
          const pc = analysis.capacity.overallocated.find((x) => i.links.some((l) => l.type === "person" && l.id === x.person.id));
          if (pc) {
            const mine = pc.projects.filter((x) => projectIds.has(x.projectId)).map((x) => full.projects.find((p) => p.id === x.projectId)?.name);
            const other = pc.projects.length - mine.length;
            const blocked = data.tasks.filter((t) => t.assigneeId === pc.person.id && t.status === "blocked").length;
            item = { ...item, why: `Assigned to ${pc.projects.length} active projects (${[...mine, ...(other ? [`${other} other project${other === 1 ? "" : "s"}`] : [])].join(", ")}).${blocked ? ` ${blocked} of your task(s) blocked waiting on them.` : ""}`, links: item.links.filter((l) => l.type !== "task" || data.tasks.some((t) => t.id === l.id)) };
          }
        }
        if (i.kind === "account" && i.accountId && health[i.accountId]) {
          // Rebuild the explanation from the role's (possibly redacted) health factors.
          const top = health[i.accountId].components.flatMap((c) => c.factors).filter((f) => f.effect < 0 && f.label !== RESTRICTED_FACTOR).sort((x, y) => x.effect - y.effect).slice(0, 2);
          const hidden = health[i.accountId].components.some((c) => c.factors.some((f) => f.label === RESTRICTED_FACTOR && f.effect < 0));
          item = { ...item, why: [top.map((f) => f.label).join("; "), hidden ? "plus financial factors restricted for your role" : ""].filter(Boolean).join("; ") || "Multiple negative factors" };
        }
        return item;
      }),
    renewals: analysis.renewals.filter((r) => accountIds.has(r.accountId)).map((r) => (commercial ? r : { ...r, annualValue: null })),
    capacity: {
      ...analysis.capacity,
      people: analysis.capacity.people.map((pc) => ({ ...pc, projects: pc.projects.map((x) => (projectIds.has(x.projectId) ? x : { ...x, projectId: "__other__" })) })),
      overallocated: analysis.capacity.overallocated.map((pc) => ({ ...pc, projects: pc.projects.map((x) => (projectIds.has(x.projectId) ? x : { ...x, projectId: "__other__" })) })),
      gaps: analysis.capacity.gaps.filter((g) => projectIds.has(g.projectId)),
    },
  };

  // ---- Compensation (restricted) ----
  let personCosts: Record<ID, PersonCost> | null = null;
  if (caps.viewCompensation) {
    personCosts = {};
    for (const p of full.people) {
      const rec = compOn(full, p.id, full.org.demoDate);
      personCosts[p.id] = { hourlyCost: costRateOn(full, p.id, full.org.demoDate), annualLoaded: p.type === "employee" ? annualLoadedCost(rec) : null, effectiveFrom: rec?.effectiveFrom ?? null };
    }
  }

  // ---- Finance views ----
  let finance: FinanceView | null = null;
  if (caps.viewCompanyFinance) {
    const period = analysis.period;
    finance = {
      scope: "company",
      summary: periodSummary(full, period),
      monthly: monthlySeries(full, 6),
      cash: profile.modules.financeMode === "budget" ? null : cashForecast(full, opts.cash ?? DEFAULT_CASH_ASSUMPTIONS),
      concentration: profile.modules.financeMode === "budget" ? null : revenueConcentration(full, period),
    };
  } else if (caps.viewProjectCosts) {
    // Account owners: the same calculations restricted to their own accounts' projects. No payroll, overhead or cash.
    const s = periodSummary(full, analysis.period);
    const lines = s.lines.filter((l) => projectIds.has(l.projectId));
    const clientLines = lines.filter((l) => full.projects.find((p) => p.id === l.projectId)?.kind === "client");
    const earned = clientLines.reduce((x, l) => x + (l.earned ?? 0), 0);
    const cost = clientLines.reduce((x, l) => x + l.labor + l.contractor + l.expenses, 0);
    const own: PeriodSummary = {
      ...s,
      earnedRevenue: earned,
      projectRevenue: earned,
      subscriptionRevenue: 0,
      clientDirectCost: cost,
      deliveryMargin: earned > 0 ? (earned - cost) / earned : null,
      deliveryProfit: earned - cost,
      invoiced: data.invoices.filter((i) => i.issueDate >= s.period.start && i.issueDate <= s.period.end).reduce((x, i) => x + i.amount, 0),
      collected: data.payments.filter((p) => p.date >= s.period.start && p.date <= s.period.end).reduce((x, p) => x + p.amount, 0),
      payroll: Number.NaN,
      absorbedEmployeeLabor: Number.NaN,
      nonClientLabor: Number.NaN,
      internalContractorAndExpenses: Number.NaN,
      overhead: Number.NaN,
      operatingResult: Number.NaN,
      lines,
      // Company-wide notes (payroll coverage, other people's missing cost rates) don't describe this scope.
      missing: s.missing.filter((m) => !m.startsWith("Payroll") && !/hours in this period have no cost rate/.test(m)).concat(
        (() => {
          const own = lines.reduce((x, l) => x + l.hoursWithoutCostRate, 0);
          return own > 0 ? [`${Math.round(own)} hours on your accounts have no cost rate, so delivery cost is understated.`] : [];
        })(),
      ),
    };
    finance = { scope: "own_accounts", summary: own, monthly: [], cash: null, concentration: null };
  }

  const rawChanges = changesSince(full, overlay, analysis.signals, 7);
  const changes = {
    ...rawChanges,
    items: rawChanges.items
      .filter((c) => (c.accountId ? accountIds.has(c.accountId) : c.projectId ? projectIds.has(c.projectId) : caps.allAccounts))
      .filter((c) => (c.kind === "payment" || c.kind === "invoice" ? commercial : true))
      .filter((c) => (c.kind === "import" ? caps.viewSystemDetail : true)),
  };

  const scopeNote = caps.allAccounts ? null : `Showing the ${accounts.length} ${accounts.length === 1 ? profile.terms.account.toLowerCase() : profile.terms.accounts.toLowerCase()} owned by ${user.name}.`;

  return {
    ctx,
    caps,
    org: full.org,
    profile,
    user,
    data,
    compensation: caps.viewCompensation ? full.compensation : null,
    personCosts,
    analysis: scoped,
    finance,
    overlay,
    changes,
    sources: sourceStatuses(full),
    planning: {
      org: full.org,
      people: full.people,
      timeOff: full.timeOff,
      projects: full.projects.map((p) => (projectIds.has(p.id) ? stripProject(p, caps) : { ...p, name: "Other work", accountId: undefined, description: "", scopeChanges: [], budgetCost: undefined, remainingCostRateOverride: undefined, futureBillRateFactor: undefined, scenarioNote: undefined, contractId: undefined })),
    },
    scopeNote,
    canViewThread: visible,
    accountIds,
  };
}

export function contextFor(profileId: ProfileId, role: RoleId, periodKey?: string): RequestContext {
  return { profileId, orgId: ORG_BY_PROFILE[profileId], role, periodKey };
}
