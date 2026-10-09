import Link from "next/link";
import { Card, EmptyState, HealthBadge, PageHeader, Trend } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { fmtPct } from "@/lib/money";
import { CATEGORY_LABEL } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const owner = typeof sp.owner === "string" ? sp.owner : "all";
  const sort = typeof sp.sort === "string" ? sp.sort : "health";

  const rows = ws.data.accounts.map((acc) => {
    const h = a.health[acc.id];
    const prev = a.healthPrev[acc.id];
    const projects = ws.data.projects.filter((p) => p.accountId === acc.id && p.status !== "completed");
    const revenue = ws.finance?.summary.lines.filter((l) => l.accountId === acc.id).reduce((s, l) => s + (l.earned ?? 0), 0) ?? null;
    const sub = ws.data.subscriptions.find((s) => s.accountId === acc.id);
    const cost = ws.finance?.summary.lines.filter((l) => l.accountId === acc.id).reduce((s, l) => s + l.labor + l.contractor + l.expenses, 0) ?? null;
    const margin = revenue && cost !== null ? (revenue - cost) / revenue : null;
    const overdue = a.receivables.overdue.filter((s) => s.invoice.accountId === acc.id).reduce((s, x) => s + x.outstanding, 0);
    const risks = a.signals.filter((s) => s.accountId === acc.id && s.polarity === "risk" && !s.autoResolved && s.review.status !== "dismissed" && s.review.status !== "resolved");
    const renewal = a.renewals.find((r) => r.accountId === acc.id);
    const budget = ws.data.projects.filter((p) => p.accountId === acc.id && p.billing === "internal").reduce((s, p) => s + (p.budgetCost ?? 0), 0);
    return { acc, h, delta: h?.score !== null && h?.score !== undefined && prev !== null && prev !== undefined ? h.score - prev : null, projects, revenue, margin, overdue, risks, renewal, sub, budget };
  });

  const filtered = rows
    .filter((r) => !q || r.acc.name.toLowerCase().includes(q) || r.acc.aliases.some((x) => x.toLowerCase().includes(q)) || r.acc.industry.toLowerCase().includes(q))
    .filter((r) => (status === "all" ? true : status === "risk" ? r.h?.status === "at_risk" || r.h?.status === "watch" : r.h?.status === status))
    .filter((r) => (owner === "all" ? true : r.acc.ownerId === owner))
    .sort((x, y) => {
      if (sort === "name") return x.acc.name.localeCompare(y.acc.name);
      if (sort === "revenue") return (y.revenue ?? y.sub?.mrr ?? 0) - (x.revenue ?? x.sub?.mrr ?? 0);
      if (sort === "renewal") return (x.renewal?.renewalDate ?? "9999").localeCompare(y.renewal?.renewalDate ?? "9999");
      return (x.h?.status === "insufficient" ? -1 : x.h?.score ?? 101) - (y.h?.status === "insufficient" ? -1 : y.h?.score ?? 101);
    });
  const owners = [...new Set(ws.data.accounts.map((x) => x.ownerId))];
  const mode = ws.profile.modules.financeMode;

  return (
    <div className="space-y-6">
      <PageHeader title={t.accounts} subtitle={`${ws.data.accounts.length} ${t.accounts.toLowerCase()}. Health is a transparent weighted score; open any ${t.account.toLowerCase()} to see the factors behind it.`} />
      <form className="card flex flex-wrap items-end gap-3 p-3" role="search" aria-label={`Filter ${t.accounts.toLowerCase()}`}>
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="Name, alias or industry" />
        </div>
        <div>
          <label className="label" htmlFor="status">Health</label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="all">All</option>
            <option value="risk">At risk or watch</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="healthy">Healthy</option>
            <option value="insufficient">Insufficient data</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="owner">{t.owner}</label>
          <select id="owner" name="owner" className="input" defaultValue={owner}>
            <option value="all">All</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {v.person(o)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" className="input" defaultValue={sort}>
            <option value="health">Health (worst first)</option>
            <option value="name">Name</option>
            <option value="revenue">{mode === "subscription" ? "MRR" : "Revenue in period"}</option>
            <option value="renewal">Next renewal</option>
          </select>
        </div>
        <button className="btn btn-primary">Apply</button>
        {(q || status !== "all" || owner !== "all" || sort !== "health") && (
          <Link href="/accounts" className="btn">
            Clear
          </Link>
        )}
      </form>

      <Card padded={false} title={`${filtered.length} of ${rows.length} shown`}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No matches">Try clearing filters.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="th">{t.account}</th>
                  <th className="th">Health</th>
                  <th className="th">{t.owner}</th>
                  <th className="th num">Active {t.projects.toLowerCase()}</th>
                  {mode === "delivery" && ws.finance && <th className="th num">Earned ({a.period.key === "quarter" ? "quarter" : "period"})</th>}
                  {mode === "delivery" && ws.finance && <th className="th num">Delivery margin</th>}
                  {mode === "subscription" && <th className="th num">MRR</th>}
                  {mode === "subscription" && <th className="th num">Seat use</th>}
                  {mode === "budget" && <th className="th num">Initiative budget</th>}
                  {ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts) && <th className="th num">Overdue</th>}
                  <th className="th">Open risks</th>
                  <th className="th">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const lastSeats = r.sub?.activeSeatsByMonth.at(-1);
                  return (
                    <tr key={r.acc.id} className="hover:bg-canvas/60">
                      <td className="td">
                        <Link href={`/accounts/${r.acc.id}`} className="font-medium">
                          {r.acc.name}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {r.acc.industry}
                          {r.acc.segment ? ` · ${r.acc.segment}` : ""}
                        </div>
                      </td>
                      <td className="td">
                        {r.h && <HealthBadge status={r.h.status} score={r.h.score} />}
                        <div className="mt-0.5">
                          <Trend delta={r.delta} />
                        </div>
                      </td>
                      <td className="td">{v.person(r.acc.ownerId)}</td>
                      <td className="td num">{r.projects.length}</td>
                      {mode === "delivery" && ws.finance && <td className="td num">{v.money(r.revenue, { compact: true })}</td>}
                      {mode === "delivery" && ws.finance && <td className={`td num ${r.margin !== null && r.margin < 0.3 ? "text-bad" : ""}`}>{fmtPct(r.margin)}</td>}
                      {mode === "subscription" && <td className="td num">{r.sub ? v.money(r.sub.mrr) : "—"}</td>}
                      {mode === "subscription" && <td className="td num">{r.sub ? (lastSeats === null || lastSeats === undefined ? <span className="text-ink-muted">no data</span> : `${lastSeats}/${r.sub.seats}`) : "—"}</td>}
                      {mode === "budget" && <td className="td num">{v.money(r.budget, { compact: true })}</td>}
                      {ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts) && <td className={`td num ${r.overdue > 0 ? "text-warn" : ""}`}>{r.overdue > 0 ? v.money(r.overdue, { compact: true }) : "—"}</td>}
                      <td className="td text-xs">{r.risks.length ? r.risks.map((s) => CATEGORY_LABEL[s.category]).join(", ") : <span className="text-ink-muted">None</span>}</td>
                      <td className="td text-xs">{r.renewal ? fmtDate(r.renewal.renewalDate) : <span className="text-ink-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
