import Link from "next/link";
import { Badge, Card, EmptyState, KindTag, Notice, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { isDeliveryRole } from "@/lib/calc/capacity";
import { billRateOn } from "@/lib/calc/finance";
import { fmtDate } from "@/lib/dates";
import { viewHelpers } from "@/lib/view";

/**
 * Bill rates and cost rates, split out of Capacity so that the capacity view
 * carries hours only. Bill rates need project financial access; cost rates
 * and loaded cost need compensation access, which the data layer enforces.
 */
export default async function RatesPage() {
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const today = ws.org.demoDate;

  if (!ws.caps.viewProjectCosts) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Delivery" title="Rates and costs" />
        <EmptyState title="Not available for your role">
          Bill rates and cost rates are financial data. See <Link href="/team">Capacity</Link> for hours and planned load.
        </EmptyState>
      </div>
    );
  }

  const people = ws.data.people.filter(isDeliveryRole).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const rows = people.map((p) => {
    const history = ws.data.billRates.filter((r) => r.personId === p.id && r.effectiveFrom <= today).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
    const bill = billRateOn(ws.data, p.id, today);
    const cost = ws.personCosts?.[p.id] ?? null;
    const spread = bill !== null && cost?.hourlyCost != null ? bill - cost.hourlyCost : null;
    return { p, bill, current: history[0], previous: history[1], cost, spread };
  });
  const missingBill = rows.filter((r) => r.bill === null).length;
  const missingCost = ws.personCosts ? rows.filter((r) => r.cost?.hourlyCost == null).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Delivery" title="Rates and costs" subtitle={`Rates in effect on ${fmtDate(today, { year: true })}. Hours and planned load are on Capacity.`} actions={<Link href="/team">Capacity →</Link>} />
      {!ws.personCosts && <Notice tone="info">Cost rates come from individual compensation, which your role cannot see. Only bill rates are shown.</Notice>}
      {(missingBill > 0 || missingCost > 0) && (
        <Notice title="Incomplete rates">
          {[
            missingBill ? `${missingBill} ${missingBill === 1 ? "person has" : "people have"} no bill rate, so their billable hours are not valued.` : "",
            missingCost ? `${missingCost} ${missingCost === 1 ? "person has" : "people have"} no cost rate, so project costs that include them are understated.` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </Notice>
      )}

      <Card title="People" padded={false} subtitle={ws.personCosts ? "Cost per hour = salary + employer costs ÷ annual working hours × FTE. Contractors use their contracted rate." : undefined} actions={<KindTag kind="observed" />}>
        <ul className="divide-y divide-line">
          <li aria-hidden="true" className="hidden px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-[1.6fr_1fr_1fr_1fr] sm:gap-3">
            <span>Person</span>
            <span className="text-right">Bill rate</span>
            <span className="text-right">{ws.personCosts ? "Cost per hour" : ""}</span>
            <span className="text-right">{ws.personCosts ? "Spread per hour" : ""}</span>
          </li>
          {rows.map(({ p, bill, current, previous, cost, spread }) => (
            <li key={p.id} className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr] sm:items-baseline">
              <div className="col-span-2 sm:col-span-1">
                <Link href={`/team#${p.id}`} className="font-medium">
                  {p.name}
                </Link>
                {p.type === "contractor" && (
                  <span className="ml-2">
                    <Badge tone="purple">Contractor</Badge>
                  </span>
                )}
                <div className="text-xs text-ink-muted">
                  {p.title} · {p.role}
                  {p.fte < 1 && ` · ${p.fte} FTE`}
                </div>
              </div>
              <div className="text-sm sm:text-right">
                <span className="text-xs text-ink-muted sm:hidden">Bill rate </span>
                {bill === null ? <span className="text-warn">Missing</span> : <span className="font-medium tabular-nums">{v.money(bill)}/h</span>}
                {current && (
                  <div className="text-[11px] text-ink-muted">
                    from {fmtDate(current.effectiveFrom, { year: true })}
                    {previous ? `, was ${v.money(previous.hourlyRate)}` : ""}
                  </div>
                )}
              </div>
              {ws.personCosts && (
                <div className="text-sm sm:text-right">
                  <span className="text-xs text-ink-muted sm:hidden">Cost </span>
                  {cost?.hourlyCost == null ? <span className="text-warn">Missing</span> : <span className="tabular-nums">{v.money(cost.hourlyCost)}/h</span>}
                  {cost?.annualLoaded != null && <div className="text-[11px] text-ink-muted">{v.money(cost.annualLoaded, { compact: true })} a year loaded</div>}
                </div>
              )}
              {ws.personCosts && (
                <div className="text-sm sm:text-right">
                  <span className="text-xs text-ink-muted sm:hidden">Spread </span>
                  {spread === null ? <span className="text-ink-muted">—</span> : <span className={`tabular-nums ${spread < 0 ? "text-bad" : ""}`}>{v.money(spread)}/h</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-ink-muted">
        How rates feed project costs and margins: <Link href="/calculations#labor-cost">View calculation</Link>.
      </p>
    </div>
  );
}
