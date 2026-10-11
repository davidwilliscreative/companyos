import Link from "next/link";
import { IssueCard, MetricCard } from "@/components/issues";
import { Card, CardLink, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ChangeRow, WeeklyReport } from "@/components/weekly";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { homeFor } from "@/lib/home";
import { buildIssues } from "@/lib/issues";
import { ROLES } from "@/lib/permissions";

const MOBILE_ISSUES = 3;
const MOBILE_CHANGES = 3;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const ws = await getWorkspace();
  const weekly = view === "weekly";
  const home = homeFor(ws);
  const titles = Object.fromEntries(buildIssues(ws).map((i) => [i.id, i.title]));
  const { counts } = home;
  const hiddenUrgent = counts.urgent - counts.shownUrgent;

  const tabs = (
    <nav aria-label="Home views" className="inline-flex rounded-full bg-surface p-1 ring-1 ring-inset ring-line">
      <Link href="/" aria-current={!weekly ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-sm font-medium no-underline ${!weekly ? "bg-ink text-white hover:text-white" : "text-ink-soft hover:text-ink"}`}>
        Today
      </Link>
      <Link href="/?view=weekly" aria-current={weekly ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-sm font-medium no-underline ${weekly ? "bg-ink text-white hover:text-white" : "text-ink-soft hover:text-ink"}`}>
        Weekly report
      </Link>
    </nav>
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={`${ROLES[ws.ctx.role].label} home · ${ws.org.name}`} title={weekly ? `Week ending ${fmtDate(ws.org.demoDate)}` : home.greeting} subtitle={weekly ? undefined : home.focus} actions={tabs} />

      {weekly ? (
        <WeeklyReport ws={ws} />
      ) : (
        <>
          <section aria-labelledby="brief-title" className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="brief-title" className="text-[15px] font-semibold tracking-tight">
                Your briefing
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${counts.urgent ? "bg-bad-soft text-bad" : "bg-canvas text-ink-soft"}`}>{counts.urgent} urgent</span>
                {ws.ctx.role === "executive" && counts.executive > 0 && <span className="rounded-full bg-violet-soft px-2.5 py-0.5 font-semibold text-violet">{counts.executive} need you</span>}
                <Link href="/issues">{counts.total} open issues</Link>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink">
              {home.briefing.map((b, i) => (
                <p key={i} className={i === 0 ? "font-medium" : "text-ink-soft"}>
                  {b}
                </p>
              ))}
            </div>
          </section>

          {home.dataWarnings.length > 0 && <Notice title="Some figures may be out of date">{home.dataWarnings.join(" ")}</Notice>}

          {home.metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              {home.metrics.map((m) => (
                <MetricCard key={m.label} m={m} />
              ))}
            </div>
          )}

          <section aria-labelledby="issues-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="issues-title" className="text-lg font-semibold tracking-tight">
                  What needs your attention
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">Related alerts are grouped into one issue with one owner and plan.</p>
              </div>
              <CardLink href="/issues">All issues</CardLink>
            </div>
            {home.issues.length === 0 ? (
              <EmptyState title="Nothing needs your attention">Missing or stale data would appear here, not be hidden.</EmptyState>
            ) : (
              <div className="space-y-3">
                {home.issues.map((i, n) => (
                  // Phones show the top three; the rest are on the issues list.
                  <div key={i.id} className={n >= MOBILE_ISSUES ? "hidden sm:block" : undefined}>
                    <IssueCard ws={ws} issue={i} compact index={n + 1} titles={titles} />
                  </div>
                ))}
              </div>
            )}
            {counts.total > MOBILE_ISSUES && (
              <p className="text-sm sm:hidden">
                <Link href="/issues">
                  See all {counts.total} issues{counts.urgent > 0 ? `, ${counts.urgent} urgent` : ""} →
                </Link>
              </p>
            )}
            {counts.total > home.issues.length && (
              <p className="hidden text-sm sm:block">
                <Link href="/issues">
                  {counts.total - home.issues.length} more on the issues list{hiddenUrgent > 0 ? `, ${hiddenUrgent} of them urgent` : ""} →
                </Link>
              </p>
            )}
          </section>

          <Card title={home.since.label} subtitle="Demo baseline: one week before today. Most significant changes first." actions={<CardLink href="/?view=weekly">Weekly report</CardLink>}>
            {home.since.items.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing changed in your scope since then.</p>
            ) : (
              <ul className="space-y-3">
                {home.since.items.map((c, i) => (
                  <ChangeRow key={i} ws={ws} c={c} className={i >= MOBILE_CHANGES ? "hidden sm:list-item" : ""} />
                ))}
              </ul>
            )}
            {home.since.more > 0 && (
              <p className="mt-3 text-sm">
                <Link href="/?view=weekly">{home.since.more} more changes in the weekly report →</Link>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
