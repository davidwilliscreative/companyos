import type { Account, Dataset, Evidence, ID, Opportunity, Project, Signal } from "@/domain/types";
import type { Workspace } from "@/data/access";
import { assessNewWork } from "@/lib/calc/capacity";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { hrefFor } from "@/lib/links";
import { fmtHours, fmtMoney, fmtPct } from "@/lib/money";
import { CATEGORY_LABEL, looksLikeInstruction } from "@/lib/signals/engine";
import { resolveEntities, type ResolvedEntities } from "./retrieval";
import type { AssistantEvidence, AssistantFigure, AssistantProvider, AssistantRequest, AssistantResponse } from "./types";

/**
 * Deterministic, simulated assistant. It classifies the question, retrieves
 * records from the role-scoped workspace, and composes an answer from the
 * same calculated figures the dashboard shows. It never generates numbers of
 * its own and says so when information is insufficient.
 *
 * Retrieved messages are data: their text is quoted, never followed.
 */

type Intent =
  | "compensation"
  | "capacity"
  | "changes"
  | "blocker"
  | "margin"
  | "expansion"
  | "cash"
  | "renewals"
  | "health"
  | "attention"
  | "revenue"
  | "summary"
  | "unknown";

const INTENT_PATTERNS: [Intent, RegExp][] = [
  ["compensation", /\b(salary|salaries|compensation|paid|pay rate|how much does .* (make|earn)|earns?)/i],
  ["capacity", /\b(accept|take on|new project|new client|staffing|capacity|bandwidth|overload|over-?allocat|stretched|hire|utili[sz]ation)/i],
  ["changes", /\b(changed|since last week|what'?s new|recent changes|this past week|week over week)/i],
  ["blocker", /\b(block|blocking|blocked|stuck|holding up|waiting on|next step|launch)/i],
  ["margin", /\b(margin|margins|profitab|unprofitable|losing money|over budget|budget)/i],
  ["expansion", /\b(expan|upsell|cross-sell|opportunit|grow the account|additional services|more work)/i],
  ["cash", /\b(invoice|invoices|overdue|cash|collect|receivable|owed|outstanding|payment)/i],
  ["renewals", /\b(renew|renewal|renewals|churn|cancel)/i],
  ["health", /\b(health|score|declin|drop|worse|deteriorat)/i],
  ["attention", /\b(attention|focus|worry|priorit|urgent|at risk|risks?)/i],
  ["revenue", /\b(revenue|earned|billing|billed|profit|p&l|operating)/i],
  ["summary", /\b(summar|tell me about|how is|how's|status|overview|what'?s going on|situation)/i],
];

export function classify(question: string): Intent {
  for (const [intent, re] of INTENT_PATTERNS) if (re.test(question)) return intent;
  return "unknown";
}

interface Ctx {
  ws: Workspace;
  req: AssistantRequest;
  ents: ResolvedEntities;
  scopeAccount?: Account;
  scopeProject?: Project;
}

const PROVIDER = { id: "simulated", label: "Simulated assistant (no AI service connected)", simulated: true };

function money(ws: Workspace, n: number | null | undefined) {
  return fmtMoney(n ?? null, ws.org.reportingCurrency);
}

function asOfLabel(ws: Workspace) {
  return `As of ${fmtDate(ws.org.demoDate)} (demo date)`;
}

function response(intent: string, ws: Workspace, parts: Partial<AssistantResponse>): AssistantResponse {
  const evidence = dedupe(parts.evidence ?? []);
  const notes = [...(parts.notes ?? [])];
  const instructionLike = evidence.some((e) => e.excerpt && looksLikeInstruction(e.excerpt));
  if (instructionLike) notes.push("A retrieved message contains instruction-like text. It was treated as data and ignored.");
  return {
    provider: PROVIDER,
    intent,
    scope: parts.scope ?? { kind: ws.caps.allAccounts ? "company" : "my_accounts", label: ws.caps.allAccounts ? "Company-wide" : "My accounts" },
    answer: parts.answer ?? [],
    figures: parts.figures ?? [],
    evidence,
    period: parts.period ?? asOfLabel(ws),
    notes: [...new Set(notes)],
    insufficient: parts.insufficient ?? false,
    followUps: parts.followUps ?? [],
  };
}

function dedupe(ev: AssistantEvidence[]): AssistantEvidence[] {
  const seen = new Set<string>();
  return ev.filter((e) => {
    const k = `${e.type}:${e.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const evAccount = (ws: Workspace, a: Account): AssistantEvidence => ({ type: "account", id: a.id, label: a.name, href: hrefFor({ type: "account", id: a.id }) });
const evProject = (p: Project): AssistantEvidence => ({ type: "project", id: p.id, label: p.name, href: hrefFor({ type: "project", id: p.id }) });
const evSignal = (s: Signal): AssistantEvidence => ({ type: "signal", id: s.id, label: `${CATEGORY_LABEL[s.category]}: ${s.summary}`, href: hrefFor({ type: "signal", id: s.id }) });
const evMessage = (ws: Workspace, e: Evidence): AssistantEvidence => ({ type: "message", id: e.messageId, label: `${e.author}, ${fmtDate(e.sentAt.slice(0, 10))}`, href: hrefFor({ type: "message", id: e.messageId }, ws.data), excerpt: e.excerpt });

function accountName(ws: Workspace, id?: ID) {
  return ws.data.accounts.find((a) => a.id === id)?.name ?? "an account you cannot access";
}
function personName(ws: Workspace, id?: ID) {
  return ws.data.people.find((p) => p.id === id)?.name ?? "Unassigned";
}

/* ------------------------------------------------------------------ */

function noAccess(ws: Workspace, what: string): AssistantResponse {
  return response("restricted", ws, {
    answer: [`I can't answer that with your current role (${ws.ctx.role.replace("_", " ")}). ${what}`],
    notes: ["Access is enforced before retrieval: restricted records are never sent to the assistant."],
    insufficient: true,
  });
}

function compensation(c: Ctx): AssistantResponse {
  const { ws, ents } = c;
  if (!ws.caps.viewCompensation || !ws.personCosts) return noAccess(ws, "Individual compensation is restricted to the Finance and Executive roles. I can share project-level cost aggregates instead.");
  const person = ents.people[0];
  if (!person) return response("compensation", ws, { answer: ["Which person do you mean? I couldn't match a name in your question."], insufficient: true });
  const pc = ws.personCosts[person.id];
  if (!pc || pc.hourlyCost === null) {
    return response("compensation", ws, { answer: [`There is no validated compensation record for ${person.name}, so I can't state their cost.`], notes: ["Missing compensation means project labor cost for this person is understated. Import the compensation dataset to fix it."], evidence: [{ type: "person", id: person.id, label: person.name, href: hrefFor({ type: "person", id: person.id }) }], insufficient: true });
  }
  return response("compensation", ws, {
    answer: [person.type === "contractor" ? `${person.name} is a contractor with an hourly cost of ${money(ws, pc.hourlyCost)}.` : `${person.name}'s loaded annual cost is ${money(ws, pc.annualLoaded)} (salary plus employer costs), which is ${money(ws, pc.hourlyCost)} per hour at ${ws.org.annualWorkingHours.toLocaleString()} working hours a year.`],
    figures: [
      { label: "Hourly labor cost", value: money(ws, pc.hourlyCost), kind: "calculated" },
      ...(pc.annualLoaded ? [{ label: "Annual loaded cost", value: money(ws, pc.annualLoaded), kind: "observed" as const }] : []),
      { label: "Effective from", value: fmtDate(pc.effectiveFrom ?? undefined), kind: "observed" },
    ],
    evidence: [{ type: "person", id: person.id, label: `${person.name} (restricted compensation record)`, href: hrefFor({ type: "person", id: person.id }) }],
    notes: ["Compensation data is restricted. Do not forward this answer to roles without access."],
  });
}

function parseNewWork(ws: Workspace, q: string) {
  const roleWords: [RegExp, string][] = [
    [/dev(elop(ment|er)s?)?|engineer(ing)?|build/i, ws.profile.id === "agency" ? "Developer" : "Engineer"],
    [/design(ers?)?|ux|ui/i, "Designer"],
    [/strateg(y|ist)|content|copy/i, "Strategist"],
    [/pm|project manag(er|ement)|product manag(er|ement)/i, ws.profile.id === "agency" ? "Project manager" : "Product manager"],
    [/analy(st|tics)/i, "Analyst"],
  ];
  const hoursByRole: Record<string, number> = {};
  const re = /(\d[\d,]*)\s*(?:hours?|hrs?|h)\s*(?:of\s+)?([a-z ]+?)(?=,| and|\.|\?|$| over| for| in)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const hours = Number(m[1].replace(/,/g, ""));
    const role = roleWords.find(([r]) => r.test(m![2]))?.[1];
    if (role && hours > 0) hoursByRole[role] = (hoursByRole[role] ?? 0) + hours;
  }
  // Also accept "200 developer hours" / "150 design hrs".
  const re2 = /(\d[\d,]*)\s+([a-z]+(?: [a-z]+)?)\s+(?:hours?|hrs?)\b/gi;
  while ((m = re2.exec(q))) {
    const hours = Number(m[1].replace(/,/g, ""));
    const role = roleWords.find(([r]) => r.test(m![2]))?.[1];
    if (role && hours > 0) hoursByRole[role] = (hoursByRole[role] ?? 0) + hours;
  }
  const weeksMatch = q.match(/(\d+)\s*weeks?/i);
  const weeks = weeksMatch ? Number(weeksMatch[1]) : 8;
  const startMatch = q.match(/(next month|in november|in december)/i);
  const startDate = startMatch ? (/december/i.test(startMatch[1]) ? "2026-12-07" : "2026-11-02") : addDays(ws.org.demoDate, 7);
  let assumed = false;
  if (!Object.keys(hoursByRole).length) {
    assumed = true;
    const deliveryRoles = [...new Set(ws.planning.people.filter((p) => !["Executive", "Finance", "Operations", "Account management", "Customer success", "Unit lead"].includes(p.role)).map((p) => p.role))];
    const defaults: Record<string, number> = { Developer: 160, Engineer: 160, Designer: 120, Strategist: 60, "Project manager": 60, "Product manager": 60, "Program manager": 60, Analyst: 80 };
    for (const r of deliveryRoles) hoursByRole[r] = defaults[r] ?? 60;
  }
  return { hoursByRole, weeks, startDate, assumed };
}

function capacity(c: Ctx): AssistantResponse {
  const { ws, req, scopeAccount } = c;
  const q = req.question;
  const scopeProjects = scopeAccount ? new Set(ws.data.projects.filter((p) => p.accountId === scopeAccount.id).map((p) => p.id)) : null;
  // In a client or project scope, only people working on that client's projects are relevant.
  const overloaded = ws.analysis.capacity.overallocated.filter((pc) => !scopeProjects || pc.projects.some((x) => scopeProjects.has(x.projectId)));
  const asksAccept = /accept|take on|new project|new client|room for/i.test(q);
  const ev: AssistantEvidence[] = overloaded.map((pc) => ({ type: "person" as const, id: pc.person.id, label: `${pc.person.name}: up to ${fmtPct(pc.upcoming.peakPct)} planned`, href: hrefFor({ type: "person", id: pc.person.id }) }));
  const notes: string[] = [];
  const missingTs = ws.analysis.capacity.missingTimesheets;
  if (missingTs.length) notes.push(`Timesheets are missing for ${missingTs.map((m) => `${personName(ws, m.personId)} (${m.weeks.length} week${m.weeks.length === 1 ? "" : "s"})`).join(", ")}, so actual hours are understated.`);

  if (!asksAccept) {
    const answer = overloaded.length
      ? [`${overloaded.length === 1 ? "One person is" : `${overloaded.length} people are`} planned above capacity in the next four weeks: ${overloaded.map((pc) => `${pc.person.name} (up to ${fmtPct(pc.upcoming.peakPct)} across ${pc.projects.length} projects)`).join("; ")}.`]
      : ["Nobody is planned above capacity in the next four weeks."];
    const util = ws.analysis.capacity.team.utilization;
    if (ws.profile.modules.billableUtilization && util !== null) answer.push(`Billable utilization for delivery staff was ${fmtPct(util)} in ${ws.analysis.period.label}, against a ${fmtPct(ws.org.billableUtilizationTarget ?? null)} target.`);
    const blocked = ws.data.tasks.filter((t) => t.status === "blocked" && overloaded.some((o) => o.person.id === t.assigneeId) && (!scopeProjects || scopeProjects.has(t.projectId)));
    if (scopeAccount && overloaded.length) notes.push(`Load counts all of their assigned work, including work for other ${ws.profile.terms.accounts.toLowerCase()}.`);
    if (blocked.length) answer.push(`${blocked.length} task${blocked.length === 1 ? " is" : "s are"} blocked waiting on them: ${blocked.map((t) => t.title).join(", ")}.`);
    return response("capacity", ws, {
      answer,
      figures: [
        ...(ws.profile.modules.billableUtilization ? [{ label: "Billable utilization (delivery staff)", value: fmtPct(util), kind: "calculated" as const }] : []),
        { label: "People over capacity (next 4 weeks)", value: String(overloaded.length), kind: "calculated" },
      ],
      evidence: [...ev, ...blocked.map((t) => ({ type: "task" as const, id: t.id, label: t.title, href: hrefFor({ type: "task", id: t.id }, ws.data) })), { type: "calculation", id: "utilization", label: "Utilization calculation", href: hrefFor({ type: "calculation", id: "utilization:team" }) }],
      period: `${ws.analysis.period.label} for utilization; next 4 weeks for planned load`,
      notes,
    });
  }

  const reqd = parseNewWork(ws, q);
  const result = assessNewWork(ws.planning as Dataset, reqd);
  const verdict = result.feasible === "yes" ? "Yes, current plans leave enough unassigned capacity" : result.feasible === "tight" ? "Possibly, but capacity is tight" : "Not without changes";
  const short = result.rows.filter((r) => r.shortfallPerWeek > 0.5);
  const answer = [
    `${verdict} for roughly ${Object.values(reqd.hoursByRole).reduce((a, b) => a + b, 0)} hours over ${reqd.weeks} weeks starting ${fmtDate(reqd.startDate)}.`,
    ...result.rows.map((r) => `${r.role}: needs about ${r.requestedPerWeek.toFixed(0)} h/week; ${r.freePerWeek.toFixed(0)} h/week is unassigned${r.shortfallPerWeek > 0.5 ? `, a shortfall of ${r.shortfallPerWeek.toFixed(0)} h/week` : ""}.`),
  ];
  if (short.length) answer.push(`To accept it you would need contractor support or to move existing work for ${short.map((s) => s.role.toLowerCase()).join(" and ")}.`);
  if (overloaded.length) answer.push(`Note that ${overloaded.map((o) => o.person.name).join(", ")} ${overloaded.length === 1 ? "is" : "are"} already over capacity; don't plan the new work on them.`);
  if (reqd.assumed) notes.push("Your question didn't specify hours by role, so I assumed a typical mix (shown above). Ask with specifics, for example \"200 hours of design and 300 hours of development over 10 weeks\".");
  notes.push(...result.notes);
  return response("capacity", ws, {
    answer,
    figures: result.rows.map((r) => ({ label: `${r.role} unassigned h/week`, value: r.freePerWeek.toFixed(0), kind: "calculated" as const })),
    evidence: [...ev, { type: "calculation", id: "capacity", label: "Team capacity view", href: "/team#capacity" }],
    period: `${reqd.weeks} weeks from ${fmtDate(reqd.startDate)}`,
    notes,
    followUps: ["Who is overloaded right now?", ...blockerFollowUp(ws, c.scopeAccount)],
  });
}

function changes(c: Ctx): AssistantResponse {
  const { ws, scopeAccount } = c;
  const items = ws.changes.items.filter((i) => !scopeAccount || i.accountId === scopeAccount.id);
  if (!items.length) return response("changes", ws, { answer: [`Nothing material changed between ${fmtDate(ws.changes.since)} and ${fmtDate(ws.changes.until)}${scopeAccount ? ` for ${scopeAccount.name}` : ""}.`], period: `${fmtDate(ws.changes.since)} – ${fmtDate(ws.changes.until)}` });
  const worse = items.filter((i) => i.direction === "worse");
  const better = items.filter((i) => i.direction === "better");
  const answer = [`${items.length} changes since ${fmtDate(ws.changes.since)}: ${worse.length} negative, ${better.length} positive.`];
  if (worse.length) answer.push(`Worse: ${worse.slice(0, 6).map((i) => i.title).join("; ")}.`);
  if (better.length) answer.push(`Better: ${better.slice(0, 5).map((i) => i.title).join("; ")}.`);
  const neutral = items.filter((i) => i.direction === "neutral");
  if (neutral.length) answer.push(`Also: ${neutral.slice(0, 3).map((i) => i.title).join("; ")}.`);
  return response("changes", ws, {
    answer,
    figures: [{ label: "Negative changes", value: String(worse.length), kind: "observed" }, { label: "Positive changes", value: String(better.length), kind: "observed" }],
    evidence: items.slice(0, 10).flatMap((i) => i.links.slice(0, 1).map((l) => ({ ...l, label: i.title, href: hrefFor(l, ws.data) }))),
    period: `${fmtDate(ws.changes.since)} – ${fmtDate(ws.changes.until)}`,
    notes: ["Changes are derived from dated records (messages, milestone changes, invoices, payments) and from recomputing health a week earlier."],
  });
}

function blockerProjects(c: Ctx): Project[] {
  const { ws, ents, scopeAccount, req } = c;
  if (ents.projects.length) return ents.projects;
  const pool = ws.data.projects.filter((p) => p.status !== "completed" && (!scopeAccount || p.accountId === scopeAccount.id) && (!ents.accounts.length || ents.accounts.some((a) => a.id === p.accountId)));
  const launchy = (p: Project) => (/launch/i.test(req.question) && /launch/i.test(p.name) ? 3 : 0);
  const blockedFirst = (ps: Project[]) =>
    ps
      .map((p) => ({ p, n: launchy(p) + ws.data.milestones.filter((m) => m.projectId === p.id && ["blocked", "awaiting_client", "late"].includes(ws.analysis.milestones[m.id]?.state ?? "")).length + ws.data.tasks.filter((t) => t.projectId === p.id && t.status === "blocked").length }))
      .filter((x) => x.n > launchy(x.p))
      .sort((a, b) => b.n - a.n)
      .map((x) => x.p);
  if (/launch/i.test(req.question)) {
    const launch = pool.filter((p) => /launch/i.test(p.name) || ws.data.milestones.some((m) => m.projectId === p.id && /launch|release|go-live|ga\b/i.test(m.name) && ws.analysis.milestones[m.id]?.state !== "done"));
    const b = blockedFirst(launch);
    if (b.length) return b.slice(0, 1);
  }
  return blockedFirst(pool).slice(0, scopeAccount || ents.accounts.length ? 2 : 3);
}

function blocker(c: Ctx): AssistantResponse {
  const { ws } = c;
  const projects = blockerProjects(c);
  if (!projects.length) return response("blocker", ws, { answer: [`I couldn't find a blocked or late ${ws.profile.terms.project.toLowerCase()} matching your question${c.scopeAccount ? ` for ${c.scopeAccount.name}` : ""}.`], insufficient: true, followUps: ["Which projects are behind schedule?"] });
  const answer: string[] = [];
  const evidence: AssistantEvidence[] = [];
  const figures: AssistantFigure[] = [];
  for (const p of projects) {
    const ms = ws.data.milestones.filter((m) => m.projectId === p.id && ["blocked", "awaiting_client", "late", "at_risk"].includes(ws.analysis.milestones[m.id]?.state ?? ""));
    const blockedTasks = ws.data.tasks.filter((t) => t.projectId === p.id && (t.status === "blocked" || (t.status !== "done" && t.due < ws.org.demoDate)));
    const primary = ms.find((m) => ws.analysis.milestones[m.id].state === "awaiting_client") ?? ms.find((m) => ws.analysis.milestones[m.id].state === "blocked") ?? ms[0];
    if (primary) {
      const st = ws.analysis.milestones[primary.id];
      const waiting = primary.awaitingClientSince ? ` and has been waiting since ${fmtDate(primary.awaitingClientSince)} (${daysBetween(primary.awaitingClientSince, ws.org.demoDate)} days)` : "";
      const stateLabel = st.state === "awaiting_client" ? (p.kind === "client" ? "waiting on the client" : "waiting on approval") : st.state.replace("_", " ");
      answer.push(`${p.name}: "${primary.name}" is ${stateLabel}${primary.blockedReason ? ` (${primary.blockedReason.charAt(0).toLowerCase()}${primary.blockedReason.slice(1)})` : ""}${waiting}. ${personName(ws, primary.ownerId)} owns the next step. Current due date ${fmtDate(st.due)}${st.slipDays > 0 ? `, ${st.slipDays} days later than originally planned` : ""}.`);
      evidence.push({ type: "milestone", id: primary.id, label: `${p.name}: ${primary.name}`, href: hrefFor({ type: "milestone", id: primary.id }, ws.data) });
      figures.push({ label: `${primary.name}: slip`, value: `${st.slipDays} days`, kind: "observed" });
    }
    const dependents = ws.data.tasks.filter((t) => t.projectId === p.id && t.dependsOn.some((d) => blockedTasks.some((b) => b.id === d)));
    for (const t of blockedTasks.slice(0, 3)) {
      answer.push(`Task "${t.title}" (${personName(ws, t.assigneeId)}) is ${t.status === "blocked" ? "blocked" : `overdue since ${fmtDate(t.due)}`}${t.blockerNote ? `: ${t.blockerNote}` : ""}.`);
      evidence.push({ type: "task", id: t.id, label: t.title, href: hrefFor({ type: "task", id: t.id }, ws.data) });
    }
    if (dependents.length) answer.push(`${dependents.length} dependent task${dependents.length === 1 ? "" : "s"} cannot start until then: ${dependents.map((d) => d.title).join(", ")}.`);
    for (const dep of p.dependsOn) {
      const d = ws.planning.projects.find((x) => x.id === dep);
      if (d) answer.push(`It also depends on "${d.name}", currently due ${fmtDate(d.currentEndDate)}.`);
    }
    const related = ws.analysis.signals.filter((s) => s.projectId === p.id && ["approval_delay", "dependency_risk", "missed_commitment"].includes(s.category) && !s.autoResolved);
    for (const s of related.slice(0, 2)) {
      evidence.push(evSignal(s));
      for (const e of s.evidence.slice(0, 2)) evidence.push(evMessage(ws, e));
    }
    evidence.push(evProject(p));
  }
  return response("blocker", ws, { answer, figures, evidence, notes: ["Owners come from milestone and task records in the project management source (simulated ClickUp)."] });
}

function margin(c: Ctx): AssistantResponse {
  const { ws, ents, scopeAccount } = c;
  if (!ws.caps.viewProjectCosts) return noAccess(ws, "Project costs and margins are not available to your role.");
  const fin = ws.analysis.projectFin;
  const projects = ws.data.projects.filter((p) => fin[p.id]);
  if (!ws.profile.modules.projectMargins) {
    const over = projects.filter((p) => (fin[p.id].budget.forecastVsBudget ?? 0) > 0).sort((a, b) => (fin[b.id].budget.forecastVsBudget ?? 0) - (fin[a.id].budget.forecastVsBudget ?? 0));
    return response("margin", ws, {
      answer: [
        `Client project margins don't apply to the ${ws.profile.label} profile; ${ws.profile.terms.projects.toLowerCase()} are tracked against cost budgets instead.`,
        over.length ? `${over.length} ${over.length === 1 ? "is" : "are"} forecast over budget: ${over.map((p) => `${p.name} (${money(ws, fin[p.id].budget.forecastVsBudget)} over a ${money(ws, p.budgetCost)} budget)`).join("; ")}.` : "None are forecast over budget.",
      ],
      figures: over.map((p) => ({ label: `${p.name} forecast vs budget`, value: money(ws, fin[p.id].budget.forecastVsBudget), kind: "calculated" as const })),
      evidence: over.map((p) => ({ type: "calculation" as const, id: `margin:${p.id}`, label: `${p.name} cost forecast`, href: hrefFor({ type: "calculation", id: `margin:${p.id}` }) })),
      notes: over.flatMap((p) => fin[p.id].missing).slice(0, 3),
    });
  }

  const focus = ents.projects.length ? ents.projects : scopeAccount ? projects.filter((p) => p.accountId === scopeAccount.id) : ents.accounts.length ? projects.filter((p) => ents.accounts.some((a) => a.id === p.accountId)) : null;
  if (focus && focus.length) {
    const answer: string[] = [];
    const figures: AssistantFigure[] = [];
    const notes: string[] = [];
    for (const p of focus.filter((x) => x.billing !== "internal")) {
      const f = fin[p.id];
      answer.push(`${p.name} is forecast at ${fmtPct(f.margin.forecastAtCompletion)} delivery margin at completion versus a ${fmtPct(f.margin.target)} target (${f.margin.variance !== null && f.margin.variance < 0 ? "below" : "meeting"} target). To date it has earned ${money(ws, f.revenue.earnedToDate)} against ${money(ws, f.cost.directToDate)} of direct cost (${fmtPct(f.margin.actualToDate)}).`);
      if (f.unbilled.items.length) answer.push(`Main drivers: ${f.unbilled.items.map((u) => `${u.label} (${fmtHours(u.hours)}, about ${money(ws, u.value)} at bill rates)`).join("; ")}.`);
      figures.push({ label: `${p.name} forecast margin`, value: fmtPct(f.margin.forecastAtCompletion), kind: "calculated" }, { label: `${p.name} forecast cost`, value: money(ws, f.cost.forecastTotal), kind: "calculated" });
      notes.push(...f.missing, f.revenue.basis);
    }
    return response("margin", ws, {
      answer: answer.length ? answer : ["Those are internal initiatives without revenue, so delivery margin doesn't apply."],
      figures,
      evidence: focus.map((p) => ({ type: "calculation" as const, id: `margin:${p.id}`, label: `${p.name}: margin calculation`, href: hrefFor({ type: "calculation", id: `margin:${p.id}` }) })),
      notes: [...new Set(notes)].slice(0, 5),
    });
  }

  const below = projects
    .filter((p) => p.status !== "completed" && fin[p.id].margin.variance !== null && (fin[p.id].margin.variance as number) < -0.01)
    .sort((a, b) => (fin[a.id].margin.variance as number) - (fin[b.id].margin.variance as number));
  const answer = below.length
    ? [`${below.length} active project${below.length === 1 ? " is" : "s are"} forecast to miss ${below.length === 1 ? "its" : "their"} margin target:`, ...below.map((p) => {
        const f = fin[p.id];
        const driver = f.unbilled.items[0]?.label;
        return `${p.name} (${accountName(ws, p.accountId)}): ${fmtPct(f.margin.forecastAtCompletion)} forecast vs ${fmtPct(f.margin.target)} target${driver ? `; main driver: ${driver.charAt(0).toLowerCase()}${driver.slice(1)}` : ""}.`;
      })]
    : ["No active projects are forecast below their margin targets."];
  const incomplete = projects.filter((p) => fin[p.id].missing.some((m) => m.includes("no labor cost rate")));
  const notes = ["Delivery margin = (revenue − direct delivery costs) ÷ revenue. It excludes overhead and is not company net profit."];
  if (incomplete.length) notes.push(`Cost data is incomplete for ${incomplete.map((p) => p.name).join(", ")} (hours without a cost rate), so those margins are overstated.`);
  return response("margin", ws, {
    answer,
    figures: below.map((p) => ({ label: p.name, value: `${fmtPct(fin[p.id].margin.forecastAtCompletion)} vs ${fmtPct(fin[p.id].margin.target)}`, kind: "calculated" as const })),
    evidence: below.map((p) => ({ type: "calculation" as const, id: `margin:${p.id}`, label: `${p.name}: margin calculation`, href: hrefFor({ type: "calculation", id: `margin:${p.id}` }) })),
    notes,
    followUps: below[0] ? [`Why is ${below[0].name} unprofitable?`] : [],
  });
}

function expansion(c: Ctx): AssistantResponse {
  const { ws, scopeAccount, ents } = c;
  if (!ws.profile.modules.expansion) return response("expansion", ws, { answer: [`Expansion opportunities aren't tracked in the ${ws.profile.label} profile, because business units are internal.`], insufficient: true });
  let opps: Opportunity[] = ws.analysis.opportunities.filter((o) => o.status !== "dismissed");
  if (scopeAccount) opps = opps.filter((o) => o.accountId === scopeAccount.id);
  else if (ents.accounts.length) opps = opps.filter((o) => ents.accounts.some((a) => a.id === o.accountId));
  if (!opps.length) return response("expansion", ws, { answer: [`I don't see evidence-backed expansion opportunities${scopeAccount ? ` for ${scopeAccount.name}` : ""} in the authorized communications.`], notes: ["Opportunities are only raised when a client explicitly expresses a need. Absence of evidence is not evidence of no opportunity."] });
  const rank = { ready: 0, developing: 1, early: 2 };
  opps.sort((a, b) => rank[a.readiness] - rank[b.readiness]);
  const answer = [`${opps.length} opportunit${opps.length === 1 ? "y has" : "ies have"} supporting evidence. Most credible first:`];
  for (const o of opps) answer.push(`${accountName(ws, o.accountId)}: ${o.offering}. Readiness ${o.readiness} (${o.readinessReason.replace(/^\w+: /, "")}). Client said: “${o.need}” Next step: ${o.nextStep.replace(/\.?$/, ".")}${o.estimatedValue ? ` Manual estimate ${money(ws, o.estimatedValue)} by ${personName(ws, o.estimatedBy)}.` : ""}`);
  return response("expansion", ws, {
    answer,
    figures: opps.filter((o) => o.estimatedValue).map((o) => ({ label: `${accountName(ws, o.accountId)} (manual estimate)`, value: money(ws, o.estimatedValue), kind: "estimate" as const })),
    evidence: opps.flatMap((o) => [{ type: "opportunity" as const, id: o.id, label: `${accountName(ws, o.accountId)}: ${o.offering}`, href: hrefFor({ type: "opportunity", id: o.id }) }, ...o.evidence.slice(0, 2).map((e) => evMessage(ws, e))]),
    notes: ["Estimated values are entered manually and are never counted as committed revenue or included in forecasts."],
  });
}

function cash(c: Ctx): AssistantResponse {
  const { ws, scopeAccount, ents } = c;
  if (!ws.profile.modules.invoices) return response("cash", ws, { answer: [`Invoices and cash forecasting aren't part of the ${ws.profile.label} profile.`], insufficient: true });
  if (!ws.caps.viewCommercialTerms) return noAccess(ws, "Invoice amounts and cash are restricted to Finance, Executive and account owners (for their own accounts).");
  let overdue = ws.analysis.receivables.overdue;
  const filterAcct = scopeAccount ? [scopeAccount.id] : ents.accounts.map((a) => a.id);
  if (filterAcct.length) overdue = overdue.filter((s) => filterAcct.includes(s.invoice.accountId));
  // A client-scoped answer stays on that client's invoices; the company cash outlook is a different scope.
  const cf = scopeAccount ? null : ws.finance?.cash ?? null;
  const excludedIds = new Set(cf?.excluded.map((e) => e.invoiceId) ?? []);
  const ranked = [...overdue].sort((a, b) => b.outstanding * (1 + b.daysOverdue / 30) - a.outstanding * (1 + a.daysOverdue / 30));
  const total = overdue.reduce((s, x) => s + x.outstanding, 0);
  const answer: string[] = [];
  if (!overdue.length) answer.push(`There are no overdue invoices${filterAcct.length ? " for that account" : ""}.`);
  else {
    answer.push(`${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} total ${money(ws, total)}. Ranked by effect on cash (amount weighted by age):`);
    for (const s of ranked.slice(0, 5)) answer.push(`${s.invoice.number}, ${accountName(ws, s.invoice.accountId)}: ${money(ws, s.outstanding)}, ${s.daysOverdue} days overdue${excludedIds.has(s.invoice.id) ? "; excluded from the base-case forecast until a payment date is confirmed" : cf ? "; included in the forecast at the client's observed payment timing" : ""}.`);
  }
  if (cf) {
    const excludedTotal = cf.excluded.reduce((s, e) => s + e.amount, 0);
    answer.push(`Cash outlook: opening ${money(ws, cf.opening.amount)}; the 13-week base case bottoms out at ${money(ws, cf.lowPoint.closing)} in the week of ${fmtDate(cf.lowPoint.weekStart)}.${excludedTotal > 0 ? ` Collecting the excluded ${money(ws, excludedTotal)} would raise that low point to ${money(ws, cf.lowPoint.closing + excludedTotal)}.` : ""}`);
  } else if (!scopeAccount) answer.push("Company cash forecasting is only available to Finance and Executive roles.");
  return response("cash", ws, {
    answer,
    figures: [
      { label: "Overdue total", value: money(ws, total), kind: "calculated" },
      ...(cf ? [{ label: "13-week low point", value: money(ws, cf.lowPoint.closing), kind: "calculated" as const }, { label: "Opening cash (bank balance)", value: money(ws, cf.opening.amount), kind: "observed" as const }] : []),
    ],
    evidence: [...ranked.slice(0, 5).map((s) => ({ type: "invoice" as const, id: s.invoice.id, label: `${s.invoice.number} (${accountName(ws, s.invoice.accountId)})`, href: hrefFor({ type: "invoice", id: s.invoice.id }) })), ...(cf ? [{ type: "calculation" as const, id: "cash:forecast", label: "Cash forecast and assumptions", href: hrefFor({ type: "calculation", id: "cash:forecast" }) }] : [])],
    notes: [...(cf?.notes ?? []), ...ws.sources.filter((x) => x.affects.some((a) => /receivable|cash/i.test(a))).map((x) => x.summary)],
  });
}

function renewals(c: Ctx): AssistantResponse {
  const { ws, scopeAccount } = c;
  const list = ws.analysis.renewals.filter((r) => (!scopeAccount || r.accountId === scopeAccount.id) && daysBetween(ws.org.demoDate, r.renewalDate) <= 150);
  if (!list.length) return response("renewals", ws, { answer: ["No renewals fall in the next five months."] });
  const answer = [`${list.length} renewal${list.length === 1 ? "" : "s"} in the next five months:`];
  const evidence: AssistantEvidence[] = [];
  for (const r of list) {
    const risk = ws.analysis.signals.find((s) => s.accountId === r.accountId && s.category === "renewal_risk" && !s.autoResolved && s.review.status !== "dismissed");
    const h = ws.analysis.health[r.accountId];
    answer.push(`${accountName(ws, r.accountId)}, ${r.name}: renews ${fmtDate(r.renewalDate)}${r.noticeDate ? ` (notice by ${fmtDate(r.noticeDate)})` : ""}${r.annualValue !== null ? `, ${money(ws, r.annualValue)} a year` : ""}. Health ${h?.score ?? "n/a"}${risk ? `; renewal risk ${risk.severity}, ${risk.confidence} confidence: ${risk.evidence.length} supporting messages` : ""}.`);
    if (risk) evidence.push(evSignal(risk), ...risk.evidence.slice(0, 3).map((e) => evMessage(ws, e)));
    const a = ws.data.accounts.find((x) => x.id === r.accountId);
    if (a) evidence.push(evAccount(ws, a));
  }
  return response("renewals", ws, { answer, evidence, figures: list.filter((r) => r.annualValue !== null).map((r) => ({ label: `${accountName(ws, r.accountId)} annual contract value`, value: money(ws, r.annualValue), kind: "observed" as const })), notes: ["Renewal risk is inferred from conversation evidence; it is not a statistically validated churn probability."] });
}

function health(c: Ctx): AssistantResponse {
  const { ws, ents, scopeAccount } = c;
  let account = scopeAccount ?? ents.accounts[0];
  let picked = false;
  if (!account) {
    const ranked = ws.data.accounts.map((a) => ({ a, d: (ws.analysis.health[a.id]?.score ?? 0) - (ws.analysis.healthPrev[a.id] ?? ws.analysis.health[a.id]?.score ?? 0) })).sort((x, y) => x.d - y.d);
    if (!ranked.length || ranked[0].d >= 0) return response("health", ws, { answer: ["No account's health has declined over the last 30 days."] });
    account = ranked[0].a;
    picked = true;
  }
  const h = ws.analysis.health[account.id];
  const prev = ws.analysis.healthPrev[account.id];
  if (!h) return response("health", ws, { answer: ["I can't see health for that account."], insufficient: true });
  const delta = h.score !== null && prev !== null ? h.score - prev : null;
  const answer: string[] = [];
  if (picked) answer.push(`You didn't name an account, so I picked the largest decline.`);
  if (h.status === "insufficient") answer.push(`There isn't enough current information to judge ${account.name}'s health reliably. ${h.dataGaps.join("; ")}. I'm not treating missing data as healthy.`);
  if (delta !== null && delta < 0) answer.push(`${account.name}'s health is ${h.score}/100, down ${-delta} points from ${prev} thirty days ago.`);
  else if (delta !== null) answer.push(`${account.name}'s health hasn't declined: it is ${h.score}/100 compared with ${prev} thirty days ago.`);
  else answer.push(`${account.name}'s health is ${h.score ?? "not available"}${h.score !== null ? "/100" : ""}; there is no comparison point from 30 days ago.`);
  const negatives = h.components.flatMap((comp) => comp.factors.map((f) => ({ ...f, comp: comp.label }))).filter((f) => f.effect < 0).sort((a, b) => a.effect - b.effect);
  if (negatives.length) answer.push(`Main drivers: ${negatives.slice(0, 4).map((f) => `${f.label} [${f.kind}, ${f.effect} pts]`).join("; ")}.`);
  const positives = h.components.flatMap((comp) => comp.factors).filter((f) => f.effect > 0);
  if (positives.length) answer.push(`Working in its favour: ${positives.slice(0, 2).map((f) => f.label).join("; ")}.`);
  const sigs = ws.analysis.signals.filter((s) => s.accountId === account!.id && !s.autoResolved && s.polarity === "risk").slice(0, 3);
  const resolved = ws.analysis.signals.filter((s) => s.accountId === account!.id && s.autoResolved);
  if (resolved.length) answer.push(`An earlier issue was resolved and no longer counts against the score: ${resolved.map((s) => CATEGORY_LABEL[s.category].toLowerCase()).join(", ")}.`);
  return response("health", ws, {
    answer,
    figures: [{ label: "Health now", value: h.score === null ? "n/a" : `${h.score}/100`, kind: "calculated" }, { label: "30 days ago", value: prev === null ? "n/a" : `${prev}/100`, kind: "calculated" }, ...h.components.map((comp) => ({ label: `${comp.label} (${Math.round(comp.weight * 100)}%)`, value: comp.score === null ? "insufficient data" : String(comp.score), kind: "calculated" as const }))],
    evidence: [evAccount(ws, account), { type: "calculation", id: `health:${account.id}`, label: "Health score breakdown", href: hrefFor({ type: "calculation", id: `health:${account.id}` }) }, ...sigs.flatMap((s) => [evSignal(s), ...s.evidence.slice(0, 2).map((e) => evMessage(ws, e))])],
    period: `30 days to ${fmtDate(ws.org.demoDate)}`,
    notes: [...h.dataGaps, "Health weights: " + h.components.map((comp) => `${comp.label} ${Math.round(comp.weight * 100)}%`).join(", ") + ". Inferred factors come from conversation analysis."],
    insufficient: h.status === "insufficient",
  });
}

function attention(c: Ctx): AssistantResponse {
  const { ws, scopeAccount, req } = c;
  const weekEnd = addDays(ws.org.demoDate, 7);
  let items = ws.analysis.attention.filter((i) => !scopeAccount || i.accountId === scopeAccount.id);
  const projectFocus = /project|initiative|delivery/i.test(req.question) && !/account|client|customer/i.test(req.question);
  if (projectFocus) items = items.filter((i) => i.projectId);
  const accountFocus = /account|client|customer|business unit/i.test(req.question) && !scopeAccount;
  if (!items.length) return response("attention", ws, { answer: [scopeAccount ? `Nothing currently needs attention for ${scopeAccount.name}.` : "Nothing currently needs attention in your scope."] });
  const answer: string[] = [];
  const evidence: AssistantEvidence[] = [];
  if (accountFocus) {
    const byAccount = new Map<ID, typeof items>();
    for (const i of items) if (i.accountId) byAccount.set(i.accountId, [...(byAccount.get(i.accountId) ?? []), i]);
    const ranked = [...byAccount.entries()].map(([id, xs]) => ({ id, xs, score: xs.reduce((s, x) => s + x.score, 0), dueSoon: xs.some((x) => x.dueDate <= weekEnd) })).filter((x) => x.dueSoon).sort((a, b) => b.score - a.score).slice(0, 5);
    answer.push(`${ranked.length} ${ranked.length === 1 ? ws.profile.terms.account.toLowerCase() : ws.profile.terms.accounts.toLowerCase()} need attention this week:`);
    for (const r of ranked) {
      const h = ws.analysis.health[r.id];
      answer.push(`${accountName(ws, r.id)} (health ${h?.score ?? "n/a"}${h?.status === "insufficient" ? ", insufficient data" : ""}): ${r.xs.slice(0, 2).map((x) => x.title.replace(`${accountName(ws, r.id)} `, "")).join("; ")}. Next: ${r.xs[0].next}`);
      const a = ws.data.accounts.find((x) => x.id === r.id);
      if (a) evidence.push(evAccount(ws, a));
      for (const x of r.xs.slice(0, 2)) for (const l of x.links.slice(0, 2)) evidence.push({ ...l, label: x.title, href: hrefFor(l, ws.data) });
    }
  } else {
    const top = items.slice(0, 6);
    answer.push(`The ${top.length} most important items${scopeAccount ? ` for ${scopeAccount.name}` : ""}, by severity and impact:`);
    for (const i of top) {
      answer.push(`${i.severity.toUpperCase()}: ${i.title}. Why: ${i.why} Next: ${i.next} Owner ${personName(ws, i.ownerId)}, by ${fmtDate(i.dueDate)}.`);
      for (const l of i.links.slice(0, 2)) evidence.push({ ...l, label: i.title, href: hrefFor(l, ws.data) });
    }
  }
  // Caveats and suggestions stay inside the scope of the question.
  const insufficient = ws.data.accounts.filter((a) => ws.analysis.health[a.id]?.status === "insufficient" && (!scopeAccount || a.id === scopeAccount.id));
  const declining = ws.data.accounts
    .filter((a) => !scopeAccount || a.id === scopeAccount.id)
    .map((a) => ({ a, d: (ws.analysis.health[a.id]?.score ?? 0) - (ws.analysis.healthPrev[a.id] ?? ws.analysis.health[a.id]?.score ?? 0) }))
    .filter((x) => x.d < 0)
    .sort((x, y) => x.d - y.d)[0]?.a;
  const followUps = [
    ...(declining ? [`Why did ${declining.name}'s health decline?`] : []),
    ...(ws.caps.viewCommercialTerms && ws.profile.modules.invoices && ws.analysis.receivables.overdue.some((r) => !scopeAccount || r.invoice.accountId === scopeAccount.id) ? [scopeAccount ? "Are there overdue invoices?" : "Which overdue invoices most affect our cash outlook?"] : []),
    ...blockerFollowUp(ws, scopeAccount),
  ].slice(0, 3);
  return response("attention", ws, {
    answer,
    figures: [{ label: "Open attention items", value: String(items.length), kind: "calculated" }, { label: "Critical or high", value: String(items.filter((i) => i.severity === "critical" || i.severity === "high").length), kind: "calculated" }],
    evidence,
    period: `${asOfLabel(ws)}; actions due by ${fmtDate(weekEnd)}`,
    notes: [
      ...insufficient.map((a) => `${a.name} has insufficient current data; absence of problems there is not evidence of health.`),
      "Priority combines severity, financial impact and due date. Suggested due dates and next steps are generated by CompanyOS rules.",
    ],
    followUps,
  });
}

function revenue(c: Ctx): AssistantResponse {
  const { ws } = c;
  const f = ws.finance;
  if (!f) return noAccess(ws, "Financial results are restricted to Finance, Executive and account owners (own accounts).");
  const s = f.summary;
  const answer: string[] = [];
  if (ws.profile.modules.financeMode === "budget") {
    return response("revenue", ws, { answer: [`The ${ws.profile.label} profile tracks budgets rather than revenue. Payroll for ${s.period.label} was ${money(ws, s.payroll)}; see initiative budgets for forecast versus approved spend.`], period: s.period.label });
  }
  answer.push(`${s.period.label}: earned revenue ${money(ws, s.earnedRevenue)}, invoiced ${money(ws, s.invoiced)}, collected ${money(ws, s.collected)}. These are different measures: revenue is recognized as work is delivered; invoicing and collection follow billing terms.`);
  if (ws.profile.modules.projectMargins) answer.push(`Delivery margin on client work was ${fmtPct(s.deliveryMargin)} (${money(ws, s.deliveryProfit)} after direct delivery costs of ${money(ws, s.clientDirectCost)}).`);
  if (f.scope === "company") answer.push(`After all payroll, internal costs and overhead, the simplified operating result was ${money(ws, s.operatingResult)}. That is not audited net profit.`);
  else answer.push("This covers only your accounts. Company payroll, overhead and operating result are restricted to Finance and Executive roles.");
  return response("revenue", ws, {
    answer,
    figures: [
      { label: "Earned revenue", value: money(ws, s.earnedRevenue), kind: "calculated" },
      { label: "Invoiced", value: money(ws, s.invoiced), kind: "observed" },
      { label: "Collected", value: money(ws, s.collected), kind: "observed" },
      ...(ws.profile.modules.projectMargins ? [{ label: "Delivery margin", value: fmtPct(s.deliveryMargin), kind: "calculated" as const }] : []),
      ...(f.scope === "company" ? [{ label: "Operating result (simplified)", value: money(ws, s.operatingResult), kind: "calculated" as const }] : []),
    ],
    evidence: [{ type: "calculation", id: "finance", label: "Finance overview", href: "/finance" }],
    period: s.period.label,
    notes: s.missing,
  });
}

function summary(c: Ctx, account: Account): AssistantResponse {
  const { ws } = c;
  const h = ws.analysis.health[account.id];
  const projects = ws.data.projects.filter((p) => p.accountId === account.id);
  const fin = ws.analysis.projectFin;
  const answer: string[] = [];
  if (h?.status === "insufficient") answer.push(`There isn't enough current information to judge ${account.name} reliably. The computed score of ${h.score ?? "n/a"}/100 is low-confidence and should not be read as healthy. Owner ${personName(ws, account.ownerId)}.`);
  else {
    const statusWord = h?.status === "at_risk" ? "at risk" : h?.status === "watch" ? "on watch" : "healthy";
    answer.push(`${account.name} is ${statusWord}: health ${h?.score ?? "n/a"}/100. Owner ${personName(ws, account.ownerId)}.`);
  }
  if (h?.dataGaps.length) answer.push(`Information gaps: ${h.dataGaps.join("; ")}.`);
  for (const p of projects) {
    const f = fin[p.id];
    const ms = ws.data.milestones.filter((m) => m.projectId === p.id && ws.analysis.milestones[m.id]?.state !== "done");
    const worst = ms.find((m) => ["late", "blocked", "awaiting_client"].includes(ws.analysis.milestones[m.id].state));
    answer.push(`${p.name} (${p.status}${p.billing !== "internal" ? `, ${p.billing.replace("_", " ")}` : ""}): ${worst ? `"${worst.name}" is ${ws.analysis.milestones[worst.id].state.replace("_", " ")}` : ms[0] ? `next milestone "${ms[0].name}" due ${fmtDate(ws.analysis.milestones[ms[0].id].due)}` : "no open milestones"}${f && f.margin.forecastAtCompletion !== null ? `; forecast margin ${fmtPct(f.margin.forecastAtCompletion)} vs ${fmtPct(f.margin.target)}` : ""}.`);
  }
  const open = ws.analysis.receivables.open.filter((s) => s.invoice.accountId === account.id);
  if (open.length) answer.push(`Receivables: ${money(ws, open.reduce((s, x) => s + x.outstanding, 0))} outstanding, ${money(ws, open.filter((x) => x.daysOverdue > 0).reduce((s, x) => s + x.outstanding, 0))} overdue.`);
  const sigs = ws.analysis.signals.filter((s) => s.accountId === account.id && !s.autoResolved && s.review.status !== "dismissed");
  if (sigs.length) answer.push(`Signals: ${sigs.slice(0, 4).map((s) => `${CATEGORY_LABEL[s.category]} (${s.severity})`).join(", ")}.`);
  const opp = ws.analysis.opportunities.find((o) => o.accountId === account.id);
  if (opp) answer.push(`Opportunity: ${opp.offering} (${opp.readiness}).`);
  const instr = ws.data.threads.filter((t) => t.accountId === account.id).flatMap((t) => t.messages).filter((m) => looksLikeInstruction(m.body));
  const notes = instr.length ? [`${instr.length} message(s) from this account contain instruction-like text (for example asking an AI to report the account as healthy). They were treated as data and ignored.`] : [];
  return response("summary", ws, {
    answer,
    figures: [{ label: "Health", value: h?.score === null || !h ? "n/a" : `${h.score}/100`, kind: "calculated" }, ...(open.length ? [{ label: "Outstanding", value: money(ws, open.reduce((s, x) => s + x.outstanding, 0)), kind: "observed" as const }] : [])],
    evidence: [evAccount(ws, account), ...projects.map(evProject), ...sigs.slice(0, 3).map(evSignal), ...instr.map((m) => ({ type: "message" as const, id: m.id, label: `${m.author} (flagged as instruction-like)`, href: hrefFor({ type: "message", id: m.id }, ws.data) }))],
    notes,
    insufficient: h?.status === "insufficient",
  });
}


/** A follow-up about the most blocked work, only when it exists inside the scope. */
function blockerFollowUp(ws: Workspace, scopeAccount?: Account): string[] {
  const p = ws.data.projects.find((x) => x.status !== "completed" && (!scopeAccount || x.accountId === scopeAccount.id) && ws.data.milestones.some((m) => m.projectId === x.id && ["blocked", "awaiting_client"].includes(ws.analysis.milestones[m.id]?.state ?? "")));
  return p ? [`What is blocking ${p.name}?`] : [];
}

function projectSummary(c: Ctx, p: Project): AssistantResponse {
  const { ws } = c;
  const f = ws.analysis.projectFin[p.id];
  const ms = ws.data.milestones.filter((m) => m.projectId === p.id && ws.analysis.milestones[m.id]?.state !== "done").sort((a, b) => (ws.analysis.milestones[a.id].due < ws.analysis.milestones[b.id].due ? -1 : 1));
  const worst = ms.find((m) => ["late", "blocked", "awaiting_client"].includes(ws.analysis.milestones[m.id].state));
  const blocked = ws.data.tasks.filter((t) => t.projectId === p.id && t.status === "blocked");
  const answer = [`${p.name} is ${p.status.replace("_", " ")}, owned by ${personName(ws, p.ownerId)}, due to finish ${fmtDate(p.currentEndDate)}${p.currentEndDate !== p.originalEndDate ? ` (originally ${fmtDate(p.originalEndDate)})` : ""}.`];
  if (worst) answer.push(`"${worst.name}" is ${ws.analysis.milestones[worst.id].state.replace("_", " ")}${worst.blockedReason ? `: ${worst.blockedReason}` : ""}. ${personName(ws, worst.ownerId)} owns the next step.`);
  else if (ms[0]) answer.push(`Next milestone: "${ms[0].name}" due ${fmtDate(ws.analysis.milestones[ms[0].id].due)}.`);
  if (blocked.length) answer.push(`${blocked.length} blocked task${blocked.length === 1 ? "" : "s"}: ${blocked.map((t) => `${t.title} (${personName(ws, t.assigneeId)})`).join("; ")}.`);
  if (f && f.margin.forecastAtCompletion !== null) answer.push(`Forecast delivery margin at completion is ${fmtPct(f.margin.forecastAtCompletion)} against a ${fmtPct(f.margin.target)} target.`);
  return response("summary", ws, {
    answer,
    figures: f && f.margin.forecastAtCompletion !== null ? [{ label: "Forecast margin", value: fmtPct(f.margin.forecastAtCompletion), kind: "calculated" }] : [],
    evidence: [evProject(p), ...(worst ? [{ type: "milestone" as const, id: worst.id, label: worst.name, href: hrefFor({ type: "milestone", id: worst.id }, ws.data) }] : []), ...blocked.map((t) => ({ type: "task" as const, id: t.id, label: t.title, href: hrefFor({ type: "task", id: t.id }, ws.data) }))],
    notes: f?.missing.slice(0, 3) ?? [],
    followUps: [...(f ? [`Why is ${p.name} forecast at this margin?`] : []), `What is blocking ${p.name}?`],
  });
}

/** Which account a piece of evidence belongs to, when it belongs to one. */
function evidenceAccount(ws: Workspace, e: AssistantEvidence): ID | null | undefined {
  switch (e.type) {
    case "account":
      return e.id;
    case "project":
      return ws.data.projects.find((p) => p.id === e.id)?.accountId ?? null;
    case "milestone": {
      const m = ws.data.milestones.find((x) => x.id === e.id);
      return m ? ws.data.projects.find((p) => p.id === m.projectId)?.accountId ?? null : null;
    }
    case "task": {
      const t = ws.data.tasks.find((x) => x.id === e.id);
      return t ? ws.data.projects.find((p) => p.id === t.projectId)?.accountId ?? null : null;
    }
    case "invoice":
      return ws.data.invoices.find((i) => i.id === e.id)?.accountId ?? null;
    case "signal":
      return ws.analysis.signals.find((s) => s.id === e.id)?.accountId ?? null;
    case "opportunity":
      return ws.analysis.opportunities.find((o) => o.id === e.id)?.accountId ?? null;
    case "thread":
      return ws.data.threads.find((t) => t.id === e.id)?.accountId ?? null;
    case "message":
      return ws.data.threads.find((t) => t.messages.some((m) => m.id === e.id))?.accountId ?? null;
    case "calculation": {
      const [kind, id] = e.id.split(":");
      if (kind === "health") return id;
      if (kind === "margin") return ws.data.projects.find((p) => p.id === id)?.accountId ?? null;
      return null;
    }
    default:
      return undefined; // people and other non-account records
  }
}

/**
 * Final guard for scoped conversations: nothing about another account (in the
 * answer, figures, evidence, caveats or suggested follow-ups) leaves a client-
 * or project-scoped answer, whichever intent produced it.
 */
function enforceScope(r: AssistantResponse, c: Ctx): AssistantResponse {
  const { ws, scopeAccount, scopeProject } = c;
  if (!scopeAccount) return scopeProject ? { ...r, scope: { kind: "project", label: "This project", name: scopeProject.name } } : r;
  const others = [...ws.data.accounts.filter((a) => a.id !== scopeAccount.id).map((a) => a.name), ...ws.data.projects.filter((p) => p.accountId && p.accountId !== scopeAccount.id).map((p) => p.name)];
  const mentionsOther = (t: string) => others.some((n) => t.includes(n));
  const inScope = (e: AssistantEvidence) => {
    const acc = evidenceAccount(ws, e);
    if (acc === undefined) return true;
    if (acc !== scopeAccount.id) return false;
    if (scopeProject && e.type === "project") return e.id === scopeProject.id;
    return true;
  };
  return {
    ...r,
    scope: scopeProject ? { kind: "project", label: "This project", name: scopeProject.name } : { kind: "account", label: `This ${ws.profile.terms.account.toLowerCase()}`, name: scopeAccount.name },
    answer: r.answer.filter((p) => !mentionsOther(p)),
    figures: r.figures.filter((f) => !mentionsOther(f.label)),
    evidence: r.evidence.filter((e) => inScope(e) && !mentionsOther(e.label)),
    notes: r.notes.filter((n) => !mentionsOther(n)),
    followUps: r.followUps.filter((f) => !mentionsOther(f)),
  };
}

/* ------------------------------------------------------------------ */

export function answerQuestion(ws: Workspace, req: AssistantRequest): AssistantResponse {
  const question = req.question.trim().slice(0, 600);
  if (!question) return response("empty", ws, { answer: ["Ask a question about your accounts, projects, finances or team."], insufficient: true });
  const scopeProject = req.scope?.projectId ? ws.data.projects.find((p) => p.id === req.scope!.projectId) : undefined;
  if (req.scope?.projectId && !scopeProject) return noAccess(ws, `You don't have access to this ${ws.profile.terms.project.toLowerCase()}.`);
  const scopeAccountId = req.scope?.accountId ?? scopeProject?.accountId;
  const scopeAccount = scopeAccountId ? ws.data.accounts.find((a) => a.id === scopeAccountId) : undefined;
  if (req.scope?.accountId && !scopeAccount) return noAccess(ws, "You don't have access to this account.");
  const raw = resolveEntities(ws, question);
  const ents: ResolvedEntities = scopeProject && !raw.projects.length ? { ...raw, projects: [scopeProject] } : raw;
  const ctx: Ctx = { ws, req: { ...req, question }, ents, scopeAccount, scopeProject };
  if (scopeAccount && ents.accounts.some((a) => a.id !== scopeAccount.id)) {
    return enforceScope(response("out_of_scope", ws, { answer: [`This conversation is limited to ${scopeProject ? scopeProject.name : scopeAccount.name}. Open the assistant from the header to ask about other ${ws.profile.terms.accounts.toLowerCase()}.`], insufficient: true }), ctx);
  }
  const intent = classify(question);
  if (ents.unmatchedAccountHint && intent !== "capacity" && intent !== "compensation") {
    return enforceScope(
      response("not_found", ws, {
        answer: ["I couldn't find a record you have access to that matches the name in your question, so I can't answer it without guessing."],
        notes: ["The assistant only sees records your role is allowed to read."],
        insufficient: true,
        followUps: [scopeAccount ? "What are the main risks right now?" : "Which accounts need attention this week?"],
      }),
      ctx,
    );
  }
  return enforceScope(route(ctx, intent), ctx);
}

function route(ctx: Ctx, intent: Intent): AssistantResponse {
  const { ws, ents, scopeAccount, scopeProject } = ctx;
  switch (intent) {
    case "compensation":
      return compensation(ctx);
    case "capacity":
      return capacity(ctx);
    case "changes":
      return changes(ctx);
    case "blocker":
      return blocker(ctx);
    case "margin":
      return margin(ctx);
    case "expansion":
      return expansion(ctx);
    case "cash":
      return cash(ctx);
    case "renewals":
      return renewals(ctx);
    case "health":
      return health(ctx);
    case "attention":
      return attention(ctx);
    case "revenue":
      return revenue(ctx);
    case "summary":
    case "unknown": {
      if (scopeProject) return projectSummary(ctx, scopeProject);
      const account = scopeAccount ?? ents.accounts[0];
      if (account) return summary(ctx, account);
      if (ents.projects[0]) return blocker({ ...ctx, ents: { ...ents, projects: [ents.projects[0]] } });
      return response("unknown", ws, {
        answer: ["I don't have enough information to answer that from the records available to me. I can answer questions about account health, attention items, delivery blockers, margins, invoices and cash, capacity, renewals, opportunities and recent changes."],
        insufficient: true,
        followUps: ["Which accounts need attention this week, and why?", ...(ws.caps.viewProjectCosts ? ["Which projects are forecast to miss their margin targets?"] : []), "What changed since last week?"],
      });
    }
  }
}

export const simulatedProvider: AssistantProvider = {
  id: PROVIDER.id,
  label: PROVIDER.label,
  simulated: true,
  available: () => true,
  async answer(req, ctx) {
    return answerQuestion(ctx as Workspace, req);
  },
};
