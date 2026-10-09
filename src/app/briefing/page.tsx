import Link from "next/link";
import { AttentionList, EvidenceLinks } from "@/components/blocks";
import { Card, HealthBadge, Notice, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { addDays, daysBetween, fmtDate, relativeDays } from "@/lib/dates";
import { fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

export default async function BriefingPage() {
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const a = ws.analysis;
  const t = ws.profile.terms;
  const today = ws.org.demoDate;
  const decisions = a.attention.filter((i) => i.severity === "critical" || i.severity === "high");
  const changes = ws.changes.items;
  const worse = changes.filter((c) => c.direction === "worse");
  const better = changes.filter((c) => c.direction === "better");
  const upcomingMs = ws.data.milestones
    .filter((m) => a.milestones[m.id] && a.milestones[m.id].state !== "done" && daysBetween(today, a.milestones[m.id].due) >= 0 && daysBetween(today, a.milestones[m.id].due) <= 14)
    .sort((x, y) => (a.milestones[x.id].due < a.milestones[y.id].due ? -1 : 1));
  const renewals = a.renewals.filter((r) => daysBetween(today, r.renewalDate) <= 90);
  const fin = ws.finance;
  const stale = ws.data.connectors.filter((c) => c.state !== "healthy" && c.state !== "not_configured");
  const insufficient = ws.data.accounts.filter((x) => a.health[x.id]?.status === "insufficient");
  const dueActions = ws.data.actions.filter((x) => (x.status === "open" || x.status === "in_progress") && x.dueDate <= addDays(today, 7)).sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1));

  const headline: string[] = [];
  if (decisions.length) headline.push(`${decisions.length} item${decisions.length === 1 ? " needs" : "s need"} a decision this week, led by ${decisions[0].title.charAt(0).toLowerCase()}${decisions[0].title.slice(1)}.`);
  else headline.push("No high-severity items this week.");
  if (fin && ws.profile.modules.financeMode === "delivery") headline.push(`${a.period.label}: ${v.money(fin.summary.earnedRevenue, { compact: true })} earned at a ${fmtPct(fin.summary.deliveryMargin)} delivery margin${fin.scope === "company" ? `, operating result ${v.money(fin.summary.operatingResult, { compact: true })}` : ""}.`);
  if (fin && ws.profile.modules.financeMode === "subscription") headline.push(`${a.period.label}: ${v.money(fin.summary.earnedRevenue, { compact: true })} recognized revenue.`);
  if (a.receivables.totalOverdue > 0 && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts)) headline.push(`${v.money(a.receivables.totalOverdue, { compact: true })} is overdue across ${a.receivables.overdue.length} invoice${a.receivables.overdue.length === 1 ? "" : "s"}.`);
  if (fin?.cash) headline.push(`The base-case cash low point is ${v.money(fin.cash.lowPoint.closing, { compact: true })} in the week of ${fmtDate(fin.cash.lowPoint.weekStart)}.`);
  if (a.capacity.overallocated.length) headline.push(`${a.capacity.overallocated.map((p) => p.person.name).join(", ")} ${a.capacity.overallocated.length === 1 ? "is" : "are"} planned above capacity.`);
  if (insufficient.length) headline.push(`There is not enough current information to assess ${insufficient.map((x) => x.name).join(", ")}.`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Week ending ${fmtDate(today, { year: true })}`}
        title="Weekly briefing"
        subtitle={`For ${ws.user.name} (${ws.ctx.role.replace("_", " ")}). Generated on screen from current records; nothing is emailed or posted. Changes cover ${fmtDate(ws.changes.since)} – ${fmtDate(ws.changes.until)}.`}
      />
      <Card title="In brief">
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {headline.map((h, i) => (
            <p key={i} className={i === 0 ? "font-medium" : ""}>
              {h}
            </p>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What got worse" subtitle={`${worse.length} changes`}>
          {worse.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing got worse in the last 7 days.</p>
          ) : (
            <ul className="space-y-2.5">
              {worse.map((c, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium">
                    <span className="text-bad" aria-hidden="true">▼ </span>
                    {c.title}
                  </div>
                  {c.detail && <div className="text-xs text-ink-soft">{c.detail}</div>}
                  <EvidenceLinks ws={ws} links={c.links} className="mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="What got better" subtitle={`${better.length} changes`}>
          {better.length === 0 ? (
            <p className="text-sm text-ink-muted">No improvements recorded in the last 7 days.</p>
          ) : (
            <ul className="space-y-2.5">
              {better.map((c, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium">
                    <span className="text-good" aria-hidden="true">▲ </span>
                    {c.title}
                  </div>
                  {c.detail && <div className="text-xs text-ink-soft">{c.detail}</div>}
                  <EvidenceLinks ws={ws} links={c.links} className="mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Coming up (14 days)">
          {upcomingMs.length === 0 ? (
            <p className="text-sm text-ink-muted">No milestones due.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {upcomingMs.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}#${m.id}`}>{m.name}</Link>
                  <div className="text-xs text-ink-muted">
                    {v.project(m.projectId)} · {fmtDate(a.milestones[m.id].due)} ({relativeDays(today, a.milestones[m.id].due)}) · {v.person(m.ownerId)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Renewals (90 days)">
          {renewals.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {renewals.map((r) => (
                <li key={r.contractId} className="flex items-center justify-between gap-2">
                  <span>
                    <Link href={`/accounts/${r.accountId}`}>{v.account(r.accountId)}</Link>
                    <span className="block text-xs text-ink-muted">
                      {fmtDate(r.renewalDate)} · {v.money(r.annualValue, { compact: true })}
                    </span>
                  </span>
                  {a.health[r.accountId] && <HealthBadge status={a.health[r.accountId].status} score={a.health[r.accountId].score} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Actions due this week" actions={<Link href="/actions?status=overdue" className="text-xs">Overdue →</Link>}>
          {dueActions.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {dueActions.map((x) => (
                <li key={x.id}>
                  <Link href={`/actions#${x.id}`}>{x.title}</Link>
                  <div className={`text-xs ${x.dueDate < today ? "text-bad" : "text-ink-muted"}`}>
                    {v.person(x.ownerId)} · {fmtDate(x.dueDate)} ({relativeDays(today, x.dueDate)})
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(stale.length > 0 || insufficient.length > 0 || (fin?.summary.missing.length ?? 0) > 0) && (
        <Notice title="Data quality this week">
          <ul className="list-disc pl-5">
            {stale.map((c) => (
              <li key={c.id}>
                {c.provider} is {c.state.replace("_", " ")}
                {c.lastSuccessfulSync ? ` (last successful sync ${c.lastSuccessfulSync.slice(0, 10)})` : ""}.
              </li>
            ))}
            {insufficient.map((x) => (
              <li key={x.id}>
                {x.name}: {a.health[x.id].dataGaps.join("; ")}
              </li>
            ))}
            {fin?.summary.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Card id="queue" title={`Full priority queue (${a.attention.length})`} subtitle={`Every alert visible to your role, with owner, due date and evidence. ${t.accounts} with insufficient data are listed, not treated as healthy.`}>
        <AttentionList ws={ws} items={a.attention} />
      </Card>
    </div>
  );
}
