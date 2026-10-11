import Link from "next/link";
import { BillingChart, CashChart, RevenueChart } from "@/components/Charts";
import { MetricCard } from "@/components/issues";
import { Card, KindTag, Notice, PageHeader, Restricted, Stat } from "@/components/ui";
import type { Metric } from "@/lib/home";
import { getWorkspace } from "@/data/session";
import { AGING_BUCKETS, DEFAULT_CASH_ASSUMPTIONS, type CashAssumptions } from "@/lib/calc/company";
import { fmtDate } from "@/lib/dates";
import { fmtHours, fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;

function cashFromParams(sp: Record<string, string | string[] | undefined>): CashAssumptions {
  const num = (k: string, d: number, min: number, max: number) => {
    const v = Number(sp[k]);
    return typeof sp[k] === "string" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
  };
  const excl = sp.exclude;
  return {
    ...DEFAULT_CASH_ASSUMPTIONS,
    weeks: num("weeks", DEFAULT_CASH_ASSUMPTIONS.weeks, 4, 26),
    collectionTiming: sp.timing === "on_due_date" ? "on_due_date" : "observed",
    excludeOverdueBeyondDays: excl === "none" ? null : typeof excl === "string" ? num("exclude", 60, 0, 365) : DEFAULT_CASH_ASSUMPTIONS.excludeOverdueBeyondDays,
    includeFutureBilling: sp.future !== "0",
    paymentTermsDays: num("terms", DEFAULT_CASH_ASSUMPTIONS.paymentTermsDays, 0, 120),
  };
}

export default async function FinancePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const cashA = cashFromParams(sp);
  const ws = await getWorkspace({ cash: cashA });
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const mode = ws.profile.modules.financeMode;
  const fin = ws.finance;
  const a = ws.analysis;
  const sym = v.money(0).replace(/[0-9.,\s]/g, "");
  const title = mode === "budget" ? "Budgets" : mode === "subscription" ? "Revenue and cash" : "Finance and profitability";

  if (!fin) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <Restricted what="Financial results, receivables and cash are available to Executive, Finance and (for their own accounts) Account owner roles." />
      </div>
    );
  }
  const s = fin.summary;
  const company = fin.scope === "company";

  if (mode === "budget") {
    const initiatives = ws.data.projects.filter((p) => p.billing === "internal");
    const units = ws.data.accounts.map((u) => {
      const ps = initiatives.filter((p) => p.accountId === u.id);
      return { u, budget: ps.reduce((x, p) => x + (p.budgetCost ?? 0), 0), toDate: ps.reduce((x, p) => x + (a.projectFin[p.id]?.cost.directToDate ?? 0), 0), forecast: ps.reduce((x, p) => x + (a.projectFin[p.id]?.cost.forecastTotal ?? 0), 0), count: ps.length };
    });
    const tot = units.reduce((x, r) => ({ budget: x.budget + r.budget, toDate: x.toDate + r.toDate, forecast: x.forecast + r.forecast }), { budget: 0, toDate: 0, forecast: 0 });
    return (
      <div className="space-y-6">
        <PageHeader title="Budgets" subtitle={`Internal initiatives are tracked against approved cost budgets. No revenue, invoicing or delivery margin applies to this profile. Figures in ${v.cur}.`} />
        {s.missing.length > 0 && (
          <Notice title="Missing data">
            <ul className="list-disc pl-5">
              {s.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Approved budget" value={v.money(tot.budget, { compact: true })} kind="observed" />
          <Stat label="Spent to date" value={v.money(tot.toDate, { compact: true })} sub={fmtPct(tot.budget ? tot.toDate / tot.budget : null) + " of budget"} kind="calculated" />
          <Stat label="Forecast at completion" value={v.money(tot.forecast, { compact: true })} kind="calculated" />
          <Stat label="Forecast variance" value={v.money(tot.forecast - tot.budget, { compact: true, sign: true })} tone={tot.forecast > tot.budget ? "bad" : "good"} kind="calculated" />
        </div>
        <Card title={`By ${t.account.toLowerCase()}`} padded={false}>
          <BudgetTable rows={units.map((r) => ({ key: r.u.id, label: <Link href={`/accounts/${r.u.id}`}>{r.u.name}</Link>, sub: `${r.count} initiatives`, budget: r.budget, toDate: r.toDate, forecast: r.forecast }))} money={v.money} />
        </Card>
        <Card title="By initiative" padded={false}>
          <BudgetTable rows={initiatives.map((p) => ({ key: p.id, label: <Link href={`/projects/${p.id}#calculation`}>{p.name}</Link>, sub: v.account(p.accountId), budget: p.budgetCost ?? 0, toDate: a.projectFin[p.id]?.cost.directToDate ?? 0, forecast: a.projectFin[p.id]?.cost.forecastTotal ?? 0 }))} money={v.money} />
        </Card>
        <Card title="Labor cost (people)" subtitle="Payroll is the loaded cost of employees; initiative labor is the share recorded on initiatives.">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Payroll in {a.period.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v.money(s.payroll)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Overhead</dt>
              <dd className="text-lg font-semibold tabular-nums">{v.money(s.overhead)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Initiative contractors and expenses</dt>
              <dd className="text-lg font-semibold tabular-nums">{v.money(s.internalContractorAndExpenses)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    );
  }

  const arr = ws.data.subscriptions.filter((x) => x.renewalDate >= ws.org.demoDate).reduce((x, y) => x + y.mrr * 12, 0);
  const clientLines = s.lines.filter((l) => l.accountId && (l.earned !== null || l.hours > 0));
  const query = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string") p.set(k, val);
    for (const [k, val] of Object.entries(patch)) p.set(k, val);
    return `/finance?${p.toString()}#cash`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          <>
            {company ? "Company-wide" : "Your accounts only (payroll, overhead and cash are restricted for your role)"} · {a.period.label} · figures in {v.cur}. Earned, invoiced and collected are separate measures. <Link href="/calculations">How each is calculated →</Link>
          </>
        }
      />
      {s.missing.length > 0 && (
        <Notice title="Missing or partial data">
          <ul className="list-disc pl-5">
            {s.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      )}

      {(() => {
        const scope = company ? "Company-wide" : "Your accounts";
        const period = `${a.period.label.replace(/ \(.*\)$/, "")} · ${fmtDate(a.period.start, { year: false })} – ${fmtDate(a.period.end)}`;
        const asOf = `As of ${fmtDate(ws.org.demoDate)}`;
        const costWarn = s.missing.length ? [{ label: "Incomplete costs", detail: s.missing.join(" ") }] : [];
        const arWarn = ws.sources.filter((x) => x.affects.some((y) => /receivable/i.test(y))).map((x) => ({ label: "Source out of date", detail: x.summary }));
        const results: Metric[] = [
          ...(mode === "subscription" ? [{ label: "Annual recurring revenue", value: v.money(arr, { compact: true }), scope, period: asOf, time: "current" as const, kind: "calculated" as const, sub: "Active subscriptions × 12", warnings: [], calcHref: "/calculations#earned" }] : []),
          { label: mode === "subscription" ? "Recognized revenue" : "Earned revenue", value: v.money(s.earnedRevenue, { compact: true }), scope, period, time: "historical", kind: "calculated", sub: mode === "subscription" ? "Subscription months in the period" : "Value of work performed, whether or not invoiced", warnings: [], calcHref: "/calculations#earned" },
          ...(mode === "delivery" ? [{ label: "Delivery margin", value: fmtPct(s.deliveryMargin), scope, period, time: "historical" as const, kind: "calculated" as const, sub: `Before overhead · target ${fmtPct(ws.org.defaultTargetMargin)} · ${v.money(s.deliveryProfit, { compact: true })} delivery profit`, warnings: costWarn, calcHref: "#reconciliation", tone: s.deliveryMargin !== null && s.deliveryMargin < ws.org.defaultTargetMargin ? ("warn" as const) : undefined }] : []),
          ...(company ? [{ label: "Operating result", value: v.money(s.operatingResult, { compact: true }), scope, period, time: "historical" as const, kind: "calculated" as const, sub: "After all payroll, internal costs and overhead", warnings: costWarn, calcHref: "#reconciliation", tone: s.operatingResult < 0 ? ("bad" as const) : undefined }] : []),
        ];
        const billing: Metric[] = [
          { label: "Invoiced", value: v.money(s.invoiced, { compact: true }), scope, period, time: "historical", kind: "observed", sub: "Invoices issued in the period", warnings: arWarn },
          { label: "Collected", value: v.money(s.collected, { compact: true }), scope, period, time: "historical", kind: "observed", sub: "Payments received in the period", warnings: arWarn },
          { label: "Outstanding receivables", value: v.money(a.receivables.totalOutstanding, { compact: true }), scope, period: asOf, time: "current", kind: "observed", sub: `${v.money(a.receivables.totalOverdue, { compact: true })} overdue`, warnings: arWarn, href: "#receivables", tone: a.receivables.totalOverdue > 0 ? "warn" : undefined },
          ...(fin.cash ? [{ label: "Cash low point", value: v.money(fin.cash.lowPoint.closing, { compact: true }), scope, period: `Next ${fin.cash.weeks.length} weeks · week of ${fmtDate(fin.cash.lowPoint.weekStart, { year: false })}`, time: "forecast" as const, kind: "calculated" as const, sub: "Base case; change the assumptions below", warnings: arWarn, href: "#cash", tone: fin.cash.lowPoint.closing < 0 ? ("bad" as const) : undefined }] : []),
        ];
        return (
          <>
            <section aria-labelledby="results-title" className="space-y-3">
              <h2 id="results-title" className="text-lg font-semibold tracking-tight">
                Results for {a.period.label}
              </h2>
              <div className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${results.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
                {results.map((m) => (
                  <MetricCard key={m.label} m={m} />
                ))}
              </div>
              {company && mode === "delivery" && (
                <p className="max-w-3xl text-sm text-ink-soft">
                  <strong className="font-medium text-ink">Why a {fmtPct(s.deliveryMargin)} margin leaves {v.money(s.operatingResult, { compact: true })}:</strong> delivery margin only counts the direct cost of client work. Payroll for time not spent on clients ({v.money(s.nonClientLabor, { compact: true })}), internal work ({v.money(s.internalContractorAndExpenses, { compact: true })}) and overhead ({v.money(s.overhead, { compact: true })}) come out afterwards. <Link href="#reconciliation">View calculation</Link>
                </p>
              )}
            </section>
            <section aria-labelledby="cashflow-title" className="space-y-3">
              <h2 id="cashflow-title" className="text-lg font-semibold tracking-tight">
                Billing and cash
              </h2>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
                {billing.map((m) => (
                  <MetricCard key={m.label} m={m} />
                ))}
              </div>
            </section>
          </>
        );
      })()}

      {company && fin.monthly.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={mode === "subscription" ? "Revenue and direct cost by month" : "Earned revenue, direct cost and margin by month"}>
            <RevenueChart data={fin.monthly} symbol={sym} title="Earned revenue vs direct cost by month" stacked />
          </Card>
          <Card id="billing" title="Earned vs invoiced vs collected" subtitle="Timing differences are work in progress (earned, not invoiced) and receivables (invoiced, not collected)">
            <BillingChart data={fin.monthly} symbol={sym} />
          </Card>
        </div>
      )}

      {company && (
        <Card id="reconciliation" title="Calculation: from delivery margin to operating result" subtitle="Employee salaries are counted once. Labor recorded on client work is part of delivery cost; the remainder of payroll is shown separately." actions={<KindTag kind="calculated" />}>
          <table className="w-full max-w-2xl">
            <tbody>
              {mode === "delivery" ? (
                <>
                  <RecRow label="Earned revenue (client projects)" value={v.money(s.projectRevenue)} />
                  {s.subscriptionRevenue > 0 && <RecRow label="Subscription revenue" value={v.money(s.subscriptionRevenue)} />}
                  <RecRow label="− Direct cost of client work (labor, contractors, project expenses)" value={v.money(-s.clientDirectCost)} />
                  <RecRow label={`= Delivery profit (${fmtPct(s.deliveryMargin, 1)} delivery margin)`} value={v.money(s.deliveryProfit + s.subscriptionRevenue)} strong />
                </>
              ) : (
                <>
                  <RecRow label="Recognized subscription revenue" value={v.money(s.subscriptionRevenue)} />
                  {s.projectRevenue > 0 && <RecRow label="Project / services revenue" value={v.money(s.projectRevenue)} />}
                  <RecRow label="− Direct cost of client work" value={v.money(-s.clientDirectCost)} />
                  <RecRow label="= Gross contribution" value={v.money(s.earnedRevenue - s.clientDirectCost)} strong />
                </>
              )}
              <RecRow label="− Employee labor not on client work (internal, bench, leave, admin)" value={v.money(-s.nonClientLabor)} />
              <RecRow label="− Contractors and expenses on internal work" value={v.money(-s.internalContractorAndExpenses)} />
              <RecRow label="− Overhead (rent, software, admin)" value={v.money(-s.overhead)} />
              <RecRow label="= Operating result (simplified)" value={v.money(s.operatingResult)} strong />
              <tr>
                <td className="td text-xs text-ink-muted" colSpan={2}>
                  Check: total payroll {v.money(s.payroll)} = client labor {v.money(s.absorbedEmployeeLabor)} + non-client labor {v.money(s.nonClientLabor)}.
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {mode === "delivery" && (() => {
        const rows = ws.data.projects.flatMap((p) => (a.projectFin[p.id]?.unbilled.items ?? []).map((u) => ({ p, u })));
        if (!rows.length) return null;
        return (
          <Card id="unbilled" title="Unbilled work" subtitle={`Delivered but not invoiced or not yet priced, as of ${fmtDate(ws.org.demoDate)}. Valued at bill rates; not revenue until agreed.`} actions={<KindTag kind="calculated" />}>
            <ul className="divide-y divide-line text-sm">
              {rows.map(({ p, u }, n) => (
                <li key={n} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <Link href={`/projects/${p.id}?tab=financials`}>{p.name}</Link>
                    <span className="block text-xs text-ink-muted">{u.label}</span>
                  </span>
                  <span className="tabular-nums">
                    {v.money(u.value, { compact: true })} <span className="text-xs text-ink-muted">· {fmtHours(u.hours)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}

      <Card id="receivables" title="Accounts receivable aging" subtitle={`As of ${fmtDate(ws.org.demoDate, { year: true })}`} padded={false}>
        <div className="grid grid-cols-2 border-b border-line sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <div key={b} className="border-b border-r border-line p-3 last:border-r-0 sm:border-b-0">
              <div className="text-xs text-ink-muted">{b === "current" ? "Not yet due" : `${b} days`}</div>
              <div className={`text-lg font-semibold tabular-nums ${b === "61-90" || b === "90+" ? (a.receivables.buckets[b] > 0 ? "text-bad" : "") : b !== "current" && a.receivables.buckets[b] > 0 ? "text-warn" : ""}`}>{v.money(a.receivables.buckets[b], { compact: true })}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="th">Invoice</th>
                <th className="th">{t.account}</th>
                <th className="th">Due</th>
                <th className="th num">Amount</th>
                <th className="th num">Outstanding</th>
                <th className="th num">Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {a.receivables.open.map((x) => (
                <tr key={x.invoice.id}>
                  <td className="td">
                    <Link href={`/finance/invoices/${x.invoice.id}`}>{x.invoice.number}</Link>
                  </td>
                  <td className="td">
                    <Link href={`/accounts/${x.invoice.accountId}`}>{v.account(x.invoice.accountId)}</Link>
                  </td>
                  <td className="td text-xs">{fmtDate(x.invoice.dueDate)}</td>
                  <td className="td num">{v.money(x.invoice.amount)}</td>
                  <td className="td num">{v.money(x.outstanding)}</td>
                  <td className={`td num ${x.daysOverdue > 60 ? "text-bad" : x.daysOverdue > 0 ? "text-warn" : ""}`}>{x.daysOverdue || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {fin.cash && (
        <Card id="cash" title={`${fin.cash.assumptions.weeks}-week cash forecast`} subtitle={`Opening balance ${v.money(fin.cash.opening.amount)} observed on ${fmtDate(fin.cash.opening.date, { year: true })}. Change assumptions to see the effect; nothing is saved.`}>
          <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-canvas p-3" action="/finance#cash">
            <div>
              <label className="label" htmlFor="weeks">Weeks</label>
              <input id="weeks" name="weeks" type="number" min={4} max={26} className="input w-20" defaultValue={cashA.weeks} />
            </div>
            <div>
              <label className="label" htmlFor="timing">Collection timing</label>
              <select id="timing" name="timing" className="input" defaultValue={cashA.collectionTiming}>
                <option value="observed">Each client&apos;s observed lateness</option>
                <option value="on_due_date">Everyone pays on the due date</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="exclude">Exclude invoices overdue more than</label>
              <select id="exclude" name="exclude" className="input" defaultValue={cashA.excludeOverdueBeyondDays === null ? "none" : String(cashA.excludeOverdueBeyondDays)}>
                <option value="30">30 days</option>
                <option value="60">60 days (default)</option>
                <option value="90">90 days</option>
                <option value="none">Include all</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="future">Future billing</label>
              <select id="future" name="future" className="input" defaultValue={cashA.includeFutureBilling ? "1" : "0"}>
                <option value="1">Include scheduled billing</option>
                <option value="0">Open invoices only</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="terms">Payment terms (days)</label>
              <input id="terms" name="terms" type="number" min={0} max={120} className="input w-20" defaultValue={cashA.paymentTermsDays} />
            </div>
            <button className="btn btn-primary">Recalculate</button>
            <Link href="/finance#cash" className="btn">
              Defaults
            </Link>
          </form>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Projected inflows" value={v.money(fin.cash.totals.inflows, { compact: true })} kind="calculated" />
            <Stat label="Projected outflows" value={v.money(fin.cash.totals.outflows, { compact: true })} kind="calculated" />
            <Stat label="Low point" value={v.money(fin.cash.lowPoint.closing, { compact: true })} sub={`Week of ${fmtDate(fin.cash.lowPoint.weekStart)}`} tone={fin.cash.lowPoint.closing < 0 ? "bad" : undefined} kind="calculated" />
            <Stat label="Closing balance" value={v.money(fin.cash.weeks.at(-1)?.closing, { compact: true })} kind="calculated" />
          </div>
          <CashChart data={fin.cash.weeks.map((w) => ({ week: fmtDate(w.weekStart), closing: Math.round(w.closing), inflows: Math.round(w.inflows), outflows: Math.round(w.outflows) }))} symbol={sym} />
          {fin.cash.excluded.length > 0 && (
            <div className="mt-3">
              <Notice title="Excluded from this forecast">
                <ul className="list-disc pl-5">
                  {fin.cash.excluded.map((x) => (
                    <li key={x.invoiceId}>
                      <Link href={`/finance/invoices/${x.invoiceId}`}>{ws.data.invoices.find((i) => i.id === x.invoiceId)?.number}</Link> ({v.money(x.amount)}): {x.reason}.{" "}
                      <Link href={query({ exclude: "none" })}>Include it</Link>
                    </li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">Weekly detail and assumptions</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
              {fin.cash.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li>Collections: {cashA.collectionTiming === "observed" ? "each account's average days late on paid invoices (never earlier than due)" : "on the due date"}; overdue invoices within the threshold are assumed collected one week from today at the earliest.</li>
              <li>Payroll on day {cashA.payrollDayOfMonth} of each month; contractors paid {cashA.contractorPaymentLagDays} days after month end from planned hours.</li>
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className="th">Week of</th>
                    <th className="th num">Opening</th>
                    <th className="th num">In</th>
                    <th className="th num">Out</th>
                    <th className="th num">Closing</th>
                    <th className="th">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {fin.cash.weeks.map((w) => (
                    <tr key={w.weekStart}>
                      <td className="td text-xs">{fmtDate(w.weekStart)}</td>
                      <td className="td num">{v.money(w.opening, { compact: true })}</td>
                      <td className="td num text-good">{v.money(w.inflows, { compact: true })}</td>
                      <td className="td num">{v.money(-w.outflows, { compact: true })}</td>
                      <td className={`td num ${w.closing < 0 ? "text-bad" : ""}`}>{v.money(w.closing, { compact: true })}</td>
                      <td className="td text-[11px] text-ink-soft">{w.items.map((i) => `${i.label} ${v.money(i.amount, { compact: true, sign: true })}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}

      {fin.concentration && fin.concentration.rows.length > 0 && (
        <Card title="Revenue concentration" subtitle={`Share of ${mode === "subscription" ? "recognized" : "earned"} revenue in ${a.period.label}`}>
          <div className="mb-3 flex flex-wrap gap-6 text-sm">
            <span>
              Largest {t.account.toLowerCase()} <strong className={fin.concentration.top1 > 0.25 ? "text-warn" : ""}>{fmtPct(fin.concentration.top1)}</strong>
            </span>
            <span>
              Top three <strong className={fin.concentration.top3 > 0.6 ? "text-warn" : ""}>{fmtPct(fin.concentration.top3)}</strong>
            </span>
          </div>
          <ul className="space-y-1.5">
            {fin.concentration.rows.map((r) => (
              <li key={r.accountId} className="grid grid-cols-[160px_1fr_90px_50px] items-center gap-3 text-sm">
                <Link href={`/accounts/${r.accountId}`} className="truncate">
                  {v.account(r.accountId)}
                </Link>
                <div className="h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.round(r.share * 100)}%` }} />
                </div>
                <span className="text-right tabular-nums">{v.money(r.revenue, { compact: true })}</span>
                <span className="text-right text-xs tabular-nums text-ink-muted">{fmtPct(r.share)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {clientLines.length > 0 && (
        <Card title={`By ${t.project.toLowerCase()} in ${a.period.label}`} padded={false} subtitle="The lines below sum to the period totals above">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">{t.project}</th>
                  <th className="th num">Hours</th>
                  <th className="th num">Earned</th>
                  <th className="th num">Labor</th>
                  <th className="th num">Contractors</th>
                  <th className="th num">Expenses</th>
                  <th className="th num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {clientLines.map((l) => {
                  const cost = l.labor + l.contractor + l.expenses;
                  return (
                    <tr key={l.projectId}>
                      <td className="td">
                        <Link href={`/projects/${l.projectId}#calculation`}>{v.project(l.projectId)}</Link>
                        <div className="text-xs text-ink-muted">{v.account(l.accountId)}</div>
                      </td>
                      <td className="td num">{fmtHours(l.hours)}</td>
                      <td className="td num">{v.money(l.earned)}</td>
                      <td className="td num">{v.money(l.labor)}</td>
                      <td className="td num">{v.money(l.contractor)}</td>
                      <td className="td num">{v.money(l.expenses)}</td>
                      <td className="td num">{l.earned ? fmtPct((l.earned - cost) / l.earned) : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="td">Total</td>
                  <td className="td num">{fmtHours(clientLines.reduce((x, l) => x + l.hours, 0))}</td>
                  <td className="td num">{v.money(clientLines.reduce((x, l) => x + (l.earned ?? 0), 0))}</td>
                  <td className="td num">{v.money(clientLines.reduce((x, l) => x + l.labor, 0))}</td>
                  <td className="td num">{v.money(clientLines.reduce((x, l) => x + l.contractor, 0))}</td>
                  <td className="td num">{v.money(clientLines.reduce((x, l) => x + l.expenses, 0))}</td>
                  <td className="td num">{fmtPct(s.deliveryMargin)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RecRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="td">{label}</td>
      <td className="td num">{value}</td>
    </tr>
  );
}

function BudgetTable({ rows, money }: { rows: { key: string; label: React.ReactNode; sub: string; budget: number; toDate: number; forecast: number }[]; money: (n: number, o?: { compact?: boolean; sign?: boolean }) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr>
            <th className="th">Name</th>
            <th className="th num">Budget</th>
            <th className="th num">Spent to date</th>
            <th className="th num">Forecast</th>
            <th className="th num">Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="td">
                {r.label}
                <div className="text-xs text-ink-muted">{r.sub}</div>
              </td>
              <td className="td num">{money(r.budget)}</td>
              <td className="td num">{money(r.toDate)}</td>
              <td className="td num">{money(r.forecast)}</td>
              <td className={`td num ${r.forecast > r.budget ? "text-bad" : "text-good"}`}>{money(r.forecast - r.budget, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
