import { notFound } from "next/navigation";
import { LaunchTable } from "@/components/profile-panels";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { LAUNCH_RANK } from "@/lib/calc/launch";
import { aggregateScope } from "@/lib/permissions";

export default async function LaunchesPage() {
  const ws = await getWorkspace();
  if (!ws.profile.modules.retailLaunches) notFound();
  const rows = Object.values(ws.analysis.launches).sort((a, b) => LAUNCH_RANK[a.status] - LAUNCH_RANK[b.status] || a.launch.shelfDate.localeCompare(b.launch.shelfDate));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const upcoming = rows.filter((r) => r.status !== "on_shelf");
  const skus = upcoming.reduce((s, r) => s + r.launch.skus, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={aggregateScope(ws.caps)}
        title="Retail launches"
        subtitle="Packaging and range launches tied to a retailer shelf date. Final artwork has to reach the printer before the print lead time starts, so each launch is judged on the buffer between its release milestone and that deadline."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Shelf date at risk" value={count("at_risk")} tone={count("at_risk") ? "bad" : undefined} kind="calculated" sub="Files forecast after the print deadline" />
        <Stat label="Little buffer" value={count("tight")} tone={count("tight") ? "warn" : undefined} kind="calculated" sub="Under 7 days, or waiting on the client" />
        <Stat label="On track or released" value={count("on_track") + count("released")} kind="calculated" sub={`${count("released")} already with the printer`} />
        <Stat label="SKUs in upcoming launches" value={skus} kind="observed" sub={`${upcoming.length} launch${upcoming.length === 1 ? "" : "es"} before shelf`} />
      </div>
      <Card title="Launches by risk" subtitle="Sorted by status, then shelf date." padded={false}>
        {rows.length ? <LaunchTable ws={ws} rows={rows} /> : <div className="p-5"><EmptyState title="No retail launches in your view" /></div>}
      </Card>
      <Card title="How this is calculated">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Files due at printer = shelf date − print lead time (weeks × 7).</li>
          <li>Forecast release = the release milestone&apos;s completion date, or its due date (never earlier than today while it is open).</li>
          <li>Buffer = files due − forecast release. Negative buffer means the shelf date is at risk; under 7 days, or a release waiting on client approval or blocked, is flagged as little buffer.</li>
        </ul>
      </Card>
    </div>
  );
}
