import Link from "next/link";
import type { Workspace } from "@/data/access";
import { addDays, daysBetween, fmtDate, relativeDays } from "@/lib/dates";
import type { ChangeItem } from "@/lib/changes";
import { viewHelpers } from "@/lib/view";
import { EvidenceLinks } from "./blocks";
import { Card, HealthBadge, Notice } from "./ui";

/** A change with its direction spelled out, not only colored. */
export function ChangeRow({ ws, c, className = "" }: { ws: Workspace; c: ChangeItem; className?: string }) {
  const worse = c.direction === "worse";
  const better = c.direction === "better";
  return (
    <li className={`text-sm ${className}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-px text-[11px] font-semibold ${worse ? "bg-bad-soft text-bad" : better ? "bg-good-soft text-good" : "bg-canvas text-ink-soft"}`}>
          <span aria-hidden="true">{worse ? "▼ " : better ? "▲ " : ""}</span>
          {worse ? "Worse" : better ? "Better" : "Changed"}
        </span>
        <div className="min-w-0">
          <div className="font-medium">{c.title}</div>
          <div className="text-xs text-ink-muted">
            {fmtDate(c.date, { year: false })}
            {c.detail ? ` · ${c.detail}` : ""}
          </div>
          <EvidenceLinks ws={ws} links={c.links} className="mt-1" />
        </div>
      </div>
    </li>
  );
}

/** The weekly change report: what moved in the last seven days and what is coming up. */
export function WeeklyReport({ ws }: { ws: Workspace }) {
  const v = viewHelpers(ws);
  const a = ws.analysis;
  const today = ws.org.demoDate;
  const changes = ws.changes.items;
  const worse = changes.filter((c) => c.direction === "worse");
  const better = changes.filter((c) => c.direction !== "worse");
  const upcomingMs = ws.data.milestones
    .filter((m) => a.milestones[m.id] && a.milestones[m.id].state !== "done" && daysBetween(today, a.milestones[m.id].due) >= 0 && daysBetween(today, a.milestones[m.id].due) <= 14)
    .sort((x, y) => (a.milestones[x.id].due < a.milestones[y.id].due ? -1 : 1));
  const renewals = ws.profile.modules.financeMode === "budget" ? [] : a.renewals.filter((r) => daysBetween(today, r.renewalDate) <= 90);
  const insufficient = ws.data.accounts.filter((x) => a.health[x.id]?.status === "insufficient");
  const dueActions = ws.data.actions.filter((x) => (x.status === "open" || x.status === "in_progress") && x.dueDate <= addDays(today, 7)).sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1));
  const missing = ws.finance?.summary.missing ?? [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">
        Changes from {fmtDate(ws.changes.since, { year: false })} to {fmtDate(ws.changes.until)}, built from dated records you can see. Nothing is emailed or posted.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What got worse" subtitle={`${worse.length} change${worse.length === 1 ? "" : "s"}`}>
          {worse.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing got worse in the last 7 days.</p>
          ) : (
            <ul className="space-y-3">
              {worse.map((c, i) => (
                <ChangeRow key={i} ws={ws} c={c} />
              ))}
            </ul>
          )}
        </Card>
        <Card title="What got better or was completed" subtitle={`${better.length} change${better.length === 1 ? "" : "s"}`}>
          {better.length === 0 ? (
            <p className="text-sm text-ink-muted">No improvements recorded in the last 7 days.</p>
          ) : (
            <ul className="space-y-3">
              {better.map((c, i) => (
                <ChangeRow key={i} ws={ws} c={c} />
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Coming up in the next 14 days">
          {upcomingMs.length === 0 ? (
            <p className="text-sm text-ink-muted">No milestones due.</p>
          ) : (
            <ul className="space-y-2 text-sm">
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
        {renewals.length > 0 || ws.profile.modules.financeMode !== "budget" ? (
          <Card title="Renewals in the next 90 days">
            {renewals.length === 0 ? (
              <p className="text-sm text-ink-muted">None.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {renewals.map((r) => (
                  <li key={r.contractId} className="flex items-center justify-between gap-2">
                    <span>
                      <Link href={`/accounts/${r.accountId}`}>{v.account(r.accountId)}</Link>
                      <span className="block text-xs text-ink-muted">
                        {fmtDate(r.renewalDate)}
                        {r.annualValue !== null ? ` · ${v.money(r.annualValue, { compact: true })} a year` : ""}
                      </span>
                    </span>
                    {a.health[r.accountId] && <HealthBadge status={a.health[r.accountId].status} score={a.health[r.accountId].score} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
        <Card title="Plans due this week">
          {dueActions.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dueActions.map((x) => (
                <li key={x.id}>
                  <Link href={`/actions#${x.id}`}>{x.title}</Link>
                  <div className={`text-xs ${x.dueDate < today ? "font-medium text-bad" : "text-ink-muted"}`}>
                    {v.person(x.ownerId)} · {x.dueDate < today ? "Overdue since " : "Due "}
                    {fmtDate(x.dueDate)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {(ws.sources.length > 0 || insufficient.length > 0 || missing.length > 0) && (
        <Notice title="Data quality this week">
          <ul className="list-disc pl-5">
            {ws.sources.map((s) => (
              <li key={s.connectorId}>{s.summary}</li>
            ))}
            {insufficient.map((x) => (
              <li key={x.id}>
                {x.name}: {a.health[x.id].dataGaps.join("; ")}
              </li>
            ))}
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
