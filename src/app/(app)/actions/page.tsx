import Link from "next/link";
import { EvidenceLinks, peopleOptions } from "@/components/blocks";
import { ActionControls, ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Notice, PageHeader, SeverityBadge } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { addDays, fmtDate, relativeDays } from "@/lib/dates";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;
const SEV = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export default async function ActionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const status = str("status", "active");
  const owner = str("owner", "all");
  const account = str("account", "all");
  const today = ws.org.demoDate;

  const list = ws.data.actions
    .filter((a) => (status === "all" ? true : status === "active" ? a.status === "open" || a.status === "in_progress" : status === "overdue" ? (a.status === "open" || a.status === "in_progress") && a.dueDate < today : a.status === status))
    .filter((a) => owner === "all" || a.ownerId === owner)
    .filter((a) => account === "all" || a.accountId === account)
    .sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : SEV[x.severity] - SEV[y.severity]));
  const owners = [...new Set(ws.data.actions.map((a) => a.ownerId))];

  return (
    <div className="space-y-6">
      <PageHeader title="Actions" subtitle="Owned, dated follow-ups with evidence links. Saved locally in the demo; no emails or Slack messages are sent." />
      {!ws.caps.manageActions && <Notice tone="info">Your role can view actions but not create or change them.</Notice>}
      <Card title="New action">
        <ActionForm people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={today} defaultOpen={false} defaults={{ dueDate: addDays(today, 7), ownerId: ws.user.id }} />
      </Card>
      <form className="flex flex-wrap items-end gap-3" aria-label="Filter actions">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="active">Open or in progress</option>
            <option value="overdue">Overdue</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="owner">Owner</label>
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
          <label className="label" htmlFor="account">{ws.profile.terms.account}</label>
          <select id="account" name="account" className="input" defaultValue={account}>
            <option value="all">All</option>
            {ws.data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Apply</button>
        <Link href="/actions" className="btn">
          Reset
        </Link>
      </form>
      {list.length === 0 ? (
        <EmptyState title="No actions match" />
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const overdue = (a.status === "open" || a.status === "in_progress") && a.dueDate < today;
            return (
              <li key={a.id} id={a.id} className="card scroll-mt-20 p-4 target:ring-2 target:ring-accent">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <Badge tone={a.status === "done" ? "good" : a.status === "cancelled" ? "neutral" : overdue ? "bad" : "accent"}>{overdue ? "Overdue" : a.status.replace("_", " ")}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-ink-muted">from {a.origin}</span>
                    </div>
                    <h2 className="mt-1 font-medium">{a.title}</h2>
                    {a.description && <p className="mt-0.5 text-sm text-ink-soft">{a.description}</p>}
                    <EvidenceLinks ws={ws} links={a.links} className="mt-1.5" />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-xs sm:w-72">
                    <div>
                      <dt className="text-ink-muted">Owner</dt>
                      <dd>{v.person(a.ownerId)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Due</dt>
                      <dd className={overdue ? "text-bad" : ""}>
                        {fmtDate(a.dueDate)}
                        <div className="text-ink-muted">{relativeDays(today, a.dueDate)}</div>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Impact</dt>
                      <dd>{a.impact || "—"}</dd>
                    </div>
                  </dl>
                </div>
                {a.comments.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-line pt-2">
                    {a.comments.map((c) => (
                      <li key={c.id} className="text-xs">
                        <span className="font-medium">{v.person(c.authorId)}</span> <span className="text-ink-muted">{c.at.slice(0, 10)}</span>: {c.body}
                      </li>
                    ))}
                  </ul>
                )}
                <ActionControls id={a.id} status={a.status} canManage={ws.caps.manageActions} />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Created by {v.person(a.createdBy)} on {a.createdAt.slice(0, 10)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
