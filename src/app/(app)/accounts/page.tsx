import Link from "next/link";
import { FilterForm, Presets } from "@/components/filters";
import { LevelBadge } from "@/components/status";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { buildIssues } from "@/lib/issues";
import { fmtPct } from "@/lib/money";
import { aggregateScope } from "@/lib/permissions";
import { viewHelpers } from "@/lib/view";
import { ACCOUNT_VIEWS, type AccountRow, type AccountView, accountRows, inAccountView, parseView, RENEWAL_WINDOW_DAYS, STATUS_RANK } from "@/lib/views";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const q = str("q", "").trim().toLowerCase();
  const status = str("status", "all");
  const owner = str("owner", "all");
  const view = parseView(ACCOUNT_VIEWS, sp.view);
  const sort = str("sort", view === "renewals" ? "renewal" : "status");
  const mode = ws.profile.modules.financeMode;
  const showOverdue = ws.profile.modules.invoices && ws.caps.viewCommercialTerms;
  const rows = accountRows(ws, buildIssues(ws));
  const inView = (r: AccountRow, vw: AccountView | null) => inAccountView(r, vw, ws.user.id);

  const filtered = rows
    .filter((r) => inView(r, view))
    .filter((r) => !q || r.acc.name.toLowerCase().includes(q) || r.acc.aliases.some((x) => x.toLowerCase().includes(q)) || r.acc.industry.toLowerCase().includes(q))
    .filter((r) => (status === "all" ? true : status === "risk" ? r.it.overall === "at_risk" || r.it.overall === "watch" : r.it.overall === status))
    .filter((r) => (owner === "all" ? true : r.acc.ownerId === owner))
    .sort((x, y) => {
      if (sort === "name") return x.acc.name.localeCompare(y.acc.name);
      if (sort === "revenue") return (y.revenue ?? y.sub?.mrr ?? 0) - (x.revenue ?? x.sub?.mrr ?? 0);
      if (sort === "renewal") return (x.renewal?.renewalDate ?? "9999").localeCompare(y.renewal?.renewalDate ?? "9999");
      if (sort === "overdue") return y.overdue - x.overdue;
      return STATUS_RANK[x.it.overall] - STATUS_RANK[y.it.overall] || y.urgent.length - x.urgent.length || y.own.length - x.own.length || x.acc.name.localeCompare(y.acc.name);
    });
  const owners = [...new Set(ws.data.accounts.map((x) => x.ownerId))];
  const ownsAny = rows.some((r) => r.acc.ownerId === ws.user.id);

  const presets = [
    { label: "All", href: "/accounts", active: !view, count: rows.length },
    ...(ws.caps.allAccounts && ownsAny ? [{ label: `My ${t.accounts.toLowerCase()}`, href: "/accounts?view=mine", active: view === "mine", count: rows.filter((r) => inView(r, "mine")).length }] : []),
    { label: "Needs attention", href: "/accounts?view=attention", active: view === "attention", count: rows.filter((r) => inView(r, "attention")).length },
    ...(mode !== "budget" ? [{ label: "Renewals soon", href: "/accounts?view=renewals", active: view === "renewals", count: rows.filter((r) => inView(r, "renewals")).length }] : []),
    ...(showOverdue ? [{ label: "Overdue collections", href: "/accounts?view=overdue", active: view === "overdue", count: rows.filter((r) => inView(r, "overdue")).length }] : []),
  ];
  const filtersActive = q || status !== "all" || owner !== "all";
  const renewalText = (r: (typeof rows)[number]) => (r.renewal && r.renewalDays !== null ? `${fmtDate(r.renewal.renewalDate)} · in ${r.renewalDays} days` : null);
  const money = (n: number | null) => v.money(n, { compact: true });

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={aggregateScope(ws.caps)} title={t.accounts} subtitle={`Status is judged per dimension; open a ${t.account.toLowerCase()} to see why.`} />
      <Presets label={`${t.accounts} views`} items={presets} />
      <FilterForm label={`Filter ${t.accounts.toLowerCase()}`} defaults={{ sort: view === "renewals" ? "renewal" : "status" }}>
        {view && <input type="hidden" name="view" value={view} />}
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Name, alias or industry, then Enter" />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="all">All</option>
            <option value="risk">At risk or watch</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="good">Good</option>
            <option value="unknown">Not enough data</option>
          </select>
        </div>
        {ws.caps.allAccounts && (
          <div>
            <label className="label" htmlFor="owner">
              {t.owner}
            </label>
            <select id="owner" name="owner" className="input" defaultValue={owner}>
              <option value="all">All</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {v.person(o)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="sort">
            Sort by
          </label>
          <select id="sort" name="sort" className="input" defaultValue={sort}>
            <option value="status">Status (worst first)</option>
            <option value="name">Name</option>
            {mode !== "budget" && ws.caps.viewProjectCosts && <option value="revenue">{mode === "subscription" ? "MRR" : "Revenue in period"}</option>}
            {mode !== "budget" && <option value="renewal">Next renewal</option>}
            {showOverdue && <option value="overdue">Overdue amount</option>}
          </select>
        </div>
        <noscript>
          <button className="btn btn-primary">Apply</button>
        </noscript>
        {filtersActive && (
          <Link href={view ? `/accounts?view=${view}` : "/accounts"} className="btn">
            Clear filters
          </Link>
        )}
      </FilterForm>

      <Card padded={false} title={`${filtered.length} of ${rows.length} shown`} subtitle={mode === "delivery" && ws.finance ? `Earned and margin: ${a.period.label}` : undefined}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No matches">{filtersActive ? "Try clearing filters." : `No ${t.accounts.toLowerCase()} in this view.`}</EmptyState>
          </div>
        ) : (
          <>
            {/* Phones: one card per client with the situation first. */}
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((r) => (
                <li key={r.acc.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/accounts/${r.acc.id}`} className="font-medium">
                      {r.acc.name}
                    </Link>
                    <LevelBadge level={r.it.overall}>{r.it.overallLabel}</LevelBadge>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{r.own[0]?.title ?? r.it.headline}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {[
                      v.person(r.acc.ownerId),
                      r.own.length ? `${r.own.length} open issue${r.own.length === 1 ? "" : "s"}` : null,
                      showOverdue && r.overdue > 0 ? `${money(r.overdue)} overdue` : null,
                      renewalText(r) ? `Renews ${renewalText(r)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr>
                    <th className="th">{t.account}</th>
                    <th className="th">Status</th>
                    <th className="th">Main issue</th>
                    <th className="th">{t.owner}</th>
                    {mode === "delivery" && ws.finance && <th className="th num">Earned</th>}
                    {mode === "delivery" && ws.finance && <th className="th num">Delivery margin</th>}
                    {mode === "subscription" && ws.caps.viewCommercialTerms && <th className="th num">MRR</th>}
                    {mode === "subscription" && <th className="th num">Seat use</th>}
                    {mode === "budget" && ws.caps.viewProjectCosts && <th className="th num">Initiative budget</th>}
                    {showOverdue && <th className="th num">Overdue</th>}
                    {mode !== "budget" && <th className="th">Renewal</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const lastSeats = r.sub?.activeSeatsByMonth.at(-1);
                    return (
                      <tr key={r.acc.id} className="hover:bg-canvas/60">
                        <td className="td min-w-[180px]">
                          <Link href={`/accounts/${r.acc.id}`} className="font-medium">
                            {r.acc.name}
                          </Link>
                          <div className="text-xs text-ink-muted">
                            {r.acc.industry}
                            {r.acc.segment ? ` · ${r.acc.segment}` : ""}
                            {` · ${r.projects.length} active ${(r.projects.length === 1 ? t.project : t.projects).toLowerCase()}`}
                          </div>
                        </td>
                        <td className="td whitespace-nowrap">
                          <LevelBadge level={r.it.overall}>{r.it.overallLabel}</LevelBadge>
                        </td>
                        <td className="td min-w-[220px] text-sm">
                          {r.own[0] ? (
                            <>
                              <Link href={`/issues#${r.own[0].id}`} className="text-ink hover:text-accent">
                                {r.own[0].title}
                              </Link>
                              {r.own.length > 1 && <span className="text-xs text-ink-muted"> +{r.own.length - 1} more</span>}
                            </>
                          ) : (
                            <span className="text-ink-muted">{r.it.overall === "good" ? "None open" : r.it.overall === "unknown" ? "Not enough data to judge" : r.it.headline}</span>
                          )}
                        </td>
                        <td className="td whitespace-nowrap">{v.person(r.acc.ownerId)}</td>
                        {mode === "delivery" && ws.finance && <td className="td num">{money(r.revenue)}</td>}
                        {mode === "delivery" && ws.finance && <td className={`td num ${r.margin !== null && r.margin < 0 ? "text-bad" : ""}`}>{fmtPct(r.margin)}</td>}
                        {mode === "subscription" && ws.caps.viewCommercialTerms && <td className="td num">{r.sub ? v.money(r.sub.mrr) : "—"}</td>}
                        {mode === "subscription" && <td className="td num">{r.sub ? lastSeats === null || lastSeats === undefined ? <span className="text-ink-muted">No data</span> : `${lastSeats} of ${r.sub.seats}` : "—"}</td>}
                        {mode === "budget" && ws.caps.viewProjectCosts && <td className="td num">{money(r.budget)}</td>}
                        {showOverdue && <td className={`td num ${r.overdue > 0 ? "text-warn" : ""}`}>{r.overdue > 0 ? money(r.overdue) : "—"}</td>}
                        {mode !== "budget" && (
                          <td className="td whitespace-nowrap text-sm">
                            {r.renewal && r.renewalDays !== null ? (
                              <>
                                {fmtDate(r.renewal.renewalDate)}
                                <div className={`text-xs ${r.renewalRisk && r.renewalDays <= RENEWAL_WINDOW_DAYS ? "font-medium text-bad" : "text-ink-muted"}`}>
                                  in {r.renewalDays} days{r.renewalRisk && r.renewalDays <= RENEWAL_WINDOW_DAYS ? " · at risk" : ""}
                                </div>
                              </>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      {mode === "delivery" && ws.finance && (
        <p className="hidden text-xs text-ink-muted md:block">Earned revenue and delivery margin are for {a.period.label}, before overhead. Delivery margin covers direct labor, contractors and project expenses only.</p>
      )}
    </div>
  );
}
