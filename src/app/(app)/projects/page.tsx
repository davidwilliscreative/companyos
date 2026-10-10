import Link from "next/link";
import { Bar, Card, EmptyState, MilestoneBadge, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { fmtHours, fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;
const BILLING_LABEL: Record<string, string> = { fixed_fee: "Fixed fee", retainer: "Retainer", time_materials: "Time & materials", internal: "Internal" };

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const billing = str("billing", "all");
  const status = str("status", "open");
  const account = str("account", "all");
  const problem = str("problem", "all");

  const rows = ws.data.projects.map((p) => {
    const f = a.projectFin[p.id];
    const ms = ws.data.milestones.filter((m) => m.projectId === p.id);
    const worst = ms.map((m) => a.milestones[m.id]).filter((x) => x && x.state !== "done");
    const order = ["late", "blocked", "awaiting_client", "at_risk", "on_track"] as const;
    const worstState = order.find((s) => worst.some((w) => w.state === s));
    const marginProblem = !!f && f.margin.variance !== null && f.margin.variance < -0.05;
    const budgetProblem = !!f && f.budget.forecastVsBudget !== null && f.budget.forecastVsBudget > 0;
    const scheduleProblem = worstState === "late" || worstState === "blocked" || worstState === "awaiting_client" || (f?.schedule.slipDays ?? 0) > 14;
    return { p, f, worstState, marginProblem, budgetProblem, scheduleProblem };
  });
  const filtered = rows
    .filter((r) => billing === "all" || r.p.billing === billing)
    .filter((r) => (status === "all" ? true : status === "open" ? r.p.status !== "completed" : r.p.status === status))
    .filter((r) => account === "all" || r.p.accountId === account)
    .filter((r) => (problem === "all" ? true : problem === "margin" ? r.marginProblem || r.budgetProblem : problem === "schedule" ? r.scheduleProblem : true))
    .sort((x, y) => Number(y.marginProblem || y.budgetProblem) + Number(y.scheduleProblem) - (Number(x.marginProblem || x.budgetProblem) + Number(x.scheduleProblem)) || x.p.name.localeCompare(y.p.name));
  const billingTypes = [...new Set(ws.data.projects.map((p) => p.billing))];

  return (
    <div className="space-y-6">
      <PageHeader title={t.projects} subtitle={ws.profile.modules.projectMargins ? "Fixed-fee, retainer, time-and-materials and internal work. Margins use direct labor, contractor and expense costs." : `Delivery status and budget for each ${t.project.toLowerCase()}.`} />
      <form className="card flex flex-wrap items-end gap-3 p-3" aria-label="Filter projects">
        <div>
          <label className="label" htmlFor="billing">Type</label>
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
          <label className="label" htmlFor="status">Status</label>
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
          <label className="label" htmlFor="account">{t.account}</label>
          <select id="account" name="account" className="input" defaultValue={account}>
            <option value="all">All</option>
            {ws.data.accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="problem">Problems</label>
          <select id="problem" name="problem" className="input" defaultValue={problem}>
            <option value="all">All</option>
            <option value="margin">{ws.profile.modules.projectMargins ? "Margin or budget" : "Over budget"}</option>
            <option value="schedule">Schedule</option>
          </select>
        </div>
        <button className="btn btn-primary">Apply</button>
        <Link href="/projects" className="btn">
          Reset
        </Link>
      </form>

      <Card padded={false} title={`${filtered.length} ${t.projects.toLowerCase()}`}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No matches" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr>
                  <th className="th">{t.project}</th>
                  <th className="th">{ws.profile.id === "enterprise" ? "Unit" : t.account}</th>
                  <th className="th">Type</th>
                  <th className="th">Owner</th>
                  <th className="th">Schedule</th>
                  <th className="th">Hours used</th>
                  {ws.caps.viewProjectCosts && ws.profile.modules.projectMargins && <th className="th num">Margin to date</th>}
                  {ws.caps.viewProjectCosts && ws.profile.modules.projectMargins && <th className="th num">Forecast margin</th>}
                  {ws.caps.viewProjectCosts && <th className="th num">Forecast vs budget</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ p, f, worstState, marginProblem }) => (
                  <tr key={p.id} className="hover:bg-canvas/60">
                    <td className="td">
                      <Link href={`/projects/${p.id}`} className="font-medium">
                        {p.name}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {p.status.replace("_", " ")} · ends {fmtDate(p.currentEndDate)}
                        {p.currentEndDate !== p.originalEndDate ? <span className="text-warn"> (was {fmtDate(p.originalEndDate)})</span> : null}
                        {p.scenarioNote ? <span className="text-accent"> · scenario applied</span> : null}
                      </div>
                    </td>
                    <td className="td text-sm">{p.accountId ? <Link href={`/accounts/${p.accountId}`}>{v.account(p.accountId)}</Link> : p.department ?? "Internal"}</td>
                    <td className="td text-xs">{BILLING_LABEL[p.billing]}</td>
                    <td className="td text-xs">{v.person(p.ownerId)}</td>
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
                    {ws.caps.viewProjectCosts && ws.profile.modules.projectMargins && <td className="td num">{fmtPct(f?.margin.actualToDate)}</td>}
                    {ws.caps.viewProjectCosts && ws.profile.modules.projectMargins && (
                      <td className={`td num ${marginProblem ? "font-medium text-bad" : ""}`}>
                        {fmtPct(f?.margin.forecastAtCompletion)}
                        {f?.margin.target !== null && f?.margin.target !== undefined && <div className="text-[11px] font-normal text-ink-muted">target {fmtPct(f.margin.target)}</div>}
                      </td>
                    )}
                    {ws.caps.viewProjectCosts && <td className={`td num ${f?.budget.forecastVsBudget && f.budget.forecastVsBudget > 0 ? "text-bad" : ""}`}>{f?.budget.forecastVsBudget !== null && f?.budget.forecastVsBudget !== undefined ? v.money(f.budget.forecastVsBudget, { compact: true, sign: true }) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
