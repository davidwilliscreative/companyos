import Link from "next/link";
import { Badge, Card, KindTag, Notice, PageHeader, Stat } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { assessNewWork, isDeliveryRole } from "@/lib/calc/capacity";
import { addDays, fmtDate, mondayOf } from "@/lib/dates";
import { fmtHours, fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;

function heat(pct: number) {
  if (pct === 0) return "bg-canvas text-ink-muted";
  if (pct > 1.05) return "bg-bad text-white";
  if (pct > 0.9) return "bg-warn-soft text-warn";
  if (pct >= 0.5) return "bg-good-soft text-good";
  return "bg-accent-soft text-accent";
}

export default async function TeamPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const a = ws.analysis;
  const cap = a.capacity;
  const billable = ws.profile.modules.billableUtilization;
  const roles = [...new Set(ws.data.people.filter(isDeliveryRole).map((p) => p.role))];
  const requested: Record<string, number> = {};
  for (const r of roles) {
    const n = Number(sp[`role_${r}`]);
    if (Number.isFinite(n) && n > 0) requested[r] = Math.min(5000, n);
  }
  const weeks = Math.min(26, Math.max(1, Number(sp.weeks) || 8));
  const startDate = typeof sp.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : mondayOf(addDays(ws.org.demoDate, 14));
  const assessment = Object.keys(requested).length ? assessNewWork({ ...ws.data, projects: ws.planning.projects, people: ws.planning.people, timeOff: ws.planning.timeOff }, { hoursByRole: requested, weeks, startDate }) : null;
  const people = [...cap.people].sort((x, y) => Number(y.delivery) - Number(x.delivery) || x.person.role.localeCompare(y.person.role) || x.person.name.localeCompare(y.person.name));
  const weekHeaders = people[0]?.upcoming.weeks.map((w) => w.week) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Delivery" title="Capacity" subtitle={`${a.period.label} for actuals; next 8 weeks for planned load. Capacity = contracted hours × FTE − approved time off.`} />
      {!ws.caps.allAccounts && <Notice tone="info">Projects outside your accounts are shown as “Other work” so that you can see load without seeing other clients.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {billable && (
          <Stat
            label="Billable utilization (delivery employees)"
            value={fmtPct(cap.team.utilization)}
            sub={`${fmtHours(cap.team.billable)} billable of ${fmtHours(cap.team.available)} available · target ${fmtPct(ws.org.billableUtilizationTarget ?? null)}`}
            kind="calculated"
            href="/calculations#utilization"
          />
        )}
        <Stat label="Over-allocated" value={cap.overallocated.length} sub="Above 105% in 2+ of next 4 weeks" tone={cap.overallocated.length ? "bad" : undefined} kind="calculated" />
        <Stat
          label="Unstaffed remaining effort"
          value={fmtHours(cap.gaps.reduce((s, g) => s + g.hours, 0))}
          sub={`${cap.gaps.length} ${ws.profile.terms.projects.toLowerCase()}`}
          tone={cap.gaps.length ? "warn" : undefined}
          kind="calculated"
        />
        <Stat label="Missing timesheets" value={cap.missingTimesheets.length} sub="People planned on work with weeks of no time recorded" tone={cap.missingTimesheets.length ? "warn" : undefined} kind="observed" />
      </div>

      <Card
        id="utilization"
        title="People"
        padded={false}
        subtitle={
          ws.caps.viewProjectCosts ? (
            <>
              Hours and planned load only. Bill rates and cost rates are under <Link href="/team/rates">Rates and costs</Link>.
            </>
          ) : (
            "Hours and planned load only."
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="th">Person</th>
                <th className="th">Role</th>
                <th className="th num">h/week</th>
                <th className="th num">Logged</th>
                {billable && <th className="th num">Billable</th>}
                {billable && <th className="th num">Utilization</th>}
                {weekHeaders.map((w) => (
                  <th key={w} className="th num whitespace-nowrap px-1 text-[10px]">
                    {fmtDate(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((pc) => {
                const missing = cap.missingTimesheets.find((m) => m.personId === pc.person.id);
                return (
                  <tr key={pc.person.id} id={pc.person.id} className="scroll-mt-20 target:bg-accent-soft">
                    <td className="td min-w-[180px]">
                      <div className="whitespace-nowrap font-medium">{pc.person.name}</div>
                      <div className="text-xs text-ink-muted">
                        {pc.person.title}
                        {pc.person.type === "contractor" && <Badge tone="purple">Contractor</Badge>}
                        {pc.person.fte < 1 && ` · ${pc.person.fte} FTE`}
                      </div>
                      {missing && <div className="text-[11px] text-warn">No time recorded for {missing.weeks.length} planned week(s)</div>}
                    </td>
                    <td className="td text-xs">{pc.person.role}</td>
                    <td className="td num">{pc.weeklyCapacity}</td>
                    <td className="td num">{fmtHours(pc.period.actual)}</td>
                    {billable && <td className="td num">{fmtHours(pc.period.billable)}</td>}
                    {billable && <td className="td num">{pc.delivery ? fmtPct(pc.period.utilization) : <span className="text-xs text-ink-muted">n/a</span>}</td>}
                    {pc.upcoming.weeks.map((w) => (
                      <td key={w.week} className="border-b border-line px-0.5 py-1">
                        <div
                          className={`rounded-md px-1 py-1 text-center text-[10px] font-medium tabular-nums ${Number.isFinite(w.pct) ? heat(w.pct) : w.planned > 0 ? "bg-bad text-white" : "bg-canvas text-ink-faint"}`}
                          title={Number.isFinite(w.pct) ? `${w.planned} h planned (${Math.round(w.pct * 100)}%)` : `${w.planned} h planned while on approved time off`}
                        >
                          {!Number.isFinite(w.pct) ? (w.planned > 0 ? "Off!" : "Off") : w.pct ? `${Math.round(w.pct * 100)}` : "·"}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-ink-muted">
          Weekly cells show planned hours as % of capacity. Red = over 105%. “Off” = approved time off; “Off!” = work planned during time off. Planned load comes from assignments; actual load comes from timesheets.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Free capacity by role" subtitle="Average over the next 8 weeks" actions={<KindTag kind="calculated" />}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Role</th>
                <th className="th num">People</th>
                <th className="th num">Capacity h/wk</th>
                <th className="th num">Planned h/wk</th>
                <th className="th num">Free h/wk</th>
              </tr>
            </thead>
            <tbody>
              {cap.byRole.map((r) => (
                <tr key={r.role}>
                  <td className="td">{r.role}</td>
                  <td className="td num">{r.people}</td>
                  <td className="td num">{Math.round(r.weeklyCapacity)}</td>
                  <td className="td num">{Math.round(r.weeklyPlanned)}</td>
                  <td className={`td num ${r.weeklyFree < 5 ? "text-bad" : ""}`}>{Math.round(r.weeklyFree)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card id="new-work" title="Can we take on new work?" subtitle="Compares requested hours per role with unplanned capacity">
          <form className="space-y-3" action="/team#new-work">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {roles.map((r) => (
                <div key={r}>
                  <label className="label" htmlFor={`role_${r}`}>
                    {r} (total h)
                  </label>
                  <input id={`role_${r}`} name={`role_${r}`} type="number" min={0} className="input" defaultValue={requested[r] ?? ""} />
                </div>
              ))}
              <div>
                <label className="label" htmlFor="weeks">
                  Over weeks
                </label>
                <input id="weeks" name="weeks" type="number" min={1} max={26} className="input" defaultValue={weeks} />
              </div>
              <div>
                <label className="label" htmlFor="start">
                  Starting
                </label>
                <input id="start" name="start" type="date" className="input" defaultValue={startDate} />
              </div>
            </div>
            <button className="btn btn-primary">Check capacity</button>
          </form>
          {assessment && (
            <div className="mt-4">
              <div className={`mb-2 text-sm font-semibold ${assessment.feasible === "no" ? "text-bad" : assessment.feasible === "tight" ? "text-warn" : "text-good"}`}>
                {assessment.feasible === "no" ? "Not without changes: at least one role is short." : assessment.feasible === "tight" ? "Possible but tight." : "Yes, there is room."}
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Role</th>
                    <th className="th num">Requested h/wk</th>
                    <th className="th num">Free h/wk</th>
                    <th className="th num">Shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.rows.map((r) => (
                    <tr key={r.role}>
                      <td className="td">{r.role}</td>
                      <td className="td num">{r.requestedPerWeek.toFixed(1)}</td>
                      <td className="td num">{r.freePerWeek.toFixed(1)}</td>
                      <td className={`td num ${r.shortfallPerWeek > 0.5 ? "text-bad" : ""}`}>{r.shortfallPerWeek > 0.5 ? r.shortfallPerWeek.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 text-xs text-ink-muted">
                {assessment.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {cap.gaps.length > 0 && (
        <Card id="gaps" title="Staffing gaps" subtitle="Remaining effort with nobody assigned">
          <ul className="space-y-1 text-sm">
            {cap.gaps.map((g) => (
              <li key={g.projectId}>
                <Link href={`/projects/${g.projectId}`}>{v.project(g.projectId)}</Link>: {fmtHours(g.hours)} unstaffed. <span className="text-xs text-ink-muted">{g.reason}.</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
