import Link from "next/link";
import { FilterForm, Presets } from "@/components/filters";
import { LevelBadge } from "@/components/status";
import { Bar, Card, EmptyState, MilestoneBadge, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { buildIssues } from "@/lib/issues";
import { fmtHours, fmtPct } from "@/lib/money";
import { aggregateScope } from "@/lib/permissions";
import { viewHelpers } from "@/lib/view";
import { inProjectView, PROJECT_VIEWS, type ProjectRow, type ProjectView, parseView, projectRows, STATUS_RANK } from "@/lib/views";

type SP = Promise<Record<string, string | string[] | undefined>>;
const BILLING_LABEL: Record<string, string> = { fixed_fee: "Fixed fee", retainer: "Retainer", time_materials: "Time & materials", internal: "Internal" };

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const billing = str("billing", "all");
  const status = str("status", "open");
  const account = str("account", "all");
  const problem = str("problem", "all");
  const view = parseView(PROJECT_VIEWS, sp.view);
  const rows = projectRows(ws, buildIssues(ws));
  const inView = (r: ProjectRow, vw: ProjectView | null) => inProjectView(r, vw, ws.user.id);
  const filtered = rows
    .filter((r) => inView(r, view))
    .filter((r) => billing === "all" || r.p.billing === billing)
    .filter((r) => (status === "all" ? true : status === "open" ? r.p.status !== "completed" : r.p.status === status))
    .filter((r) => account === "all" || r.p.accountId === account)
    .filter((r) => (problem === "all" ? true : problem === "margin" ? r.marginProblem || r.budgetProblem : problem === "schedule" ? r.scheduleProblem : true))
    .sort((x, y) => STATUS_RANK[x.it.overall] - STATUS_RANK[y.it.overall] || y.own.length - x.own.length || x.p.name.localeCompare(y.p.name));
  const billingTypes = [...new Set(ws.data.projects.map((p) => p.billing))];
  const open = rows.filter((r) => r.p.status !== "completed");
  const presets = [
    { label: "All open", href: "/projects", active: !view, count: open.length },
    ...(rows.some((r) => inView(r, "mine")) ? [{ label: `My ${t.projects.toLowerCase()}`, href: "/projects?view=mine", active: view === "mine", count: rows.filter((r) => inView(r, "mine")).length }] : []),
    { label: "Needs intervention", href: "/projects?view=intervention", active: view === "intervention", count: rows.filter((r) => inView(r, "intervention")).length },
    { label: "Staffing gaps", href: "/projects?view=gaps", active: view === "gaps", count: rows.filter((r) => inView(r, "gaps")).length },
  ];
  const filtersActive = billing !== "all" || status !== "open" || account !== "all" || problem !== "all";
  // Budget variance only applies to work with a cost budget; hide an all-blank column.
  const showBudget = ws.caps.viewProjectCosts && filtered.some((r) => r.f?.budget.forecastVsBudget != null);
  const showMargins = ws.caps.viewProjectCosts && ws.profile.modules.projectMargins;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={aggregateScope(ws.caps)}
        title={t.projects}
        subtitle={ws.profile.modules.projectMargins ? "Fixed-fee, retainer, time-and-materials and internal work. Margins use direct labor, contractor and expense costs." : `Delivery status and budget for each ${t.project.toLowerCase()}.`}
      />
      <Presets label={`${t.projects} views`} items={presets} />
      <FilterForm label={`Filter ${t.projects.toLowerCase()}`} defaults={{ status: "open" }}>
        {view && <input type="hidden" name="view" value={view} />}
        <div>
          <label className="label" htmlFor="billing">
            Type
          </label>
          <select id="billing" name="billing" className="input" defaultValue={billing}>
            <option value="all">All types</option>
            {billingTypes.map((b) => (
              <option key={b} value={b}>
                {BILLING_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="open">Not completed</option>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="account">
            {t.account}
          </label>
          <select id="account" name="account" className="input" defaultValue={account}>
            <option value="all">All</option>
            {ws.data.accounts
              .filter((x) => ws.data.projects.some((p) => p.accountId === x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="problem">
            Problems
          </label>
          <select id="problem" name="problem" className="input" defaultValue={problem}>
            <option value="all">All</option>
            <option value="margin">{ws.profile.modules.projectMargins ? "Margin or budget" : "Over budget"}</option>
            <option value="schedule">Schedule</option>
          </select>
        </div>
        <noscript>
          <button className="btn btn-primary">Apply</button>
        </noscript>
        {filtersActive && (
          <Link href={view ? `/projects?view=${view}` : "/projects"} className="btn">
            Clear filters
          </Link>
        )}
      </FilterForm>

      <Card padded={false} title={`${filtered.length} ${t.projects.toLowerCase()}`}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No matches" />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((r) => (
                <li key={r.p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/projects/${r.p.id}`} className="font-medium">
                      {r.p.name}
                    </Link>
                    <LevelBadge level={r.it.overall}>{r.it.overallLabel}</LevelBadge>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{r.own[0]?.title ?? r.it.headline}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {[
                      r.p.accountId ? v.account(r.p.accountId) : (r.p.department ?? "Internal"),
                      v.person(r.p.ownerId),
                      `ends ${fmtDate(r.p.currentEndDate)}`,
                      showMargins && r.f?.margin.forecastAtCompletion != null ? `forecast margin ${fmtPct(r.f.margin.forecastAtCompletion)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr>
                    <th className="th">{t.project}</th>
                    <th className="th">Status</th>
                    <th className="th">Main issue</th>
                    <th className="th">Schedule</th>
                    <th className="th">Hours used</th>
                    {showMargins && <th className="th num">Forecast margin</th>}
                    {showBudget && <th className="th num">Forecast vs budget</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ p, f, worstState, marginProblem, it, own }) => (
                    <tr key={p.id} className="hover:bg-canvas/60">
                      <td className="td min-w-[230px]">
                        <Link href={`/projects/${p.id}`} className="font-medium">
                          {p.name}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {p.accountId ? v.account(p.accountId) : (p.department ?? "Internal")} · {v.person(p.ownerId)} · {BILLING_LABEL[p.billing]} · ends {fmtDate(p.currentEndDate)}
                          {p.currentEndDate !== p.originalEndDate ? <span className="text-warn"> (was {fmtDate(p.originalEndDate)})</span> : null}
                          {p.scenarioNote ? <span className="text-accent"> · scenario applied</span> : null}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap">
                        <LevelBadge level={it.overall}>{it.overallLabel}</LevelBadge>
                      </td>
                      <td className="td min-w-[220px] text-sm">
                        {own[0] ? (
                          <>
                            <Link href={`/issues#${own[0].id}`} className="text-ink hover:text-accent">
                              {own[0].title}
                            </Link>
                            {own.length > 1 && <span className="text-xs text-ink-muted"> +{own.length - 1} more</span>}
                          </>
                        ) : (
                          <span className="text-ink-muted">{it.overall === "good" ? "None open" : it.headline}</span>
                        )}
                      </td>
                      <td className="td">{worstState ? <MilestoneBadge state={worstState} /> : <span className="text-xs text-ink-muted">{p.status === "completed" ? "Completed" : "No open milestones"}</span>}</td>
                      <td className="td w-40">
                        {f && p.budgetHours > 0 ? (
                          <>
                            <Bar value={f.hours.actual} max={p.budgetHours} tone={f.hours.atCompletion > p.budgetHours ? "bad" : "accent"} label={`${Math.round(f.hours.actual)} of ${p.budgetHours} budget hours`} />
                            <div className="mt-0.5 text-[11px] text-ink-muted">
                              {fmtHours(f.hours.actual)} / {fmtHours(p.budgetHours)}
                              {f.hours.atCompletion > p.budgetHours ? <span className="text-bad"> · forecast {fmtHours(f.hours.atCompletion)}</span> : null}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                      {showMargins && (
                        <td className={`td num ${marginProblem ? "font-medium text-bad" : ""}`}>
                          {fmtPct(f?.margin.forecastAtCompletion)}
                          {f?.margin.target !== null && f?.margin.target !== undefined && <div className="text-[11px] font-normal text-ink-muted">target {fmtPct(f.margin.target)}</div>}
                        </td>
                      )}
                      {showBudget && (
                        <td className={`td num ${f?.budget.forecastVsBudget && f.budget.forecastVsBudget > 0 ? "text-bad" : ""}`}>
                          {f?.budget.forecastVsBudget !== null && f?.budget.forecastVsBudget !== undefined ? v.money(f.budget.forecastVsBudget, { compact: true, sign: true }) : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
