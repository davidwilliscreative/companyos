import type { Action, EvidenceLink, ID, ISODate, RoleId, Severity } from "@/domain/types";
import type { Workspace } from "@/data/access";
import type { AttentionItem } from "./analytics";
import { addDays, daysBetween, fmtDate } from "./dates";

/**
 * Issues: the shared unit of "what needs attention" across Home, the issues
 * list, detail pages and the assistant. An issue groups related alerts into
 * one situation with one owner, one plan and one next update, so the same
 * problem never appears three times under different names.
 *
 * Issues are built from the role-scoped workspace, so they contain only what
 * the viewer may see. Grouping rules are documented in
 * docs/permissions-and-issues.md; keep the two in step.
 */

export type IssueKind = "staffing" | "delivery" | "relationship" | "collections" | "margin" | "budget" | "data" | "opportunity" | "system" | "plan";

export interface IssueImpact {
  /** What is measured. Impacts with different labels are never added together. */
  label: string;
  unit: "money" | "days" | "percent" | "points" | "count" | "text";
  /** null when unknown or restricted for the role; see `note`. */
  value: number | null;
  /** How the figure was arrived at, in one line. */
  basis: string;
  note?: string;
}

export interface IssuePlan {
  actionId: ID;
  title: string;
  ownerId: ID;
  status: Action["status"];
  dueDate: ISODate;
  overdue: boolean;
  /** "plan" when the action addresses this issue; "related" when it was raised for a linked issue. */
  relation: "plan" | "related";
}

export interface IssueReview {
  state: "recorded" | "unreviewed" | "confirmed" | "appears_resolved" | "reopened";
  label: string;
  detail?: string;
}

export interface Issue {
  /** Stable across reloads: derived from the records the issue is about, never from position. */
  id: string;
  kind: IssueKind;
  title: string;
  /** What is happening, in one or two sentences. */
  what: string;
  /** Why it matters. */
  why: string;
  severity: Severity;
  review: IssueReview;
  accountIds: ID[];
  projectIds: ID[];
  personIds: ID[];
  impacts: IssueImpact[];
  ownerId: ID;
  /** Recommended next step when no plan exists yet. */
  next: string;
  plans: IssuePlan[];
  nextUpdate: ISODate;
  nextUpdateOverdue: boolean;
  executive: boolean;
  executiveReason?: string;
  evidence: EvidenceLink[];
  /** The underlying alerts this issue groups, for "Show the detail". */
  parts: {
    id: string;
    title: string;
    why: string;
    severity: Severity;
    links: EvidenceLink[];
  }[];
  related: string[];
  score: number;
}

const SEV_W: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const maxSev = (xs: Severity[]): Severity => xs.reduce<Severity>((m, s) => (SEV_W[s] > SEV_W[m] ? s : m), "low");
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const linkKey = (l: EvidenceLink) => `${l.type}:${l.id}`;

/* ---------------- grouping ---------------- */

function groupKeyOf(i: AttentionItem, ws: Workspace): string | null {
  switch (i.kind) {
    case "capacity": {
      const p = i.links.find((l) => l.type === "person");
      return p ? `staff:${p.id}` : null;
    }
    case "schedule":
      return i.projectId ? `ms:${i.projectId}` : null;
    case "margin": {
      const p = ws.data.projects.find((x) => x.id === i.projectId);
      return p ? `${p.billing === "internal" ? "budget" : "margin"}:${p.id}` : null;
    }
    case "invoice":
      return i.accountId ? `ar:${i.accountId}` : null;
    case "account":
    case "renewal":
      return i.accountId ? `rel:${i.accountId}` : null;
    case "data":
      return i.accountId ? `data:${i.accountId}` : null;
    case "opportunity":
      return i.accountId ? `opp:${i.accountId}` : null;
    case "action":
      return null; // overdue actions are a plan's state, not a separate issue
  }
}

const ID_PREFIX: Record<string, string> = {
  staff: "iss_staff_",
  ms: "iss_ms_",
  margin: "iss_margin_",
  budget: "iss_budget_",
  ar: "iss_ar_",
  rel: "iss_rel_",
  data: "iss_data_",
  opp: "iss_opp_",
};
const KIND_OF: Record<string, IssueKind> = {
  staff: "staffing",
  ms: "delivery",
  margin: "margin",
  budget: "budget",
  ar: "collections",
  rel: "relationship",
  data: "data",
  opp: "opportunity",
};

/**
 * Group attention items into situations.
 *  1. Each alert starts in a group keyed by the record it is about (a person's
 *     load, a project's schedule, an account's relationship, an account's
 *     receivables, a project's margin or budget).
 *  2. A staffing group absorbs the schedule group of every project where a
 *     flagged milestone is owned by that person or has blocked tasks
 *     assigned to them: the overload and the blocked work are one situation.
 *  3. Receivables, margins and relationships stay separate (different
 *     owners and decisions) and are linked as related instead.
 */
function groupItems(ws: Workspace): Map<string, AttentionItem[]> {
  const groups = new Map<string, AttentionItem[]>();
  for (const i of ws.analysis.attention) {
    const k = groupKeyOf(i, ws);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  for (const [k, items] of [...groups]) {
    if (!k.startsWith("staff:")) continue;
    const personId = k.slice(6);
    for (const [k2, sched] of [...groups]) {
      if (!k2.startsWith("ms:") || !groups.has(k2)) continue;
      const dependsOnPerson = sched.some((s) => {
        const ms = s.links.find((l) => l.type === "milestone");
        const m = ws.data.milestones.find((x) => x.id === ms?.id);
        if (!m) return false;
        return (
          m.ownerId === personId ||
          ws.data.tasks.some((t) => t.milestoneId === m.id && t.status === "blocked" && t.assigneeId === personId) ||
          (m.blockedReason ?? "").includes(ws.data.people.find((p) => p.id === personId)?.name ?? "\u0000")
        );
      });
      if (dependsOnPerson) {
        groups.set(k, [...(groups.get(k) ?? items), ...sched]);
        groups.delete(k2);
      }
    }
  }
  return groups;
}

/* ---------------- plans and review ---------------- */

function keyRecords(kind: IssueKind, id: string, items: AttentionItem[], ws: Workspace): Set<string> {
  const keys = new Set<string>([`issue:${id}`]);
  const add = (type: EvidenceLink["type"], x?: string) => x && keys.add(`${type}:${x}`);
  for (const i of items) {
    for (const l of i.links) {
      // Account and project links are too broad to identify a plan, except for account-level issues.
      if (l.type === "account" && !["relationship", "data", "opportunity"].includes(kind)) continue;
      if (l.type === "project" && kind !== "delivery") continue;
      if (l.type === "invoice" && kind !== "collections") continue;
      // A relationship plan is about the client conversation, not the delivery records behind the health score.
      if (kind === "relationship" && !["account", "signal", "thread", "message"].includes(l.type)) continue;
      keys.add(linkKey(l));
    }
    if (kind === "delivery") add("project", i.projectId);
    if (kind === "staffing") for (const t of ws.data.tasks.filter((t) => i.links.some((l) => l.type === "person" && l.id === t.assigneeId) && t.status === "blocked")) add("task", t.id);
  }
  if (kind === "relationship") for (const s of ws.analysis.signals.filter((s) => items.some((i) => i.accountId === s.accountId) && s.polarity === "risk")) for (const e of s.evidence) add("thread", e.threadId);
  return keys;
}

/** How precisely a link identifies the situation an action addresses. */
const SPECIFICITY: Partial<Record<EvidenceLink["type"], number>> = { issue: 10, milestone: 3, task: 3, person: 3, project: 2, invoice: 2, signal: 2, calculation: 2, thread: 1, message: 1, account: 1 };

function plansFor(kind: IssueKind, keys: Set<string>, ws: Workspace): (IssuePlan & { specificity: number })[] {
  const asOf = ws.org.demoDate;
  const out: (IssuePlan & { specificity: number })[] = [];
  for (const a of ws.data.actions) {
    if (a.status === "done" || a.status === "cancelled") continue;
    const hits = a.links.filter((l) => keys.has(linkKey(l)));
    if (!hits.length) continue;
    // An action raised for a milestone that also mentions its invoice is that delivery issue's plan, and only related to the collection.
    const relation: IssuePlan["relation"] = kind === "collections" && a.links.some((l) => l.type !== "invoice" && l.type !== "account") ? "related" : "plan";
    out.push({
      actionId: a.id,
      title: a.title,
      ownerId: a.ownerId,
      status: a.status,
      dueDate: a.dueDate,
      overdue: a.dueDate < asOf,
      relation,
      specificity: hits.reduce((n, l) => n + (SPECIFICITY[l.type] ?? 1), 0),
    });
  }
  return out.sort((x, y) => (x.relation === y.relation ? (x.dueDate < y.dueDate ? -1 : 1) : x.relation === "plan" ? -1 : 1));
}

function reviewFor(kind: IssueKind, accountIds: ID[], ws: Workspace): IssueReview {
  if (kind !== "relationship" && kind !== "opportunity")
    return {
      state: "recorded",
      label: "From recorded data",
      detail: "Based on dates, assignments and amounts in connected systems; no human review is needed to trust it.",
    };
  const sigs = ws.analysis.signals.filter((s) => accountIds.includes(s.accountId) && (kind === "opportunity" ? s.polarity === "opportunity" : s.polarity === "risk") && s.review.status !== "dismissed");
  if (!sigs.length) return { state: "recorded", label: "From recorded data" };
  const reopened = sigs.find((s) => s.newEvidenceSinceReview);
  if (reopened)
    return {
      state: "reopened",
      label: "Reopened",
      detail: `Dismissed earlier, then new messages arrived (latest ${fmtDate(reopened.lastEvidenceOn)}): ${reopened.summary}.`,
    };
  const live = sigs.filter((s) => !s.autoResolved);
  if (!live.length)
    return {
      state: "appears_resolved",
      label: "Appears resolved · awaiting confirmation",
      detail: "Later messages suggest this was resolved. Someone needs to confirm before it is closed.",
    };
  const confirmed = live.find((s) => s.review.status === "confirmed");
  if (confirmed)
    return {
      state: "confirmed",
      label: "Confirmed",
      detail: confirmed.review.at ? `Confirmed ${fmtDate(confirmed.review.at.slice(0, 10))}${confirmed.review.note ? `: ${confirmed.review.note}` : ""}` : undefined,
    };
  return {
    state: "unreviewed",
    label: "Not yet reviewed",
    detail: "Inferred from messages. Confidence describes evidence strength; a person should confirm or dismiss it.",
  };
}

/* ---------------- narrative ---------------- */

function stripProjectPrefix(title: string, projectName?: string) {
  return projectName && title.startsWith(`${projectName}: `) ? title.slice(projectName.length + 2) : title;
}

/** End with exactly one full stop. */
function sentence(t: string) {
  const x = t.trim().replace(/[.\s]+$/, "");
  return /[?!”"]$/.test(x) ? x : `${x}.`;
}

function shortList(xs: string[], n = 2) {
  if (xs.length <= n) return xs.join(" and ");
  return `${xs.slice(0, n).join(", ")} and ${xs.length - n} more`;
}

function describe(kind: IssueKind, key: string, items: AttentionItem[], ws: Workspace) {
  const id = key.split(":")[1];
  const top = [...items].sort((a, b) => b.score - a.score)[0];
  const acc = (x?: ID) => ws.data.accounts.find((a) => a.id === x);
  const proj = (x?: ID) => ws.data.projects.find((p) => p.id === x);
  const person = (x?: ID) => ws.data.people.find((p) => p.id === x);
  const term = ws.profile.terms;
  const impacts: IssueImpact[] = [];
  const commercial = ws.caps.viewCommercialTerms;

  // Milestone billing held, summed only within the same measure.
  const billing = items.filter((i) => i.kind === "schedule" && i.impactValue !== null);
  const billingImpact = () => {
    if (billing.length)
      impacts.push({
        label: "Milestone billing delayed",
        unit: "money",
        value: billing.reduce((s, i) => s + (i.impactValue ?? 0), 0),
        basis: `${billing.length} milestone${billing.length === 1 ? "" : "s"} that can only be invoiced on completion`,
      });
    else if (!commercial && items.some((i) => i.kind === "schedule" && ws.data.milestones.some((m) => i.links.some((l) => l.id === m.id)))) {
      /* billing amounts are restricted for this role; say nothing rather than imply zero */
    }
  };
  const slipImpact = () => {
    const ms = items.flatMap((i) => i.links.filter((l) => l.type === "milestone").map((l) => ws.analysis.milestones[l.id])).filter(Boolean);
    const slip = Math.max(0, ...ms.map((m) => m.slipDays));
    if (slip > 0)
      impacts.push({
        label: "Longest schedule slip",
        unit: "days",
        value: slip,
        basis: "Current due date against the originally agreed date",
      });
  };

  const res = ((): {
    title: string;
    what: string;
    why: string;
    next: string;
    ownerId: ID;
  } => {
    switch (kind) {
      case "staffing": {
        const p = person(id);
        const cap = items.find((i) => i.kind === "capacity")!;
        const pc = ws.analysis.capacity.overallocated.find((x) => x.person.id === id);
        const blockedMs = items.filter((i) => i.kind === "schedule");
        const projNames = uniq(blockedMs.map((i) => proj(i.projectId)?.name).filter(Boolean) as string[]);
        const clients = uniq((pc?.projects ?? []).map((x) => proj(x.projectId)?.accountId).filter(Boolean) as string[]);
        const otherWork = (pc?.projects ?? []).filter((x) => x.projectId === "__other__").length;
        if (pc)
          impacts.push({
            label: "Peak planned load",
            unit: "percent",
            value: pc.upcoming.peakPct,
            basis: `Planned hours against ${pc.weeklyCapacity} available hours a week, next 4 weeks`,
          });
        impacts.push({
          label: "Projects depending on them",
          unit: "count",
          value: pc?.projects.length ?? null,
          basis: clients.length
            ? `${clients.length} ${clients.length === 1 ? term.account.toLowerCase() : term.accounts.toLowerCase()} you can see${otherWork ? `, plus ${otherWork} other project${otherWork === 1 ? "" : "s"}` : ""}`
            : "Active assignments",
        });
        slipImpact();
        billingImpact();
        return {
          title: blockedMs.length ? `${p?.name ?? "A team member"} is over capacity and holding up ${shortList(projNames)}` : `${p?.name ?? "A team member"} is over capacity`,
          what: sentence(`${cap.title}. ${cap.why}${blockedMs.length ? ` Affected: ${blockedMs.map((i) => i.title).join("; ")}` : ""}`),
          why: blockedMs.length
            ? `One person is on the critical path for ${projNames.length} ${projNames.length === 1 ? term.project.toLowerCase() : term.projects.toLowerCase()}; until their load is rebalanced those milestones keep slipping${billing.length ? " and their billing waits" : ""}.`
            : "Sustained overload raises the risk of late delivery and burnout.",
          next: cap.next,
          ownerId: cap.ownerId,
        };
      }
      case "delivery": {
        const p = proj(id);
        const rest = items.filter((i) => i !== top);
        slipImpact();
        billingImpact();
        return {
          title: `${p?.name ?? term.project}: ${stripProjectPrefix(top.title, p?.name)}${rest.length ? `; ${rest.length} more milestone${rest.length === 1 ? "" : "s"} affected` : ""}`,
          what: sentence(`${sentence(top.why)}${rest.length ? ` Also: ${rest.map((i) => stripProjectPrefix(i.title, p?.name)).join("; ")}` : ""}`),
          why: p
            ? `${term.project} now due ${fmtDate(p.currentEndDate)}${p.currentEndDate !== p.originalEndDate ? `, ${daysBetween(p.originalEndDate, p.currentEndDate)} days later than agreed` : ""}${billing.length ? "; billing for these milestones waits until they complete" : ""}.`
            : "Delivery is behind plan.",
          next: top.next,
          ownerId: top.ownerId,
        };
      }
      case "relationship": {
        const a = acc(id);
        const renewal = items.find((i) => i.kind === "renewal");
        const health = items.find((i) => i.kind === "account");
        const h = ws.analysis.health[id];
        const r = ws.analysis.renewals.find((x) => x.accountId === id && renewal?.id === `att_renew_${x.contractId}`);
        if (renewal)
          impacts.push(
            r && r.annualValue !== null
              ? {
                  label: "Annual contract value up for renewal",
                  unit: "money",
                  value: r.annualValue,
                  basis: `${r.name}, renews ${fmtDate(r.renewalDate)}`,
                }
              : {
                  label: "Annual contract value up for renewal",
                  unit: "money",
                  value: null,
                  basis: r ? `${r.name}, renews ${fmtDate(r.renewalDate)}` : "Contract on file",
                  note: "Restricted for your role",
                },
          );
        const prev = ws.analysis.healthPrev[id];
        if (h?.score != null && prev != null && h.score < prev)
          impacts.push({
            label: "Health change, 30 days",
            unit: "count",
            value: h.score - prev,
            basis: `Score ${prev} → ${h.score} out of 100`,
          });
        return {
          title: renewal ? `${a?.name ?? term.account} renewal on ${r ? fmtDate(r.renewalDate) : "file"} is at risk` : `${a?.name ?? term.account} ${ws.profile.modules.financeMode === "budget" ? "health" : "relationship"} is declining`,
          what: sentence([renewal?.why, ...(health?.why.split("; ").filter((f) => !renewal || !renewal.why.includes(f.split(" (")[0])) ?? [])].filter(Boolean).join(" ") || top.why),
          why: renewal ? `${r?.noticeDate ? `Notice is due ${fmtDate(r.noticeDate)}. ` : ""}An unresolved concern ahead of renewal makes non-renewal more likely.` : "Health fell sharply; the causes are listed under evidence.",
          next: (renewal ?? top).next,
          ownerId: a?.ownerId ?? top.ownerId,
        };
      }
      case "collections": {
        const a = acc(id);
        const total = items.reduce((s, i) => s + (i.impactValue ?? 0), 0);
        const oldest = Math.max(0, ...items.map((i) => Number(/(\d+) days overdue/.exec(i.title)?.[1] ?? 0)));
        impacts.push({
          label: "Overdue receivables",
          unit: "money",
          value: total,
          basis: `${items.length} invoice${items.length === 1 ? "" : "s"}; outstanding amount after part payments`,
        });
        impacts.push({
          label: "Oldest overdue",
          unit: "days",
          value: oldest,
          basis: "Days past the invoice due date",
        });
        return {
          title: `${a?.name ?? term.account}: ${items.length === 1 ? items[0].title.replace(/ \([^)]*\)/, "").replace(/^Invoice/, "invoice") : `${items.length} invoices overdue`}`,
          what: items.map((i) => i.why).join(" "),
          why: oldest > 60 ? "Invoices more than 60 days overdue are excluded from the base-case cash forecast." : "Late payment delays cash; the base-case forecast still expects it.",
          next: top.next,
          ownerId: top.ownerId,
        };
      }
      case "margin":
      case "budget": {
        const p = proj(id);
        const f = ws.analysis.projectFin[id];
        if (kind === "margin" && f?.margin.forecastAtCompletion != null && f.margin.target != null) {
          impacts.push({
            label: "Forecast margin vs target",
            unit: "percent",
            value: f.margin.forecastAtCompletion - f.margin.target,
            basis: `Forecast ${(f.margin.forecastAtCompletion * 100).toFixed(1)}% against a ${(f.margin.target * 100).toFixed(0)}% target, in percentage points`,
          });
          impacts.push({
            label: "Profit below target at completion",
            unit: "money",
            value: top.impactValue,
            basis: "Revenue at completion × target margin, minus forecast profit",
          });
        } else
          impacts.push({
            label: "Forecast overrun",
            unit: "money",
            value: top.impactValue,
            basis: "Forecast cost at completion minus approved budget",
          });
        return {
          title: kind === "margin" && f?.margin.forecastAtCompletion != null && f.margin.forecastAtCompletion < 0 ? `${p?.name} is forecast to lose money` : top.title,
          what: top.why,
          why:
            kind === "margin"
              ? f?.margin.forecastAtCompletion != null && f.margin.forecastAtCompletion < 0
                ? "At this forecast the work costs more than it earns; the gap grows with every week of delay."
                : "Profit at completion is below the target for this work."
              : "The overrun needs funding, a scope cut or re-phasing.",
          next: top.next,
          ownerId: top.ownerId,
        };
      }
      case "data":
        return {
          title: top.title,
          what: sentence(top.why),
          why: "Missing information is not counted as healthy; the status cannot be judged until it is filled.",
          next: top.next,
          ownerId: top.ownerId,
        };
      case "opportunity":
        if (top.impactValue !== null)
          impacts.push({
            label: "Manual estimate",
            unit: "money",
            value: top.impactValue,
            basis: "Entered by the owner; not committed revenue",
          });
        return {
          title: top.title,
          what: top.why,
          why: "The client raised a need you could meet. It is a lead, not committed revenue.",
          next: top.next,
          ownerId: top.ownerId,
        };
      default:
        return {
          title: top.title,
          what: top.why,
          why: "",
          next: top.next,
          ownerId: top.ownerId,
        };
    }
  })();
  return { ...res, impacts };
}

/* ---------------- public API ---------------- */

export function buildIssues(ws: Workspace): Issue[] {
  const asOf = ws.org.demoDate;
  const groups = groupItems(ws);
  const issues: Issue[] = [];

  // One action is the plan for one issue: the issue it identifies most precisely. Elsewhere it shows as related.
  const candidate = new Map<string, ReturnType<typeof plansFor>>();
  for (const [key, items] of groups) {
    const [prefix, recId] = key.split(":");
    const id = `${ID_PREFIX[prefix]}${recId}`;
    candidate.set(key, plansFor(KIND_OF[prefix], keyRecords(KIND_OF[prefix], id, items, ws), ws));
  }
  const bestFor = new Map<ID, { key: string; specificity: number }>();
  for (const [key, plans] of candidate) for (const p of plans) if (p.relation === "plan" && (bestFor.get(p.actionId)?.specificity ?? -1) < p.specificity) bestFor.set(p.actionId, { key, specificity: p.specificity });

  for (const [key, items] of groups) {
    const [prefix, recId] = key.split(":");
    const kind = KIND_OF[prefix];
    const id = `${ID_PREFIX[prefix]}${recId}`;
    const d = describe(kind, key, items, ws);
    const accountIds = uniq(items.map((i) => i.accountId).filter(Boolean) as ID[]);
    const projectIds = uniq(
      [...items.map((i) => i.projectId), ...(kind === "staffing" ? (ws.analysis.capacity.overallocated.find((x) => x.person.id === recId)?.projects.map((x) => x.projectId) ?? []) : [])].filter((x): x is ID => !!x && x !== "__other__"),
    );
    for (const pid of projectIds) {
      const acc = ws.data.projects.find((p) => p.id === pid)?.accountId;
      if (acc && !accountIds.includes(acc)) accountIds.push(acc);
    }
    const personIds = uniq(items.flatMap((i) => i.links.filter((l) => l.type === "person").map((l) => l.id)));
    const plans: IssuePlan[] = (candidate.get(key) ?? [])
      .map((p) => ({ actionId: p.actionId, title: p.title, ownerId: p.ownerId, status: p.status, dueDate: p.dueDate, overdue: p.overdue, relation: p.relation === "plan" && bestFor.get(p.actionId)?.key === key ? ("plan" as const) : ("related" as const) }))
      .sort((x, y) => (x.relation === y.relation ? (x.dueDate < y.dueDate ? -1 : 1) : x.relation === "plan" ? -1 : 1));
    const primary = plans.find((p) => p.relation === "plan");
    const severity = maxSev(items.map((i) => i.severity));
    const due = items.reduce((m, i) => (i.dueDate < m ? i.dueDate : m), addDays(asOf, 14));
    const nextUpdate = primary ? primary.dueDate : due;
    const review = reviewFor(kind, accountIds, ws);
    const evidence = uniq(items.flatMap((i) => i.links).map(linkKey)).map((k) => items.flatMap((i) => i.links).find((l) => linkKey(l) === k)!);

    // Executive intervention: rules are listed in docs/permissions-and-issues.md.
    const f = projectIds.length === 1 ? ws.analysis.projectFin[projectIds[0]] : undefined;
    const reasons: string[] = [];
    if (severity === "critical") reasons.push("critical severity");
    if (items.some((i) => i.kind === "renewal")) reasons.push("a renewal is at risk");
    if (kind === "staffing" && accountIds.length >= 2) reasons.push(`one person is blocking work for ${accountIds.length} ${ws.profile.terms.accounts.toLowerCase()}`);
    if (primary?.overdue && SEV_W[severity] >= 3) reasons.push("the plan is overdue");
    if (kind === "margin" && f?.margin.forecastAtCompletion != null && f.margin.forecastAtCompletion < 0) reasons.push("the work is forecast to lose money");

    issues.push({
      id,
      kind,
      ...d,
      severity,
      review,
      accountIds,
      projectIds,
      personIds,
      plans,
      nextUpdate: primary?.overdue ? asOf : nextUpdate,
      nextUpdateOverdue: !!primary?.overdue,
      executive: reasons.length > 0,
      executiveReason: reasons.length ? `Needs an executive decision: ${reasons.join("; ")}.` : undefined,
      evidence,
      parts: items.map((i) => ({
        id: i.id,
        title: i.title,
        why: i.why,
        severity: i.severity,
        links: i.links,
      })),
      related: [],
      score: SEV_W[severity] * 100 + (reasons.length ? 50 : 0) + (primary?.overdue ? 20 : 0) + (primary ? 0 : 10) + Math.max(...items.map((i) => i.score)) / 100,
    });
  }

  // Related: issues touching the same account or project, with different owners or decisions.
  for (const i of issues) {
    i.related = issues.filter((o) => o !== i && (o.projectIds.some((p) => i.projectIds.includes(p)) || o.accountIds.some((a) => i.accountIds.includes(a)))).map((o) => o.id);
  }

  // Overdue actions that match no issue still need someone's attention.
  const planned = new Set(issues.flatMap((i) => i.plans.map((p) => p.actionId)));
  for (const a of ws.data.actions) {
    if (planned.has(a.id) || (a.status !== "open" && a.status !== "in_progress") || a.dueDate >= asOf) continue;
    issues.push({
      id: `iss_plan_${a.id}`,
      kind: "plan",
      title: `Overdue plan: ${a.title}`,
      what: a.description || `Due ${fmtDate(a.dueDate)}.`,
      why: "The agreed next step has passed its date without an update.",
      severity: a.severity,
      review: { state: "recorded", label: "From recorded data" },
      accountIds: a.accountId ? [a.accountId] : [],
      projectIds: [],
      personIds: [],
      impacts: [],
      ownerId: a.ownerId,
      next: "Owner to update the status or agree a new date.",
      plans: [
        {
          actionId: a.id,
          title: a.title,
          ownerId: a.ownerId,
          status: a.status,
          dueDate: a.dueDate,
          overdue: true,
          relation: "plan",
        },
      ],
      nextUpdate: asOf,
      nextUpdateOverdue: true,
      executive: false,
      evidence: a.links,
      parts: [],
      related: [],
      score: SEV_W[a.severity] * 100 + 20,
    });
  }

  // System issues: everyone sees the plain summary; details are on the Administration pages.
  for (const s of ws.sources) {
    issues.push({
      id: `iss_sys_${s.connectorId}`,
      kind: "system",
      title: s.summary.split(";")[0],
      what: `${s.summary.split("; ").slice(1).join("; ").replace(/^./, (c) => c.toUpperCase()) || s.summary}`,
      why: s.affects.length ? `Affects: ${s.affects.join("; ")}.` : "Some figures may be outdated.",
      severity: s.severity,
      review: { state: "recorded", label: "From connection status" },
      accountIds: [],
      projectIds: [],
      personIds: [],
      impacts: s.affects.map((a) => ({
        label: a,
        unit: "text" as const,
        value: null,
        basis: "Report that depends on this source",
      })),
      ownerId: ws.org.demoPersonas.admin,
      next: ws.caps.manageIntegrations ? "Open the connection, fix the failure and re-run the sync." : "Treat the affected figures as possibly outdated until the sync is fixed.",
      plans: [],
      nextUpdate: addDays(asOf, 1),
      nextUpdateOverdue: false,
      executive: false,
      evidence: [],
      parts: [],
      related: [],
      score: SEV_W[s.severity] * 100,
    });
  }
  if (ws.caps.manageIntegrations || ws.caps.viewSystemDetail) {
    const review = ws.data.mappings.filter((m) => !ws.overlay.mappingDecisions[m.id] && m.status === "needs_review");
    if (review.length && ws.caps.allAccounts)
      issues.push({
        id: "iss_sys_mappings",
        kind: "system",
        title: `${review.length} record mapping${review.length === 1 ? "" : "s"} need review`,
        what: `Records from connected tools that could not be matched to ${ws.profile.terms.accounts.toLowerCase()} or ${ws.profile.terms.projects.toLowerCase()} with confidence: ${review.map((m) => m.externalName).join(", ")}.`,
        why: "Unmapped records are left out of health, time and margin figures until someone confirms where they belong.",
        severity: "medium",
        review: { state: "recorded", label: "From connection status" },
        accountIds: [],
        projectIds: [],
        personIds: [],
        impacts: [
          {
            label: "Records waiting",
            unit: "count",
            value: review.length,
            basis: "Mappings marked for review",
          },
        ],
        ownerId: ws.org.demoPersonas.admin,
        next: "Confirm or reject each suggested match.",
        plans: [],
        nextUpdate: addDays(asOf, 3),
        nextUpdateOverdue: false,
        executive: false,
        evidence: [],
        parts: [],
        related: [],
        score: 200,
      });
  }

  // Finance: periods with missing cost records make margins and the operating result unreliable.
  if (ws.caps.viewCompanyFinance && ws.finance && ws.finance.summary.missing.length) {
    issues.push({
      id: "iss_data_costs",
      kind: "data",
      title: "Cost records are incomplete for this period",
      what: ws.finance.summary.missing.join(" "),
      why: "Labor cost is understated, so delivery margin and the operating result read better than they are.",
      severity: "medium",
      review: { state: "recorded", label: "From recorded data" },
      accountIds: [],
      projectIds: [],
      personIds: [],
      impacts: [
        {
          label: "Figures affected",
          unit: "text",
          value: null,
          basis: "Delivery margin, operating result, project margins",
        },
      ],
      ownerId: ws.org.demoPersonas.finance,
      next: "Add the missing cost rates and payroll records, then re-check margins.",
      plans: [],
      nextUpdate: addDays(asOf, 5),
      nextUpdateOverdue: false,
      executive: false,
      evidence: [{ type: "calculation", id: "finance:period" }],
      parts: [],
      related: [],
      score: 210,
    });
  }

  return issues.sort((a, b) => b.score - a.score);
}

/** Which issues each role should see first. Everyone can still open the full list. */
export function issuesForRole(issues: Issue[], role: RoleId, userId: ID): Issue[] {
  const by = (pred: (i: Issue) => boolean) => [...issues.filter(pred), ...issues.filter((i) => !pred(i))];
  switch (role) {
    case "executive":
      return by((i) => i.executive).filter((i) => i.kind !== "system" || i.severity === "high");
    case "finance": {
      const own = (i: Issue) => ["collections", "margin", "budget"].includes(i.kind) || i.id === "iss_data_costs";
      return [...issues.filter(own), ...issues.filter((i) => !own(i))].filter(
        (i) =>
          ["collections", "margin", "budget", "data"].includes(i.kind) ||
          i.impacts.some((x) => x.unit === "money" && x.label !== "Manual estimate") ||
          (i.kind === "system" && i.impacts.some((x) => /receivable|cash|cost|margin/i.test(x.label))),
      );
    }
    case "account_owner":
      // Their own items rank ahead of equally urgent ones owned by colleagues.
      return issues.filter((i) => i.kind !== "system").sort((a, b) => b.score + (b.ownerId === userId ? 40 : 0) - (a.score + (a.ownerId === userId ? 40 : 0)));
    case "admin":
      return by((i) => i.kind === "system").filter((i) => i.kind === "system" || i.kind === "data");
  }
}

/** Issue an action belongs to, for "View plan" links and the action page. */
export function issueForAction(issues: Issue[], actionId: ID): Issue | undefined {
  return issues.find((i) => i.plans.some((p) => p.actionId === actionId && p.relation === "plan"));
}
