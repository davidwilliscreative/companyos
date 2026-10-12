import type { ReactNode } from "react";
import Link from "next/link";
import { RevenueChart } from "@/components/Charts";
import { EvidenceLinks } from "@/components/blocks";
import { Badge, Bar, Card, DefList, EmptyState, KindTag, Notice, PageHeader, SeverityBadge, Tabs } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import type { Kpi } from "@/lib/calc/department";
import { fmtDate, fmtMonth, relativeDays } from "@/lib/dates";
import { fmtHours, fmtPct, fmtPts } from "@/lib/money";
import { ROLES } from "@/lib/permissions";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;
const TABS = ["overview", "projects", "retainers", "pnl", "people"] as const;
type Tab = (typeof TABS)[number];
const BILLING_LABEL: Record<string, string> = { fixed_fee: "Fixed fee", retainer: "Retainer", time_materials: "Time & materials", internal: "Internal" };
const VERDICT: Record<string, ["good" | "warn" | "bad" | "neutral", string]> = { loss: ["bad", "Losing money"], below_target: ["warn", "Below target"], on_target: ["good", "On target"], internal: ["neutral", "Internal"], unknown: ["neutral", "Not enough data"] };
const TONE_TEXT = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;

/**
 * Department workspace. Answers, for one department: what needs attention in
 * its work (watchouts), how its projects and retainers are doing, what it
 * earns and costs, and how its people are doing. Data comes from
 * `ws.department()`, which the data layer scopes to the role.
 */
export default async function DepartmentPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const d = ws.department();
  if (!d) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Delivery" title="Department" />
        <EmptyState title="Not available for your role">The department workspace is for department heads and executives.</EmptyState>
      </div>
    );
  }
  const v = viewHelpers(ws);
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const delivery = ws.profile.modules.financeMode === "delivery";
  const hasRevenue = delivery && d.projects.some((p) => p.billing !== "internal");
  const head = d.headId ? v.person(d.headId) : null;
  const urgent = d.watchouts.filter((w) => w.severity === "critical" || w.severity === "high").length;
  const kpis = d.kpis.filter((k) => k.value !== null);
  const fmtKpi = (k: Kpi) => (k.value === null ? "—" : k.format === "pct" ? fmtPct(k.value) : k.format === "score" ? `${k.value}/100` : k.format === "money" ? v.money(k.value, { compact: true }) : k.value.toFixed(1));
  const fmtTarget = (k: Kpi) => (k.target === null ? null : `${k.higherIsBetter ? "Target" : "Limit"} ${k.format === "pct" ? fmtPct(k.target) : k.format === "score" ? k.target : k.target.toFixed(1)}`);
  const periodLabel = d.period.label;
  const projectRows = d.projects.filter((r) => r.status !== "completed" || r.deptHours > 0);
  const tabs = [
    { key: "overview", label: "Overview", count: d.watchouts.length },
    { key: "projects", label: ws.profile.terms.projects, count: projectRows.length },
    ...(d.retainers.length ? [{ key: "retainers", label: "Retainers", count: d.retainers.filter((r) => r.status !== "ok").length }] : []),
    { key: "pnl", label: hasRevenue ? "P&L" : "Team cost" },
    { key: "people", label: "People", count: d.people.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${ROLES[ws.ctx.role].label} · ${ws.org.name}`}
        title={`${d.name} department`}
        subtitle={
          <>
            {head ? `Led by ${head}. ` : ""}
            {d.memberIds.length} people across {d.projects.filter((p) => p.status !== "completed").length} active {ws.profile.terms.projects.toLowerCase()}. Figures cover {periodLabel} unless marked otherwise.
          </>
        }
      />
      {ws.ctx.role !== "department_head" && <Notice tone="info">You are viewing the {d.name} department as {ROLES[ws.ctx.role].label.toLowerCase()}. Department heads see this page for their own department only.</Notice>}
      <Tabs base="/department" tabs={tabs} current={tab} />

      {tab === "overview" && (
        <>
          <section aria-labelledby="kpi-title" className="space-y-3">
            <h2 id="kpi-title" className="text-lg font-semibold tracking-tight">
              Team KPIs
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.key} className="card flex h-full flex-col p-3.5 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] font-medium text-ink-soft">{k.label}</div>
                    <span className="hidden sm:inline">
                      <KindTag kind={k.key === "feedback" ? "inferred" : "calculated"} quiet />
                    </span>
                  </div>
                  <div className={`mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tightest sm:text-[26px] ${k.tone ? TONE_TEXT[k.tone] : "text-ink"}`}>
                    {fmtKpi(k)}
                    {k.tone && <span className="sr-only"> ({k.tone === "bad" ? "needs attention" : k.tone === "warn" ? "watch" : "on target"})</span>}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-snug text-ink-soft">{k.sub}</div>
                  {fmtTarget(k) && <div className="mt-auto pt-2 text-xs text-ink-muted">{fmtTarget(k)}</div>}
                </div>
              ))}
            </div>
          </section>

          <Card
            id="watchouts"
            title="Watchouts"
            subtitle={`Risks in ${d.name.toLowerCase()} work: blocked or waiting tasks, unpriced requests, revision-heavy deliverables, time off, workload, retainers and margins. ${urgent} urgent.`}
            padded={false}
          >
            {d.watchouts.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Nothing needs attention">Missing or stale data would appear here, not be hidden.</EmptyState>
              </div>
            ) : (
              <ol className="divide-y divide-line">
                {d.watchouts.map((w) => (
                  <li key={w.id} id={w.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={w.severity} />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{w.kind.replace("_", " ")}</span>
                    </div>
                    <div className="mt-1 font-medium text-ink">{w.title}</div>
                    <p className="mt-0.5 text-sm text-ink-soft">{w.why}</p>
                    <p className="mt-1 text-sm">
                      <span className="text-ink-muted">Next step: </span>
                      {w.next}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Owner {v.person(w.ownerId)}
                      {w.due ? ` · due ${fmtDate(w.due)} (${relativeDays(ws.org.demoDate, w.due)})` : ""}
                    </p>
                    <EvidenceLinks ws={ws} links={w.links} className="mt-1.5" />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}

      {tab === "projects" && (
        <Card
          title={`${ws.profile.terms.projects} your team works on`}
          subtitle={`Margins are for the whole ${ws.profile.terms.project.toLowerCase()} at completion. Team share, attributed revenue and team cost are for ${periodLabel}. Revenue is attributed by the team's share of recorded hours.`}
          padded={false}
          actions={<KindTag kind="calculated" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="th">{ws.profile.terms.project}</th>
                  <th className="th">Status</th>
                  <th className="th num">Team hours</th>
                  <th className="th num">Team share</th>
                  {hasRevenue && <th className="th num">Attributed revenue</th>}
                  <th className="th num">Team cost</th>
                  {hasRevenue && <th className="th num">Forecast margin</th>}
                  {hasRevenue && <th className="th num">vs target</th>}
                </tr>
              </thead>
              <tbody>
                {projectRows.map((r) => {
                  const [tone, label] = VERDICT[r.verdict];
                  return (
                    <tr key={r.projectId}>
                      <td className="td">
                        <Link href={`/projects/${r.projectId}`} className="font-medium">
                          {v.project(r.projectId)}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {r.accountId ? v.account(r.accountId) : "Internal"} · {BILLING_LABEL[r.billing]}
                          {r.status === "completed" ? " · completed" : ""}
                        </div>
                      </td>
                      <td className="td">
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td className="td num">{fmtHours(r.deptHours)}</td>
                      <td className="td num">{fmtPct(r.deptShare)}</td>
                      {hasRevenue && <td className="td num">{r.billing === "internal" ? "—" : v.money(r.attributedRevenue, { compact: true })}</td>}
                      <td className="td num">{v.money(r.deptCost, { compact: true })}</td>
                      {hasRevenue && <td className="td num">{r.billing === "internal" ? "—" : fmtPct(r.forecastMargin)}</td>}
                      {hasRevenue && <td className={`td num ${r.variance !== null && r.variance < -0.05 ? "text-bad" : ""}`}>{r.billing === "internal" ? "—" : fmtPts(r.variance)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "retainers" && (
        <Card title="Retainer hours used against included" subtitle="Last three full months, all people on the retainer, with your team's part. This month is planned from current assignments." padded={false}>
          <ul className="divide-y divide-line">
            {d.retainers.map((r) => {
              const tone = r.status === "over" ? "bad" : r.status === "near" ? "warn" : "good";
              return (
                <li key={r.projectId} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <Link href={`/projects/${r.projectId}`} className="font-medium">
                        {v.project(r.projectId)}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {r.includedPerMonth} h included a month
                        {r.monthlyFee !== null ? ` · ${v.money(r.monthlyFee)} a month` : ""}
                        {r.renewalDate ? ` · renews ${fmtDate(r.renewalDate)}` : ""}
                      </div>
                    </div>
                    <Badge tone={tone}>{r.status === "over" ? "Over allowance" : r.status === "near" ? "Near allowance" : "Within allowance"}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {r.history.map((m) => {
                      const pct = m.included > 0 ? m.hours / m.included : 0;
                      return (
                        <div key={m.ym} className="rounded-lg bg-canvas px-3 py-2">
                          <div className="text-xs text-ink-muted">{m.label}</div>
                          <div className={`text-sm font-semibold tabular-nums ${pct > 1 ? "text-bad" : ""}`}>
                            {Math.round(m.hours)} / {m.included} h · {fmtPct(pct)}
                          </div>
                          <Bar value={m.hours} max={Math.max(m.included, m.hours)} tone={pct > 1 ? "bad" : pct > 0.9 ? "warn" : "good"} label={`${m.label}: ${Math.round(m.hours)} of ${m.included} hours`} />
                          <div className="mt-1 text-[11px] text-ink-muted">Your team {Math.round(m.deptHours)} h</div>
                        </div>
                      );
                    })}
                    <div className="rounded-lg border border-dashed border-line-strong px-3 py-2">
                      <div className="text-xs text-ink-muted">{fmtMonth(r.planned.ym)} · planned</div>
                      <div className="text-sm font-semibold tabular-nums">
                        {Math.round(r.planned.hours)} / {r.includedPerMonth} h · {fmtPct(r.planned.pct)}
                      </div>
                      <div className="mt-1 text-[11px] text-ink-muted">Forecast from assignments</div>
                    </div>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {r.unbilledOverageHours > 0 ? `${Math.round(r.unbilledOverageHours)} h of overage not billed to date. ` : "No unbilled overage. "}
                    {r.effectiveRate !== null ? `Effective rate last month ${v.money(r.effectiveRate)} an hour.` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "pnl" && (
        <>
          {d.pnl.missing.length > 0 && <Notice title="Incomplete figures">{d.pnl.missing.join(" ")}</Notice>}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card title={hasRevenue ? "Department P&L" : "Department cost"} subtitle={`${periodLabel} · ${d.name} only · excludes company overhead`} actions={<KindTag kind="calculated" />}>
              <DefList
                items={[
                  ...(hasRevenue
                    ? ([
                        ["Attributed revenue", v.money(d.pnl.revenue)],
                        ["Team labor on client work", `− ${v.money(d.pnl.directLabor)}`],
                        ["Contractors on client work", `− ${v.money(d.pnl.contractors)}`],
                        [<strong key="c">Contribution</strong>, <strong key="cv">{`${v.money(d.pnl.contribution)} · ${fmtPct(d.pnl.contributionMargin)}`}</strong>],
                        ["Team payroll not on client work", `− ${v.money(d.pnl.unabsorbedPayroll)}`],
                      ] as [ReactNode, ReactNode][])
                    : ([
                        ["Team payroll", v.money(d.pnl.teamPayroll)],
                        ["Contractors", v.money(d.pnl.contractors)],
                      ] as [ReactNode, ReactNode][])),
                  ["Contractors on internal work", `− ${v.money(d.pnl.internalContractors)}`],
                  [<strong key="r">{hasRevenue ? "Department result" : "Total team cost"}</strong>, <strong key="rv" className={hasRevenue && d.pnl.result < 0 ? "text-bad" : undefined}>{v.money(hasRevenue ? d.pnl.result : -d.pnl.result)}</strong>],
                ]}
              />
              <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                Revenue on each client {ws.profile.terms.project.toLowerCase()} is split by the share of its recorded hours your team logged. Team cost is a total from compensation records; individual salaries and cost rates are not shown.{" "}
                <Link href="/calculations#department">How this is calculated</Link>
              </p>
            </Card>
            {hasRevenue && (
              <Card title="By month" subtitle="Attributed revenue against your team's direct cost on client work">
                <RevenueChart data={d.pnl.monthly} symbol={v.money(0).replace(/[\d,]/g, "")} title="Attributed revenue and team direct cost" stacked labels={{ earned: "Attributed revenue", directCost: "Team direct cost", margin: "Contribution margin" }} />
              </Card>
            )}
          </div>
        </>
      )}

      {tab === "people" && (
        <>
          <Card id="hours" title="Hours" subtitle={`${periodLabel} · capacity is contracted hours × FTE less approved time off. Last eight weeks shown against weekly capacity.`} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="th">Person</th>
                    <th className="th num">Available</th>
                    <th className="th num">Logged</th>
                    <th className="th num">Billable</th>
                    <th className="th num">Utilization</th>
                    <th className="th">Last 8 weeks</th>
                    <th className="th">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((p) => (
                    <tr key={p.person.id} id={p.person.id}>
                      <td className="td">
                        <div className="font-medium">{p.person.name}</div>
                        <div className="text-xs text-ink-muted">
                          {p.person.title}
                          {p.person.type === "contractor" ? " · contractor" : ""}
                          {p.person.fte < 1 ? ` · ${p.person.fte} FTE` : ""}
                        </div>
                      </td>
                      <td className="td num">{fmtHours(p.hours.available)}</td>
                      <td className="td num">{fmtHours(p.hours.logged)}</td>
                      <td className="td num">{fmtHours(p.hours.billable)}</td>
                      <td className="td num">{fmtPct(p.hours.utilization)}</td>
                      <td className="td">
                        <div className="flex h-8 items-end gap-0.5" role="img" aria-label={`Weekly hours: ${p.weeks.map((w) => `${fmtDate(w.week, { year: false })} ${Math.round(w.hours)}`).join(", ")}`}>
                          {p.weeks.map((w) => (
                            <span
                              key={w.week}
                              title={`Week of ${fmtDate(w.week, { year: false })}: ${Math.round(w.hours)} h of ${w.capacity}`}
                              className={`w-2.5 rounded-t-sm ${w.hours === 0 ? "bg-line" : w.hours > w.capacity * 1.05 ? "bg-bad" : "bg-accent"}`}
                              style={{ height: `${Math.max(8, Math.min(100, (w.hours / Math.max(1, w.capacity)) * 100))}%` }}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {p.hours.missingWeeks.length > 0 && <Badge tone="warn">{p.hours.missingWeeks.length} wk no timesheet</Badge>}
                          {p.hours.overtimeWeeks > 0 && <Badge tone="warn">{p.hours.overtimeWeeks} wk over capacity</Badge>}
                          {p.upcoming.overallocatedWeeks >= 2 && <Badge tone="bad">Overbooked next 4 wk</Badge>}
                          {p.upcoming.timeOff.map((t) => (
                            <Badge key={t.start}>
                              Off {fmtDate(t.start, { year: false })}–{fmtDate(t.end, { year: false })}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            id="feedback"
            title="Performance"
            subtitle="Delivery from task records; feedback scored from client messages in threads you can read (simulated review). A message that names someone counts fully; otherwise it is shared by each person's recent hours on that work. Use it to start a conversation, not to rate anyone."
            actions={<KindTag kind="inferred" />}
            padded={false}
          >
            <ul className="divide-y divide-line">
              {d.people.map((p) => (
                <li key={p.person.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">{p.person.name}</div>
                    <div className="text-sm">
                      Feedback{" "}
                      <strong className="tabular-nums">{p.feedback.score === null ? "not enough yet" : `${p.feedback.score}/100`}</strong>
                      <span className="text-ink-muted">
                        {" "}
                        · {p.feedback.positive} positive · {p.feedback.concerns} concern{p.feedback.concerns === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    On time {p.tasks.onTimeRate === null ? "—" : `${p.tasks.onTime} of ${p.tasks.done}`} (last 90 days) · {p.tasks.open} open task{p.tasks.open === 1 ? "" : "s"}
                    {p.tasks.overdue ? `, ${p.tasks.overdue} overdue` : ""} · revision rounds {p.tasks.avgRevisions === null ? "—" : p.tasks.avgRevisions.toFixed(1)}
                  </div>
                  {p.feedback.evidence.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer select-none text-[13px] font-medium text-accent">Show the {p.feedback.evidence.length} messages behind this</summary>
                      <ul className="mt-2 space-y-2">
                        {p.feedback.evidence.map((e) => (
                          <li key={e.messageId} className="rounded-lg bg-canvas px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                              <Badge tone={e.tone === "positive" ? "good" : e.tone === "concern" ? "bad" : "warn"}>{e.tone === "positive" ? "Positive" : e.tone === "concern" ? "Concern" : "Mixed"}</Badge>
                              {e.author} · {fmtDate(e.sentAt.slice(0, 10))} · {e.basis === "named" ? "names them" : `${Math.round(e.weight * 100)}% of recent hours on ${v.project(e.projectId)}`}
                            </div>
                            <p className="mt-1 text-ink-soft">“{e.excerpt}”</p>
                            <Link href={`/communications/${e.threadId}#${e.messageId}`} className="text-xs">
                              Open message
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
