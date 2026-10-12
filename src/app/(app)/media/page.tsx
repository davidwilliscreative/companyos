import { notFound } from "next/navigation";
import { FlightTable } from "@/components/profile-panels";
import { Card, EmptyState, PageHeader, Restricted, Stat } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import type { FlightPacing } from "@/lib/calc/media";
import { needsAttention } from "@/lib/calc/media";
import { aggregateScope } from "@/lib/permissions";
import { viewHelpers } from "@/lib/view";

const RANK: Record<FlightPacing["status"], number> = { over: 0, under: 1, no_data: 2, on_pace: 3, not_started: 4, ended: 5 };

export default async function MediaPage() {
  const ws = await getWorkspace();
  if (!ws.profile.modules.mediaPacing) notFound();
  const v = viewHelpers(ws);
  const header = (
    <PageHeader
      eyebrow={aggregateScope(ws.caps)}
      title="Media pacing"
      subtitle="Client media flights against their budgets and KPI targets, from ad platform reporting. Spend is planned evenly across each flight; the projection assumes the last two weeks' run rate continues."
    />
  );
  if (!ws.caps.viewCommercialTerms)
    return (
      <div className="space-y-6">
        {header}
        <Restricted what="Client media budgets, spend and results are commercial terms." />
      </div>
    );

  const rows = Object.values(ws.analysis.media);
  const live = rows.filter((p) => p.status !== "not_started" && p.status !== "ended");
  const budget = live.reduce((s, p) => s + p.flight.budget, 0);
  const spent = live.reduce((s, p) => s + p.spent, 0);
  const offPace = live.filter((p) => p.status === "over" || p.status === "under").length;
  const behind = live.filter((p) => p.kpiStatus === "behind").length;
  const noData = live.filter((p) => p.status === "no_data").length;
  const byAccount = new Map<string, FlightPacing[]>();
  for (const p of rows) byAccount.set(p.flight.accountId, [...(byAccount.get(p.flight.accountId) ?? []), p]);
  const groups = [...byAccount.entries()]
    .map(([id, fs]) => ({ id, fs: fs.sort((a, b) => RANK[a.status] - RANK[b.status] || a.flight.channel.localeCompare(b.flight.channel)), flagged: fs.filter(needsAttention).length }))
    .sort((a, b) => b.flagged - a.flagged || v.account(a.id).localeCompare(v.account(b.id)));

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live flight budgets" value={v.money(budget, { compact: true })} kind="observed" sub={`${live.length} flights in market`} />
        <Stat label="Spent to date" value={v.money(spent, { compact: true })} kind="observed" sub={budget ? `${Math.round((spent / budget) * 100)}% of live budgets` : undefined} />
        <Stat label="Off pace" value={offPace} tone={offPace ? "warn" : undefined} kind="calculated" sub={noData ? `${noData} more without recent data` : "Projected over or under budget"} />
        <Stat label="Behind KPI target" value={behind} tone={behind ? "bad" : undefined} kind="calculated" sub="CPA or ROAS over 10% worse than target" />
      </div>
      {groups.length === 0 && <EmptyState title="No media flights in your view" />}
      {groups.map((g) => (
        <Card key={g.id} title={v.account(g.id)} subtitle={g.flagged ? `${g.flagged} flight${g.flagged === 1 ? " needs" : "s need"} action` : "All flights on pace"} padded={false}>
          <FlightTable ws={ws} rows={g.fs} showAccount={false} />
        </Card>
      ))}
      <Card title="How this is calculated">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Planned to date = budget × days elapsed ÷ flight days, up to the last reported week.</li>
          <li>Projected spend = spend to date + last two weeks&apos; daily run rate × days remaining. Over pace: projected more than 5% over budget, or spend to date more than 10% ahead of plan. Under pace: projected more than 10% under budget.</li>
          <li>KPI uses the last four reported weeks: CPA = spend ÷ conversions, ROAS = revenue ÷ spend. Behind target means more than 10% worse than the target.</li>
          <li>A live flight with nothing reported for over 14 days is shown as no recent data rather than judged.</li>
        </ul>
      </Card>
    </div>
  );
}
