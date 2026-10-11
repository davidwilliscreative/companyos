import Link from "next/link";
import { EvidenceLinks, peopleOptions } from "@/components/blocks";
import { FilterForm, Presets } from "@/components/filters";
import { ActionControls, ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Notice, PageHeader, SeverityBadge } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import type { Action } from "@/domain/types";
import { addDays, fmtDate, relativeDays } from "@/lib/dates";
import { buildIssues, type Issue } from "@/lib/issues";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;
const SEV = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const STATUS_LABEL: Record<Action["status"], string> = { open: "Not started", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
const ORIGIN_LABEL: Record<Action["origin"], string> = { seed: "Existing plan", user: "Created by hand", signal: "From a signal", alert: "From an issue", opportunity: "From an opportunity" };

/**
 * Plans: the actions people have committed to. Each plan shows the issue it
 * addresses, so "View plan" on an issue and "View issue" here are two ends of
 * the same link. Resolution is never assumed: an open plan whose issue is no
 * longer detected asks for confirmation, and a closed plan whose issue is
 * still detected says so.
 */
export default async function PlansPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const status = str("status", "active");
  const ownerParam = str("owner", "all");
  const owner = ownerParam === "me" ? ws.user.id : ownerParam;
  const account = str("account", "all");
  const today = ws.org.demoDate;
  const issues = buildIssues(ws);
  const isOpen = (a: Action) => a.status === "open" || a.status === "in_progress";
  const issueOf = (a: Action): { issue: Issue; relation: "plan" | "related" } | null => {
    for (const relation of ["plan", "related"] as const) {
      const issue = issues.find((i) => i.plans.some((p) => p.actionId === a.id && p.relation === relation));
      if (issue) return { issue, relation };
    }
    return null;
  };

  const list = ws.data.actions
    .filter((a) => (status === "all" ? true : status === "active" ? isOpen(a) : status === "overdue" ? isOpen(a) && a.dueDate < today : a.status === status))
    .filter((a) => owner === "all" || a.ownerId === owner)
    .filter((a) => account === "all" || a.accountId === account)
    .sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : SEV[x.severity] - SEV[y.severity]));
  const owners = [...new Set(ws.data.actions.map((a) => a.ownerId))];
  const active = ws.data.actions.filter(isOpen);
  const presets = [
    { label: "Open", href: "/actions", active: status === "active" && owner === "all" && account === "all", count: active.length },
    { label: "Mine", href: "/actions?owner=me", active: ownerParam === "me" && status === "active", count: active.filter((a) => a.ownerId === ws.user.id).length },
    { label: "Overdue", href: "/actions?status=overdue", active: status === "overdue" && owner === "all", count: active.filter((a) => a.dueDate < today).length },
    { label: "Done", href: "/actions?status=done", active: status === "done" && owner === "all", count: ws.data.actions.filter((a) => a.status === "done").length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="My work"
        title="Plans"
        subtitle="What people have committed to do about each issue, who owns it and when the next update is due. Nothing here sends email or Slack messages."
        actions={<Link href="/issues?filter=noplan">Issues without a plan →</Link>}
      />
      {!ws.caps.manageActions && <Notice tone="info">Your role can view plans but not create or change them.</Notice>}
      <Presets label="Plan views" items={presets} />
      <FilterForm label="Filter plans" defaults={{ status: "active" }}>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="active">Open or in progress</option>
            <option value="overdue">Overdue</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="owner">
            Owner
          </label>
          <select id="owner" name="owner" className="input" defaultValue={ownerParam === "me" ? "me" : owner}>
            <option value="all">Anyone</option>
            <option value="me">Me ({ws.user.name})</option>
            {owners
              .filter((o) => o !== ws.user.id)
              .map((o) => (
                <option key={o} value={o}>
                  {v.person(o)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="account">
            {ws.profile.terms.account}
          </label>
          <select id="account" name="account" className="input" defaultValue={account}>
            <option value="all">All</option>
            {ws.data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <noscript>
          <button className="btn btn-primary">Apply</button>
        </noscript>
      </FilterForm>

      {list.length === 0 ? (
        <EmptyState title="No plans match">Try another view.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const overdue = isOpen(a) && a.dueDate < today;
            const link = issueOf(a);
            const issue = link?.issue;
            const escalated = overdue && issue && (issue.executive || issue.severity === "critical" || issue.severity === "high");
            return (
              <li key={a.id} id={a.id} className="card scroll-mt-20 p-4 target:ring-2 target:ring-accent sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === "done" ? "good" : a.status === "cancelled" ? "neutral" : overdue ? "bad" : "accent"} icon={overdue ? "!" : a.status === "done" ? "✓" : undefined}>
                    {overdue ? "Update overdue" : STATUS_LABEL[a.status]}
                  </Badge>
                  <SeverityBadge severity={a.severity} />
                  {escalated && (
                    <Badge tone="purple" icon="◆">
                      Escalated
                    </Badge>
                  )}
                  <span className="text-[11px] uppercase tracking-wide text-ink-muted">{ORIGIN_LABEL[a.origin]}</span>
                </div>
                <h2 className="mt-1.5 font-medium">{a.title}</h2>
                {a.description && <p className="mt-0.5 text-sm text-ink-soft">{a.description}</p>}

                <p className="mt-2 text-sm">
                  {issue ? (
                    <>
                      <span className="text-ink-muted">{link.relation === "plan" ? "Plan for: " : "Related to: "}</span>
                      <Link href={`/issues#${issue.id}`}>{issue.title}</Link>
                    </>
                  ) : isOpen(a) ? (
                    <span className="text-ink-muted">Not linked to an open issue.</span>
                  ) : null}
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-ink-muted">Owner</dt>
                    <dd>{v.person(a.ownerId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">{isOpen(a) ? "Next update" : "Was due"}</dt>
                    <dd className={overdue ? "font-medium text-bad" : ""}>
                      {fmtDate(a.dueDate)}
                      {isOpen(a) && <span className="text-xs text-ink-muted"> · {relativeDays(today, a.dueDate)}</span>}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-muted">Expected impact</dt>
                    <dd>{a.impact || <span className="text-ink-muted">Not stated</span>}</dd>
                  </div>
                </dl>

                {escalated && <p className="mt-3 rounded-lg bg-violet-soft/60 px-3 py-2 text-sm text-ink">Escalated: the update is overdue and the issue {issue.executive ? "needs an executive decision" : "is high severity"}.</p>}
                {isOpen(a) && !issue && a.links.length > 0 && (
                  <p className="mt-3 rounded-lg bg-good-soft/60 px-3 py-2 text-sm text-ink">
                    <strong className="font-medium">Appears resolved · awaiting confirmation.</strong> The problem this plan addressed is no longer detected in the data. Check the evidence, then mark the plan done.
                  </p>
                )}
                {!isOpen(a) && issue && link.relation === "plan" && (
                  <p className="mt-3 rounded-lg bg-warn-soft/60 px-3 py-2 text-sm text-ink">
                    <strong className="font-medium">Issue still open.</strong> This plan is {a.status === "done" ? "marked done" : "cancelled"}, but the data still shows: {issue.what}
                  </p>
                )}
                {issue?.review.state === "reopened" && (
                  <p className="mt-3 rounded-lg bg-bad-soft/60 px-3 py-2 text-sm text-ink">
                    <strong className="font-medium">Reopened.</strong> {issue.review.detail ?? issue.review.label}
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer select-none text-[13px] font-medium text-accent">Evidence and updates{a.comments.length ? ` (${a.comments.length})` : ""}</summary>
                  <div className="mt-2 space-y-2">
                    <EvidenceLinks ws={ws} links={a.links} />
                    {a.comments.length > 0 && (
                      <ul className="space-y-1 border-t border-line pt-2">
                        {a.comments.map((c) => (
                          <li key={c.id} className="text-xs">
                            <span className="font-medium">{v.person(c.authorId)}</span> <span className="text-ink-muted">{fmtDate(c.at.slice(0, 10))}</span>: {c.body}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-ink-muted">
                      Created by {v.person(a.createdBy)} on {fmtDate(a.createdAt.slice(0, 10), { year: true })}
                    </p>
                  </div>
                </details>
                <ActionControls id={a.id} status={a.status} canManage={ws.caps.manageActions} />
              </li>
            );
          })}
        </ul>
      )}

      {ws.caps.manageActions && (
        <Card title="New plan" subtitle="Plans are usually created from an issue so they link to it. Use this for anything else.">
          <ActionForm people={peopleOptions(ws)} canManage label="Create plan" minDate={today} defaultOpen={false} defaults={{ dueDate: addDays(today, 7), ownerId: ws.user.id }} />
        </Card>
      )}
    </div>
  );
}
