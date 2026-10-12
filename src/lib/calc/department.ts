import type { Dataset, EvidenceLink, ID, ISODate, Person, Project, Severity, Task, Thread } from "@/domain/types";
import { addDays, daysBetween, endOfMonth, fmtDate, fmtMonth, maxDate, minDate, mondaysBetween, monthsBetween, startOfMonth } from "@/lib/dates";
import { isDeliveryRole, personCapacity } from "./capacity";
import { coverage, type Period } from "./company";
import { annualLoadedCost, compOn, costRateOn, earnedRevenue, plannedHoursBetween, type MilestoneState, type ProjectFinancials } from "./finance";
import { indexOf } from "./index";

/**
 * Department view: one department's projects, retainers, task watchouts, P&L,
 * hours and comms-based feedback. Computed from the full dataset because team
 * cost needs compensation, but only totals leave this module: no individual
 * salary or cost rate is returned. Message evidence comes only from threads the
 * viewer may read.
 */

/** People whose department is `name` and who have not left. */
export function departmentMembers(ds: Pick<Dataset, "people">, name: string, asOf: ISODate): Person[] {
  return ds.people.filter((p) => p.department === name && (!p.endDate || p.endDate >= asOf));
}

/** Projects the department works on: a member is assigned to it or has recorded time on it, or it belongs to the department. */
export function departmentProjectIds(ds: Pick<Dataset, "projects" | "timeEntries">, name: string, memberIds: Set<ID>): Set<ID> {
  const out = new Set<ID>();
  for (const p of ds.projects) if (p.department === name || p.assignments.some((a) => memberIds.has(a.personId))) out.add(p.id);
  for (const e of ds.timeEntries) if (memberIds.has(e.personId)) out.add(e.projectId);
  return out;
}

/** The department a person heads, if any. */
export function departmentHeadedBy(ds: Pick<Dataset, "org">, personId: ID): string | null {
  return ds.org.departments.find((d) => d.headId === personId)?.name ?? null;
}

export interface DeptProjectRow {
  projectId: ID;
  accountId?: ID;
  billing: Project["billing"];
  status: Project["status"];
  /** Department hours and all hours in the period. */
  deptHours: number;
  totalHours: number;
  deptShare: number | null;
  deptHoursToDate: number;
  /** Earned revenue in the period × the department's share of the project's hours. */
  attributedRevenue: number | null;
  /** Cost of the department's hours in the period (employees and contractors). */
  deptCost: number;
  forecastMargin: number | null;
  targetMargin: number | null;
  variance: number | null;
  forecastProfit: number | null;
  verdict: "loss" | "below_target" | "on_target" | "internal" | "unknown";
}

export interface RetainerRow {
  projectId: ID;
  accountId?: ID;
  includedPerMonth: number;
  monthlyFee: number | null;
  /** Last full month. */
  last: { ym: string; hours: number; deptHours: number; pct: number | null } | null;
  /** The last three full months, oldest first. */
  history: { ym: string; label: string; hours: number; deptHours: number; included: number }[];
  /** Planned hours this month from current assignments. */
  planned: { ym: string; hours: number; pct: number | null };
  unbilledOverageHours: number;
  /** Fee ÷ hours used in the last full month. */
  effectiveRate: number | null;
  renewalDate?: ISODate;
  status: "over" | "near" | "ok";
}

export interface Watchout {
  id: string;
  kind: "blocked" | "waiting" | "overdue" | "time_off" | "overload" | "unpriced" | "revisions" | "retainer" | "margin" | "timesheets";
  severity: Severity;
  title: string;
  why: string;
  next: string;
  ownerId: ID;
  due?: ISODate;
  links: EvidenceLink[];
}

export interface FeedbackEvidence {
  messageId: ID;
  threadId: ID;
  projectId?: ID;
  sentAt: string;
  author: string;
  excerpt: string;
  tone: "positive" | "concern" | "mixed";
  /** "named": the message names the person. "project": attributed by their share of recent hours on the project. */
  basis: "named" | "project";
  weight: number;
}

export interface PersonRow {
  person: Person;
  hours: { available: number; logged: number; billable: number; nonBillable: number; utilization: number | null; missingWeeks: ISODate[]; overtimeWeeks: number };
  /** Recorded hours for the last eight complete weeks, oldest first, against capacity. */
  weeks: { week: ISODate; hours: number; capacity: number }[];
  upcoming: { peakPct: number; overallocatedWeeks: number; timeOff: { start: ISODate; end: ISODate }[] };
  tasks: { done: number; onTime: number; onTimeRate: number | null; open: number; overdue: number; avgRevisions: number | null };
  feedback: { score: number | null; positive: number; concerns: number; evidence: FeedbackEvidence[] };
}

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  format: "pct" | "number" | "score" | "money";
  target: number | null;
  /** Higher is better unless false. */
  higherIsBetter: boolean;
  sub: string;
  tone?: "good" | "warn" | "bad";
}

export interface DepartmentPnl {
  revenue: number;
  directLabor: number;
  contractors: number;
  contribution: number;
  contributionMargin: number | null;
  teamPayroll: number;
  /** Payroll not absorbed by client work: internal projects, unrecorded time and the head's own time. */
  unabsorbedPayroll: number;
  internalContractors: number;
  result: number;
  missing: string[];
  monthly: { ym: string; label: string; earned: number; directCost: number; invoiced: number; collected: number; margin: number | null }[];
}

export interface DepartmentView {
  name: string;
  headId: ID | null;
  memberIds: ID[];
  period: Period;
  asOf: ISODate;
  projects: DeptProjectRow[];
  retainers: RetainerRow[];
  watchouts: Watchout[];
  pnl: DepartmentPnl;
  people: PersonRow[];
  kpis: Kpi[];
  feedback: { score: number | null; positive: number; concerns: number; messages: number };
}

export interface DepartmentInput {
  ds: Dataset;
  name: string;
  period: Period;
  projectFin: Record<ID, ProjectFinancials>;
  milestones: Record<ID, { state: MilestoneState; due: ISODate; slipDays: number }>;
  /** Threads the viewer may read. Feedback is scored only from these. */
  canReadThread: (t: Thread) => boolean;
}

// Simulated review lexicon. Phrases only, matched case-insensitively; message text is never followed as instructions.
const POSITIVE = ["great work", "really pleased", "fantastic", "loved", "love the", "impressed", "exactly what we needed", "tested really well", "spot on", "beautiful", "excellent", "strongest", "much better", "fast turnaround", "feel premium", "outperforming", "nice work", "helpful"];
const CONCERN = ["disappointed", "frustrated", "off-brand", "another round", "rework", "typo", "still not fixed", "still seeing", "slipped", "not happy", "unacceptable", "losing confidence", "generic", "hard to get a response", "second time"];
const UNPRICED = /change order|not covered|unpriced|needs scoping/i;
const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function nameKeys(p: Person): string[] {
  const first = p.name.split(/\s+/)[0].toLowerCase();
  // Partner studios are referred to by their full or last name ("Studio Kite", "Kite").
  return p.type === "contractor" && first === "studio" ? [p.name.toLowerCase(), p.name.split(/\s+/).slice(-1)[0].toLowerCase()] : [p.name.toLowerCase(), first];
}

function scoreOf(pos: number, neg: number): number | null {
  // Smoothed share of positive feedback; needs at least one full mention to say anything.
  if (pos + neg < 1) return null;
  return Math.round((100 * (pos + 0.5)) / (pos + neg + 1));
}

export function departmentView(input: DepartmentInput): DepartmentView {
  const { ds, name, period, projectFin } = input;
  const idx = indexOf(ds);
  const asOf = ds.org.demoDate;
  const members = departmentMembers(ds, name, asOf);
  const memberIds = new Set(members.map((p) => p.id));
  const projectIds = departmentProjectIds(ds, name, memberIds);
  const projects = ds.projects.filter((p) => projectIds.has(p.id));
  const headId = ds.org.departments.find((d) => d.name === name)?.headId ?? null;
  const start = coverage(ds, period).coveredStart;
  const end = minDate(period.end, asOf);
  const target = ds.org.billableUtilizationTarget ?? null;

  // ---- Hours and cost of department time, by project ----
  const missingRate = new Set<ID>();
  const sliceHours = (projectId: ID, s: ISODate, e: ISODate) => {
    let dept = 0;
    let total = 0;
    let deptLabor = 0;
    let deptContractor = 0;
    for (const t of idx.entriesByProject.get(projectId) ?? []) {
      if (t.date < s || t.date > e) continue;
      total += t.hours;
      if (!memberIds.has(t.personId)) continue;
      dept += t.hours;
      const rate = costRateOn(ds, t.personId, t.date);
      if (rate === null) {
        missingRate.add(t.personId);
        continue;
      }
      if (idx.person.get(t.personId)?.type === "contractor") deptContractor += rate * t.hours;
      else deptLabor += rate * t.hours;
    }
    return { dept, total, deptLabor, deptContractor };
  };

  const rows: DeptProjectRow[] = projects.map((p) => {
    const h = sliceHours(p.id, start, end);
    const toDate = sliceHours(p.id, ds.org.dataStart, asOf);
    const share = h.total > 0 ? h.dept / h.total : null;
    const earned = earnedRevenue(ds, p, start, end);
    const f = projectFin[p.id];
    const m = f?.margin;
    const verdict: DeptProjectRow["verdict"] =
      p.billing === "internal" ? "internal" : !m || m.forecastAtCompletion === null ? "unknown" : m.forecastAtCompletion < 0 ? "loss" : m.variance !== null && m.variance < -0.05 ? "below_target" : "on_target";
    return {
      projectId: p.id,
      accountId: p.accountId,
      billing: p.billing,
      status: p.status,
      deptHours: h.dept,
      totalHours: h.total,
      deptShare: share,
      deptHoursToDate: toDate.dept,
      attributedRevenue: earned === null ? null : earned * (share ?? 0),
      deptCost: h.deptLabor + h.deptContractor,
      forecastMargin: m?.forecastAtCompletion ?? null,
      targetMargin: m?.target ?? null,
      variance: m?.variance ?? null,
      forecastProfit: m?.forecastProfit ?? null,
      verdict,
    };
  });
  rows.sort((a, b) => b.deptHours - a.deptHours);

  // ---- P&L ----
  const pnlFor = (s: ISODate, e: ISODate) => {
    let revenue = 0;
    let directLabor = 0;
    let contractors = 0;
    let internalContractors = 0;
    for (const p of projects) {
      const h = sliceHours(p.id, s, e);
      if (p.kind === "client") {
        const earned = earnedRevenue(ds, p, s, e);
        revenue += h.total > 0 ? (earned ?? 0) * (h.dept / h.total) : 0;
        directLabor += h.deptLabor;
        contractors += h.deptContractor;
      } else internalContractors += h.deptContractor;
    }
    return { revenue, directLabor, contractors, internalContractors };
  };
  const payroll = (s: ISODate, e: ISODate) => {
    let total = 0;
    for (const ym of monthsBetween(s, e)) {
      const ms = maxDate(`${ym}-01`, s);
      const me = minDate(endOfMonth(`${ym}-01`), e);
      const days = daysBetween(`${ym}-01`, endOfMonth(`${ym}-01`)) + 1;
      for (const p of members) {
        if (p.type !== "employee") continue;
        const from = maxDate(ms, p.startDate);
        const to = p.endDate ? minDate(me, p.endDate) : me;
        if (from > to) continue;
        const loaded = annualLoadedCost(compOn(ds, p.id, from));
        if (loaded === null) {
          missingRate.add(p.id);
          continue;
        }
        total += (loaded / 12) * ((daysBetween(from, to) + 1) / days);
      }
    }
    return total;
  };
  const cur = pnlFor(start, end);
  const teamPayroll = payroll(start, end);
  const contribution = cur.revenue - cur.directLabor - cur.contractors;
  const lastMonthEnd = addDays(startOfMonth(asOf), -1);
  const monthly = monthsBetween(maxDate(startOfMonth(addDays(startOfMonth(lastMonthEnd), -150)), ds.org.dataStart), lastMonthEnd).map((ym) => {
    const x = pnlFor(`${ym}-01`, endOfMonth(`${ym}-01`));
    const cost = x.directLabor + x.contractors;
    return { ym, label: fmtMonth(ym), earned: x.revenue, directCost: cost, invoiced: 0, collected: 0, margin: x.revenue > 0 ? (x.revenue - cost) / x.revenue : null };
  });
  const missing: string[] = [];
  const cov = coverage(ds, period);
  if (cov.note) missing.push(cov.note);
  if (missingRate.size) missing.push(`${[...missingRate].map((id) => idx.person.get(id)?.name ?? id).join(", ")} ${missingRate.size === 1 ? "has" : "have"} no cost record, so department cost is understated.`);
  const pnl: DepartmentPnl = {
    ...cur,
    contribution,
    contributionMargin: cur.revenue > 0 ? contribution / cur.revenue : null,
    teamPayroll,
    unabsorbedPayroll: teamPayroll - cur.directLabor,
    result: cur.revenue - teamPayroll - cur.contractors - cur.internalContractors,
    missing,
    monthly,
  };

  // ---- Retainers ----
  const curYm = asOf.slice(0, 7);
  const retainers: RetainerRow[] = projects
    .filter((p) => p.billing === "retainer" && p.status !== "completed")
    .map((p) => {
      const f = projectFin[p.id];
      const contract = p.contractId ? ds.contracts.find((c) => c.id === p.contractId) : undefined;
      const included = f?.retainer?.includedPerMonth ?? contract?.includedHoursPerMonth ?? 0;
      const months = (f?.retainer?.months ?? []).filter((m) => m.ym < curYm);
      const history = months.slice(-3).map((m) => ({ ym: m.ym, label: fmtMonth(m.ym), hours: m.hours, deptHours: sliceHours(p.id, `${m.ym}-01`, endOfMonth(`${m.ym}-01`)).dept, included: m.included }));
      const lastM = history[history.length - 1];
      const plannedHours = plannedHoursBetween(p, `${curYm}-01`, endOfMonth(`${curYm}-01`));
      const lastPct = lastM && lastM.included > 0 ? lastM.hours / lastM.included : null;
      const plannedPct = included > 0 ? plannedHours / included : null;
      return {
        projectId: p.id,
        accountId: p.accountId,
        includedPerMonth: included,
        monthlyFee: contract?.monthlyFee ?? null,
        last: lastM ? { ym: lastM.ym, hours: lastM.hours, deptHours: lastM.deptHours, pct: lastPct } : null,
        history,
        planned: { ym: curYm, hours: plannedHours, pct: plannedPct },
        unbilledOverageHours: f?.retainer?.overageHours ?? 0,
        effectiveRate: lastM && lastM.hours > 0 && contract?.monthlyFee ? contract.monthlyFee / lastM.hours : null,
        renewalDate: contract?.renewalDate,
        status: ((lastPct ?? 0) > 1 ? "over" : (lastPct ?? 0) > 0.9 || (plannedPct ?? 0) > 1 ? "near" : "ok") as RetainerRow["status"],
      };
    })
    .sort((a, b) => (b.last?.pct ?? 0) - (a.last?.pct ?? 0));

  // ---- People: hours, delivery and feedback ----
  const recentWeeks = mondaysBetween(addDays(asOf, -56), addDays(asOf, -1)).filter((w) => addDays(w, 6) < asOf);
  const deptTasks = ds.tasks.filter((t) => projectIds.has(t.projectId) && t.assigneeId && memberIds.has(t.assigneeId));
  const since = addDays(asOf, -90);
  const capacities = new Map(members.map((p) => [p.id, personCapacity(ds, p, start, end)]));

  // Feedback: client messages on department projects the viewer can read.
  const evidenceByPerson = new Map<ID, FeedbackEvidence[]>();
  let teamPos = 0;
  let teamNeg = 0;
  let scored = 0;
  for (const t of ds.threads) {
    if (!t.projectId || !projectIds.has(t.projectId) || !input.canReadThread(t)) continue;
    for (const m of t.messages) {
      const day = m.sentAt.slice(0, 10);
      if (m.authorSide !== "client" || day > asOf || day < ds.org.dataStart) continue;
      const text = m.body.toLowerCase();
      const pos = POSITIVE.some((w) => text.includes(w));
      const neg = CONCERN.some((w) => text.includes(w));
      if (!pos && !neg) continue;
      scored++;
      if (pos) teamPos++;
      if (neg) teamNeg++;
      const tone: FeedbackEvidence["tone"] = pos && neg ? "mixed" : pos ? "positive" : "concern";
      const base = { messageId: m.id, threadId: t.id, projectId: t.projectId, sentAt: m.sentAt, author: m.author, excerpt: m.body.length > 180 ? `${m.body.slice(0, 177)}…` : m.body, tone };
      const named = members.filter((p) => nameKeys(p).some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)));
      if (named.length) {
        for (const p of named) evidenceByPerson.set(p.id, [...(evidenceByPerson.get(p.id) ?? []), { ...base, basis: "named", weight: 1 }]);
        continue;
      }
      // Not named: share it among department people by their hours on the project in the four weeks before.
      const h = new Map<ID, number>();
      let total = 0;
      for (const e of idx.entriesByProject.get(t.projectId) ?? []) {
        if (e.date > day || e.date < addDays(day, -28)) continue;
        total += e.hours;
        if (memberIds.has(e.personId)) h.set(e.personId, (h.get(e.personId) ?? 0) + e.hours);
      }
      for (const [pid, hours] of h) {
        const w = total > 0 ? hours / total : 0;
        if (w >= 0.1) evidenceByPerson.set(pid, [...(evidenceByPerson.get(pid) ?? []), { ...base, basis: "project", weight: Math.round(w * 100) / 100 }]);
      }
    }
  }

  const people: PersonRow[] = members
    .filter((p) => isDeliveryRole(p))
    .map((p) => {
      const pc = capacities.get(p.id)!;
      const entries = idx.entriesByPerson.get(p.id) ?? [];
      const weekly = recentWeeks.map((w) => ({ week: w, hours: entries.filter((e) => e.date === w).reduce((s, e) => s + e.hours, 0), capacity: pc.weeklyCapacity }));
      const periodWeeks = mondaysBetween(start, end).map((w) => entries.filter((e) => e.date === w).reduce((s, e) => s + e.hours, 0));
      const mine = deptTasks.filter((t) => t.assigneeId === p.id);
      const done = mine.filter((t) => t.status === "done" && t.completedOn && t.completedOn >= since);
      const onTime = done.filter((t) => t.completedOn! <= t.due).length;
      const revs = mine.filter((t) => t.revisionRounds !== undefined && (t.status !== "done" || (t.completedOn ?? "") >= since));
      const ev = (evidenceByPerson.get(p.id) ?? []).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
      const posW = ev.filter((e) => e.tone !== "concern").reduce((s, e) => s + e.weight, 0);
      const negW = ev.filter((e) => e.tone !== "positive").reduce((s, e) => s + e.weight, 0);
      return {
        person: p,
        hours: {
          available: pc.period.available,
          logged: pc.period.actual,
          billable: pc.period.billable,
          nonBillable: pc.period.actual - pc.period.billable,
          utilization: pc.period.utilization,
          missingWeeks: pc.period.missingWeeks,
          overtimeWeeks: periodWeeks.filter((h) => h > pc.weeklyCapacity * 1.05).length,
        },
        weeks: weekly,
        upcoming: {
          peakPct: pc.upcoming.peakPct,
          overallocatedWeeks: pc.upcoming.weeks.slice(0, 4).filter((w) => w.pct > 1.05).length,
          timeOff: ds.timeOff.filter((x) => x.personId === p.id && x.end >= asOf && x.start <= addDays(asOf, 56)).map((x) => ({ start: x.start, end: x.end })),
        },
        tasks: {
          done: done.length,
          onTime,
          onTimeRate: done.length ? onTime / done.length : null,
          open: mine.filter((t) => t.status !== "done").length,
          overdue: mine.filter((t) => t.status !== "done" && t.due < asOf).length,
          avgRevisions: revs.length ? revs.reduce((s, t) => s + (t.revisionRounds ?? 0), 0) / revs.length : null,
        },
        feedback: { score: scoreOf(posW, negW), positive: ev.filter((e) => e.tone !== "concern").length, concerns: ev.filter((e) => e.tone !== "positive").length, evidence: ev },
      };
    })
    .sort((a, b) => Number(a.person.type === "contractor") - Number(b.person.type === "contractor") || a.person.name.localeCompare(b.person.name));

  // ---- Watchouts ----
  const watchouts: Watchout[] = [];
  const taskById = new Map(ds.tasks.map((t) => [t.id, t]));
  const projectOwner = (id: ID) => idx.project.get(id)?.ownerId ?? headId ?? ds.org.demoPersonas.executive;
  const owner = headId ?? ds.org.demoPersonas.executive;
  const open = deptTasks.filter((t) => t.status !== "done" && idx.project.get(t.projectId)?.status !== "completed");
  const soon = addDays(asOf, 21);
  const who = (t: Task) => idx.person.get(t.assigneeId!)?.name ?? "Unassigned";
  const proj = (id: ID) => idx.project.get(id)?.name ?? "a project";
  const waiting = new Map<ID, Task[]>();
  for (const t of open) {
    const links: EvidenceLink[] = [{ type: "task", id: t.id }, { type: "project", id: t.projectId }];
    const blockers = t.dependsOn.map((d) => taskById.get(d)).filter((d): d is Task => !!d && d.status !== "done");
    if (t.status === "blocked") {
      watchouts.push({ id: `wo_blocked_${t.id}`, kind: "blocked", severity: t.due < asOf || t.due <= addDays(asOf, 14) ? "high" : "medium", title: `${t.title} is blocked`, why: `${who(t)} on ${proj(t.projectId)}. ${t.blockerNote ?? "Marked blocked."} Due ${fmtDate(t.due)}.`, next: "Get the blocker cleared or move the due date with the client.", ownerId: projectOwner(t.projectId), due: t.due, links });
    } else if (t.due < asOf) {
      watchouts.push({ id: `wo_overdue_${t.id}`, kind: "overdue", severity: daysBetween(t.due, asOf) > 7 ? "high" : "medium", title: `${t.title} is ${daysBetween(t.due, asOf)} days overdue`, why: `${who(t)} on ${proj(t.projectId)}, due ${fmtDate(t.due)}.${t.blockerNote ? ` ${t.blockerNote}.` : ""}`, next: "Agree a new date or reassign it.", ownerId: owner, due: t.due, links });
    } else if (blockers.some((b) => b.status === "blocked") && t.due <= soon) {
      // One watchout per blocking task, listing everything of ours queued behind it.
      const b = blockers.find((x) => x.status === "blocked")!;
      (waiting.get(b.id) ?? waiting.set(b.id, []).get(b.id)!).push(t);
    }
    if (t.blockerNote && UNPRICED.test(t.blockerNote)) {
      watchouts.push({ id: `wo_unpriced_${t.id}`, kind: "unpriced", severity: "medium", title: `Unpriced request: ${t.title}`, why: `${t.estimateHours} h of creative work on ${proj(t.projectId)} with no agreed price: ${t.blockerNote}.`, next: "Price it as a change order before the team starts.", ownerId: projectOwner(t.projectId), due: t.due, links });
    }
    if ((t.revisionRounds ?? 0) >= 3) {
      watchouts.push({ id: `wo_revisions_${t.id}`, kind: "revisions", severity: "medium", title: `${t.title} is on revision round ${t.revisionRounds}`, why: `Three or more rounds usually means the brief or approvals need resetting. ${who(t)} on ${proj(t.projectId)}.`, next: "Reconfirm the brief and who approves before the next round.", ownerId: owner, due: t.due, links });
    }
    const off = ds.timeOff.find((x) => x.personId === t.assigneeId && x.start <= t.due && x.end >= asOf);
    if (off && t.status !== "blocked") {
      watchouts.push({ id: `wo_off_${t.id}`, kind: "time_off", severity: "medium", title: `${who(t)} is off ${fmtDate(off.start, { year: false })}–${fmtDate(off.end, { year: false })} before ${t.title} is due`, why: `${t.estimateHours} h due ${fmtDate(t.due)} on ${proj(t.projectId)}.`, next: "Bring it forward or line up cover.", ownerId: owner, due: t.due, links: [...links, { type: "person", id: t.assigneeId! }] });
    }
  }
  for (const [blockerId, queued] of waiting) {
    const b = taskById.get(blockerId)!;
    const hours = queued.reduce((x, t) => x + t.estimateHours, 0);
    const first = queued.map((t) => t.due).sort()[0];
    watchouts.push({
      id: `wo_waiting_${blockerId}`,
      kind: "waiting",
      severity: queued.length > 1 || first <= addDays(asOf, 14) ? "high" : "medium",
      title: `${queued.length === 1 ? queued[0].title : `${queued.length} creative tasks`} waiting on "${b.title}"`,
      why: `${hours} h of your team's work (${queued.map((t) => `${t.title}, ${who(t)}, due ${fmtDate(t.due, { year: false })}`).join("; ")}) cannot start until it is cleared${b.blockerNote ? `: ${b.blockerNote}` : ""}.`,
      next: "Hold the hours for other work or move the dates now, before they turn into late deliveries.",
      ownerId: projectOwner(b.projectId),
      due: first,
      links: [{ type: "task", id: b.id }, ...queued.map((t) => ({ type: "task" as const, id: t.id })), { type: "project", id: b.projectId }],
    });
  }
  for (const r of people) {
    const pc = capacities.get(r.person.id)!;
    if (r.upcoming.overallocatedWeeks >= 2) {
      const due = open.filter((t) => t.assigneeId === r.person.id && t.due <= soon);
      const others = pc.projects.length;
      watchouts.push({ id: `wo_overload_${r.person.id}`, kind: "overload", severity: r.upcoming.peakPct > 1.15 ? "high" : "medium", title: `${r.person.name} is planned at up to ${Math.round(r.upcoming.peakPct * 100)}% of capacity`, why: `${others} active projects and ${due.length} task${due.length === 1 ? "" : "s"} due in the next three weeks${due.length ? ` (${due.map((t) => t.title).slice(0, 3).join("; ")})` : ""}.`, next: "Decide what moves: shift a task to a teammate or contractor, or agree a later date.", ownerId: owner, due: due.map((t) => t.due).sort()[0], links: [{ type: "person", id: r.person.id }, ...due.slice(0, 4).map((t) => ({ type: "task" as const, id: t.id }))] });
    }
    if (r.hours.missingWeeks.length) {
      watchouts.push({ id: `wo_time_${r.person.id}`, kind: "timesheets", severity: r.hours.missingWeeks.length >= 3 ? "medium" : "low", title: `${r.person.name} has ${r.hours.missingWeeks.length} week${r.hours.missingWeeks.length === 1 ? "" : "s"} without timesheets`, why: `Planned on work but no time recorded for the weeks of ${r.hours.missingWeeks.slice(-3).map((w) => fmtDate(w, { year: false })).join(", ")}. Margins and retainer hours read better than they are.`, next: "Ask for the missing timesheets this week.", ownerId: owner, links: [{ type: "person", id: r.person.id }] });
    }
  }
  for (const r of retainers) {
    if (r.status === "ok" || !r.last) continue;
    const over = r.last.hours - r.includedPerMonth;
    watchouts.push({
      id: `wo_retainer_${r.projectId}`,
      kind: "retainer",
      severity: (r.last.pct ?? 0) > 1.25 ? "high" : "medium",
      title: `${proj(r.projectId)} used ${Math.round((r.last.pct ?? 0) * 100)}% of its hours in ${fmtMonth(r.last.ym)}`,
      why: `${Math.round(r.last.hours)} h against ${r.includedPerMonth} included${over > 0 ? `; ${Math.round(over)} h over, ${Math.round(r.unbilledOverageHours)} h of overage unbilled so far` : ""}. ${Math.round(r.last.deptHours)} h were your team's. This month is planned at ${Math.round((r.planned.pct ?? 0) * 100)}%.`,
      next: over > 0 ? "Agree with the account owner whether to bill overage, trim requests or re-scope the retainer." : "Watch requests this month; planned work already fills the allowance.",
      ownerId: projectOwner(r.projectId),
      links: [{ type: "project", id: r.projectId }, { type: "calculation", id: `margin:${r.projectId}` }],
    });
  }
  for (const r of rows) {
    if ((r.verdict === "loss" || r.verdict === "below_target") && r.status !== "completed" && (r.deptShare ?? 0) >= 0.15) {
      watchouts.push({ id: `wo_margin_${r.projectId}`, kind: "margin", severity: r.verdict === "loss" ? "high" : "medium", title: `${proj(r.projectId)} is forecast ${r.verdict === "loss" ? "to lose money" : "below its margin target"}`, why: `Forecast margin ${r.forecastMargin === null ? "unknown" : `${Math.round(r.forecastMargin * 100)}%`} against a ${r.targetMargin === null ? "—" : `${Math.round(r.targetMargin * 100)}%`} target, and your team logged ${Math.round((r.deptShare ?? 0) * 100)}% of its hours this period.`, next: "Keep creative effort to what was sold; flag any extra asks as change orders.", ownerId: projectOwner(r.projectId), links: [{ type: "project", id: r.projectId }, { type: "calculation", id: `margin:${r.projectId}` }] });
    }
  }
  watchouts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  // ---- KPIs ----
  const deliveryEmployees = people.filter((p) => p.person.type === "employee");
  const avail = deliveryEmployees.reduce((s, p) => s + p.hours.available, 0);
  const billable = deliveryEmployees.reduce((s, p) => s + p.hours.billable, 0);
  // Utilization only means something where the business bills time.
  const util = avail > 0 && (target !== null || billable > 0) ? billable / avail : null;
  const doneAll = people.reduce((s, p) => s + p.tasks.done, 0);
  const onTimeAll = people.reduce((s, p) => s + p.tasks.onTime, 0);
  const revTasks = deptTasks.filter((t) => t.revisionRounds !== undefined && (t.status !== "done" || (t.completedOn ?? "") >= since));
  const avgRev = revTasks.length ? revTasks.reduce((s, t) => s + (t.revisionRounds ?? 0), 0) / revTasks.length : null;
  const retLast = retainers.filter((r) => r.last);
  const retUsed = retLast.reduce((s, r) => s + r.last!.hours, 0);
  const retIncluded = retLast.reduce((s, r) => s + r.includedPerMonth, 0);
  const plannedWeeks = people.reduce((s, p) => s + mondaysBetween(start, end).filter((w) => w <= asOf && plannedOn(ds, p.person.id, w)).length, 0);
  const missingWeeks = people.reduce((s, p) => s + p.hours.missingWeeks.length, 0);
  const teamScore = scoreOf(teamPos, teamNeg);
  const tone = (v: number | null, t: number | null, higher = true, slack = 0.05): Kpi["tone"] => (v === null || t === null ? undefined : higher ? (v >= t ? "good" : v >= t - slack ? "warn" : "bad") : v <= t ? "good" : v <= t + slack ? "warn" : "bad");
  const kpis: Kpi[] = [
    { key: "utilization", label: "Billable utilization", value: util, format: "pct", target, higherIsBetter: true, sub: `Employees · ${Math.round(billable)} of ${Math.round(avail)} h available`, tone: tone(util, target) },
    { key: "contribution", label: "Contribution margin", value: pnl.contributionMargin, format: "pct", target: ds.org.defaultTargetMargin || null, higherIsBetter: true, sub: "Attributed revenue less team direct cost", tone: tone(pnl.contributionMargin, ds.org.defaultTargetMargin || null) },
    { key: "on_time", label: "On-time delivery", value: doneAll ? onTimeAll / doneAll : null, format: "pct", target: 0.85, higherIsBetter: true, sub: doneAll ? `${onTimeAll} of ${doneAll} tasks finished in the last 90 days` : "No tasks finished in the last 90 days", tone: tone(doneAll ? onTimeAll / doneAll : null, 0.85, true, 0.1) },
    { key: "retainer", label: "Retainer hours used", value: retIncluded > 0 ? retUsed / retIncluded : null, format: "pct", target: 1, higherIsBetter: false, sub: retLast.length ? `${Math.round(retUsed)} of ${Math.round(retIncluded)} h included · ${fmtMonth(retLast[0].last!.ym)}` : "No active retainers", tone: retIncluded > 0 ? (retUsed / retIncluded > 1.05 ? "bad" : retUsed / retIncluded > 0.95 ? "warn" : "good") : undefined },
    { key: "feedback", label: "Client feedback score", value: teamScore, format: "score", target: 70, higherIsBetter: true, sub: scored ? `${teamPos} positive, ${teamNeg} with concerns, from ${scored} client messages` : "No client feedback in readable threads", tone: tone(teamScore, 70, true, 10) },
    { key: "revisions", label: "Revision rounds", value: avgRev, format: "number", target: 2, higherIsBetter: false, sub: `Average per deliverable · ${revTasks.length} tracked`, tone: tone(avgRev, 2, false, 0.5) },
    { key: "timesheets", label: "Timesheet compliance", value: plannedWeeks ? 1 - missingWeeks / plannedWeeks : null, format: "pct", target: 0.95, higherIsBetter: true, sub: `${missingWeeks} missing of ${plannedWeeks} planned person-weeks`, tone: tone(plannedWeeks ? 1 - missingWeeks / plannedWeeks : null, 0.95) },
  ];

  return {
    name,
    headId,
    memberIds: [...memberIds],
    period,
    asOf,
    projects: rows,
    retainers,
    watchouts,
    pnl,
    people,
    kpis,
    feedback: { score: teamScore, positive: teamPos, concerns: teamNeg, messages: scored },
  };
}

function plannedOn(ds: Dataset, personId: ID, week: ISODate): boolean {
  return ds.projects.some((p) => p.assignments.some((a) => a.personId === personId && a.from <= addDays(week, 6) && a.to >= week));
}
