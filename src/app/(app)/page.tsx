import Link from "next/link";
import { RevenueChart } from "@/components/Charts";
import { AttentionList } from "@/components/blocks";
import { Card, EmptyState, HealthBadge, Notice, PageHeader, Stat, Trend } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { daysBetween, fmtDate, relativeDays } from "@/lib/dates";
import { fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

export default async function OverviewPage() {
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const a = ws.analysis;
  const t = ws.profile.terms;
  const mode = ws.profile.modules.financeMode;
  const fin = ws.finance;
  const sym = v.money(0).replace(/[0-9.,\s]/g, "");

  const moves = ws.data.accounts
    .map((acc) => {
      const h = a.health[acc.id];
      const prev = a.healthPrev[acc.id];
      return { acc, h, prev, delta: h?.score !== null && h?.score !== undefined && prev !== null && prev !== undefined ? h.score - prev : null };
    })
    .filter((x) => x.h);
  const atRisk = moves.filter((x) => x.h.status === "at_risk" || x.h.status === "watch" || (x.delta !== null && x.delta <= -10)).sort((x, y) => (x.h.score ?? 101) - (y.h.score ?? 101));
  const improving = moves.filter((x) => x.delta !== null && x.delta >= 5).sort((x, y) => (y.delta ?? 0) - (x.delta ?? 0));
  const insufficient = moves.filter((x) => x.h.status === "insufficient");

  const marginItems = a.attention.filter((i) => i.kind === "margin");
  const scheduleItems = a.attention.filter((i) => i.kind === "schedule");
  const renewals = a.renewals.filter((r) => daysBetween(ws.org.demoDate, r.renewalDate) <= 120);
  const arr = ws.data.subscriptions.filter((s) => s.renewalDate >= ws.org.demoDate).reduce((s, x) => s + x.mrr * 12, 0);
  const internal = ws.data.projects.filter((p) => p.billing === "internal" && p.status !== "completed");
  const budgetTotal = internal.reduce((s, p) => s + (p.budgetCost ?? 0), 0);
  const forecastTotal = internal.reduce((s, p) => s + (a.projectFin[p.id]?.cost.forecastTotal ?? 0), 0);
  const stale = ws.data.connectors.filter((c) => c.state !== "healthy" && c.state !== "not_configured");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${ws.profile.label} profile · ${ws.org.name}`}
        title="Executive overview"
        subtitle={
          <>
            Reporting period <strong>{a.period.label}</strong> ({fmtDate(a.period.start)} – {fmtDate(a.period.end)}). Operational items are as of {fmtDate(ws.org.demoDate, { year: true })}. Figures in {v.cur}.
          </>
        }
        actions={
          <Link href="/briefing" className="btn">
            Open weekly briefing
          </Link>
        }
      />

      {fin && fin.summary.missing.length > 0 && (
        <Notice title="Missing or partial data in this period">
          <ul className="list-disc pl-5">
            {fin.summary.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {mode === "delivery" && fin && (
          <>
            <Stat label={fin.scope === "company" ? "Earned revenue" : "Earned revenue (your accounts)"} value={v.money(fin.summary.earnedRevenue, { compact: true })} sub={a.period.label} kind="calculated" href="/finance" />
            <Stat label="Delivery margin" value={fmtPct(fin.summary.deliveryMargin)} sub={`${v.money(fin.summary.deliveryProfit, { compact: true })} after direct cost`} kind="calculated" href="/calculations#delivery-margin" tone={fin.summary.deliveryMargin !== null && fin.summary.deliveryMargin < 0.35 ? "warn" : undefined} />
            <Stat label="Invoiced" value={v.money(fin.summary.invoiced, { compact: true })} sub="Issued in period" kind="observed" href="/finance#billing" />
            <Stat label="Collected" value={v.money(fin.summary.collected, { compact: true })} sub="Payments received in period" kind="observed" href="/finance#billing" />
          </>
        )}
        {mode === "subscription" && (
          <>
            <Stat label="ARR (active subscriptions)" value={ws.data.subscriptions.length ? v.money(arr, { compact: true }) : "—"} sub="MRR × 12 at the demo date" kind="calculated" href="/finance" />
            {fin && <Stat label="Recognized revenue" value={v.money(fin.summary.earnedRevenue, { compact: true })} sub={a.period.label} kind="calculated" href="/finance" />}
            <Stat label="Renewals in 120 days" value={renewals.length} sub={v.money(renewals.reduce((s, r) => s + r.annualValue, 0), { compact: true }) + " annual value"} kind="observed" href="#renewals" />
          </>
        )}
        {mode === "budget" && (
          <>
            <Stat label="Approved initiative budget" value={v.money(budgetTotal, { compact: true })} sub={`${internal.length} active ${t.projects.toLowerCase()}`} kind="observed" href="/finance" />
            {ws.caps.viewProjectCosts ? (
              <Stat label="Forecast cost at completion" value={v.money(forecastTotal, { compact: true })} sub={`${forecastTotal > budgetTotal ? "over" : "under"} budget by ${v.money(Math.abs(forecastTotal - budgetTotal), { compact: true })}`} kind="calculated" tone={forecastTotal > budgetTotal ? "bad" : "good"} href="/finance" />
            ) : (
              <Stat label="Forecast cost" value="—" sub="Restricted for your role" />
            )}
          </>
        )}
        {ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts) && (
          <Stat label="Overdue receivables" value={v.money(a.receivables.totalOverdue, { compact: true })} sub={`${a.receivables.overdue.length} invoice${a.receivables.overdue.length === 1 ? "" : "s"} past due`} kind="observed" tone={a.receivables.totalOverdue > 0 ? "warn" : undefined} href="/finance#receivables" />
        )}
        {fin?.cash && <Stat label="13-week cash low point" value={v.money(fin.cash.lowPoint.closing, { compact: true })} sub={`Week of ${fmtDate(fin.cash.lowPoint.weekStart)}`} kind="calculated" tone={fin.cash.lowPoint.closing < 0 ? "bad" : undefined} href="/finance#cash" />}
        <Stat
          label={ws.profile.modules.billableUtilization ? "Billable utilization" : "Team planned load"}
          value={ws.profile.modules.billableUtilization ? fmtPct(a.capacity.team.utilization) : `${a.capacity.overallocated.length} over`}
          sub={ws.profile.modules.billableUtilization ? `Target ${fmtPct(ws.org.billableUtilizationTarget ?? null)} · ${a.capacity.overallocated.length} over-allocated` : "People above capacity in 2+ of the next 4 weeks"}
          kind="calculated"
          href="/team"
          tone={a.capacity.overallocated.length ? "warn" : undefined}
        />
        {!fin && mode !== "budget" && <Stat label="Financial results" value="—" sub="Restricted for your role" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card id="queue" title="Priority action queue" subtitle="Ranked by severity, impact and how soon a decision is needed. Every item links to its source." actions={<Link href="/actions" className="text-xs">All actions →</Link>}>
          <AttentionList ws={ws} items={a.attention} limit={8} />
          {a.attention.length > 8 && (
            <p className="mt-3 text-xs">
              <Link href="/briefing#queue">See all {a.attention.length} items in the weekly briefing →</Link>
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card title={`${t.accounts} at risk or declining`} subtitle="Watch or at-risk status, or down 10+ points in 30 days" actions={<Link href="/accounts?status=risk" className="text-xs">View →</Link>}>
            {atRisk.length === 0 ? (
              <EmptyState title="None flagged" />
            ) : (
              <ul className="space-y-2">
                {atRisk.slice(0, 6).map(({ acc, h, delta }) => (
                  <li key={acc.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/accounts/${acc.id}`}>{acc.name}</Link>
                    <span className="flex items-center gap-2">
                      <Trend delta={delta} />
                      <HealthBadge status={h.status} score={h.score} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {insufficient.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-xs font-medium text-ink-muted">Not enough current information (not assumed healthy)</div>
                <ul className="space-y-1 text-sm">
                  {insufficient.map(({ acc, h }) => (
                    <li key={acc.id}>
                      <Link href={`/accounts/${acc.id}#health`}>{acc.name}</Link> <span className="text-xs text-ink-muted">· {h.dataGaps[0]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title={`${t.accounts} improving`}>
            {improving.length === 0 ? (
              <p className="text-sm text-ink-muted">{`No ${t.account.toLowerCase()} improved by 5+ points in 30 days.`}</p>
            ) : (
              <ul className="space-y-2">
                {improving.slice(0, 5).map(({ acc, h, delta }) => (
                  <li key={acc.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/accounts/${acc.id}`}>{acc.name}</Link>
                    <span className="flex items-center gap-2">
                      <Trend delta={delta} />
                      <HealthBadge status={h.status} score={h.score} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {mode !== "budget" && (
          <Card id="renewals" title="Upcoming renewals" subtitle="Next 120 days">
            {renewals.length === 0 ? (
              <p className="text-sm text-ink-muted">No renewals in the next 120 days.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {renewals.map((r) => {
                  const h = a.health[r.accountId];
                  return (
                    <li key={r.contractId} className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/accounts/${r.accountId}`}>{v.account(r.accountId)}</Link>
                        <div className="text-xs text-ink-muted">
                          {fmtDate(r.renewalDate)} ({relativeDays(ws.org.demoDate, r.renewalDate)}){r.noticeDate ? ` · notice by ${fmtDate(r.noticeDate)}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums">{v.money(r.annualValue, { compact: true })}</div>
                        {h && <HealthBadge status={h.status} score={h.score} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          )}

          <Card title="Data freshness" subtitle="Simulated connectors" actions={<Link href="/integrations" className="text-xs">Details →</Link>}>
            <ul className="space-y-1.5 text-sm">
              {ws.data.connectors.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>{c.provider}</span>
                  <span className={`text-xs ${c.state === "healthy" ? "text-good" : c.state === "not_configured" ? "text-ink-muted" : "text-warn"}`}>
                    {c.state.replace("_", " ")}
                    {c.lastSuccessfulSync ? ` · ${relativeDays(ws.org.demoDate, c.lastSuccessfulSync.slice(0, 10))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {stale.length > 0 && <p className="mt-2 text-xs text-warn">Figures depending on {stale.map((c) => c.provider).join(", ")} may be incomplete.</p>}
          </Card>
        </div>
      </div>

      {fin?.scope === "company" && fin.monthly.length > 0 && mode !== "budget" && (
        <Card title={mode === "subscription" ? "Recognized revenue and direct cost by month" : "Earned revenue, direct cost and delivery margin by month"} subtitle={mode === "subscription" ? "Recognized revenue = MRR for each completed subscription month. Direct cost covers client-billed work only." : "Delivery margin = (earned revenue − direct labor, contractor and project expenses) ÷ earned revenue"} actions={<Link href="/calculations#delivery-margin" className="text-xs">Formula →</Link>}>
          <RevenueChart data={fin.monthly} symbol={sym} title="Monthly revenue and margin" />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={mode === "budget" ? "Budget problems" : "Margin problems"} subtitle={mode === "delivery" ? "Projects forecast at least 5 points below target margin" : "Initiatives forecast over approved budget"}>
          {!ws.caps.viewProjectCosts ? (
            <p className="text-sm text-ink-muted">Project costs are restricted for your role.</p>
          ) : marginItems.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <AttentionList ws={ws} items={marginItems} showCreate={false} />
          )}
        </Card>
        <Card title="Schedule problems" subtitle="Late, blocked, slipped, or waiting on approval">
          {scheduleItems.length === 0 ? <p className="text-sm text-ink-muted">None.</p> : <AttentionList ws={ws} items={scheduleItems} showCreate={false} />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts) && (
          <Card title="Overdue invoices" actions={<Link href="/finance#receivables" className="text-xs">AR aging →</Link>}>
            {a.receivables.overdue.length === 0 ? (
              <p className="text-sm text-ink-muted">No overdue invoices.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">{t.account}</th>
                    <th className="th num">Outstanding</th>
                    <th className="th num">Days overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {a.receivables.overdue.map((s) => (
                    <tr key={s.invoice.id}>
                      <td className="td">
                        <Link href={`/finance/invoices/${s.invoice.id}`}>{s.invoice.number}</Link>
                      </td>
                      <td className="td">{v.account(s.invoice.accountId)}</td>
                      <td className="td num">{v.money(s.outstanding)}</td>
                      <td className={`td num ${s.daysOverdue > 60 ? "text-bad" : s.daysOverdue > 30 ? "text-warn" : ""}`}>{s.daysOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
        <Card title="Capacity" subtitle="Planned load over the next 4 weeks" actions={<Link href="/team" className="text-xs">Team →</Link>}>
          {a.capacity.overallocated.length === 0 ? (
            <p className="text-sm text-ink-muted">Nobody is planned above capacity.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {a.capacity.overallocated.map((pc) => (
                <li key={pc.person.id} className="flex justify-between gap-2">
                  <Link href={`/team#${pc.person.id}`}>
                    {pc.person.name} <span className="text-xs text-ink-muted">({pc.person.role})</span>
                  </Link>
                  <span className="tabular-nums text-bad">peak {fmtPct(pc.upcoming.peakPct)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
            Free capacity by role (avg hours/week, next 8 weeks):{" "}
            {a.capacity.byRole
              .filter((r) => r.people > 0)
              .map((r) => `${r.role} ${Math.round(r.weeklyFree)}h`)
              .join(" · ")}
          </div>
        </Card>
        {ws.profile.modules.expansion && (
          <Card title="Expansion opportunities" subtitle="From client messages. Manual estimates are never counted as revenue." actions={<Link href="/signals?tab=opportunities" className="text-xs">All →</Link>}>
            {a.opportunities.filter((o) => o.status !== "dismissed").length === 0 ? (
              <p className="text-sm text-ink-muted">No open opportunities.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {a.opportunities
                  .filter((o) => o.status !== "dismissed")
                  .map((o) => (
                    <li key={o.id}>
                      <Link href={`/signals?tab=opportunities#${o.id}`}>
                        {v.account(o.accountId)}: {o.offering}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {o.readiness} · {o.estimatedValue !== null ? `${v.money(o.estimatedValue, { compact: true })} manual estimate` : "not estimated"}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
