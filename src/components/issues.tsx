import Link from "next/link";
import type { Workspace } from "@/data/access";
import { addDays, fmtDate, relativeDays } from "@/lib/dates";
import type { Metric } from "@/lib/home";
import type { Issue, IssueImpact, IssueKind } from "@/lib/issues";
import { fmtPct, fmtPts } from "@/lib/money";
import { viewHelpers } from "@/lib/view";
import { EvidenceLinks, peopleOptions } from "./blocks";
import { ActionForm } from "./forms";
import { Badge, KindTag, SeverityBadge } from "./ui";

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  staffing: "Staffing",
  delivery: "Delivery",
  relationship: "Relationship",
  collections: "Collections",
  margin: "Margin",
  budget: "Budget",
  data: "Missing data",
  opportunity: "Opportunity",
  system: "Data source",
  plan: "Overdue plan",
};

export function formatImpact(ws: Workspace, x: IssueImpact): string {
  const v = viewHelpers(ws);
  if (x.value === null) return x.note ?? (x.unit === "text" ? "" : "Not available");
  switch (x.unit) {
    case "money":
      return v.money(x.value, { compact: true });
    case "percent":
      return x.label.includes("vs target") ? fmtPts(x.value) : fmtPct(x.value);
    case "points":
      return `${x.value > 0 ? "+" : x.value < 0 ? "−" : ""}${Math.abs(x.value)} pts`;
    case "days":
      return `${x.value} day${x.value === 1 ? "" : "s"}`;
    case "count":
      return String(x.value);
    case "text":
      return "";
  }
}

const REVIEW_TONE = { recorded: "neutral", unreviewed: "accent", confirmed: "bad", appears_resolved: "good", reopened: "warn" } as const;

export function ReviewState({ issue }: { issue: Issue }) {
  return (
    <Badge tone={REVIEW_TONE[issue.review.state]} title={issue.review.detail}>
      {issue.review.label}
    </Badge>
  );
}

/** Plan status for an issue: the plan in place, or the way to create one. */
function PlanLine({ ws, issue, compact }: { ws: Workspace; issue: Issue; compact?: boolean }) {
  const v = viewHelpers(ws);
  const plan = issue.plans.find((p) => p.relation === "plan");
  const related = issue.plans.filter((p) => p.relation === "related");
  if (plan)
    return (
      <div className="text-sm">
        <Link href={`/actions#${plan.actionId}`} className="font-medium">
          View plan
        </Link>
        <span className="text-ink-soft">
          {" "}
          · {plan.title} · {v.person(plan.ownerId)} · {plan.status.replace("_", " ")}
        </span>
        {plan.overdue && <span className="ml-1 font-medium text-bad">· overdue since {fmtDate(plan.dueDate)}</span>}
        {!compact && related.length > 0 && <div className="mt-1 text-xs text-ink-muted">Also related: {related.map((r) => r.title).join("; ")}</div>}
      </div>
    );
  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-medium text-ink">No plan yet.</span> <span className="text-ink-soft">Suggested next step: {issue.next}</span>
      </div>
      {related.length > 0 && (
        <div className="text-xs text-ink-muted">
          Related plan:{" "}
          {related.map((r) => (
            <Link key={r.actionId} href={`/actions#${r.actionId}`} className="mr-2">
              {r.title}
            </Link>
          ))}
        </div>
      )}
      {compact ? (
        ws.caps.manageActions && (
          <Link href={`/issues#${issue.id}`} className="text-xs">
            Create a plan
          </Link>
        )
      ) : (
        <ActionForm
          people={peopleOptions(ws)}
          canManage={ws.caps.manageActions}
          minDate={ws.org.demoDate}
          label="Create plan"
          defaults={{
            title: issue.next.length < 110 ? issue.next : issue.title,
            description: `${issue.title}. ${issue.what}`.slice(0, 600),
            ownerId: issue.ownerId,
            dueDate: issue.nextUpdate < ws.org.demoDate ? addDays(ws.org.demoDate, 2) : issue.nextUpdate,
            severity: issue.severity,
            impact: issue.impacts
              .filter((x) => x.value !== null)
              .map((x) => `${x.label}: ${formatImpact(ws, x)}`)
              .join("; "),
            accountId: issue.accountIds.length === 1 ? issue.accountIds[0] : undefined,
            links: [{ type: "issue", id: issue.id, label: issue.title.slice(0, 80) }, ...issue.evidence.slice(0, 8)],
            origin: "alert",
          }}
        />
      )}
    </div>
  );
}

/**
 * One issue. The headline answers the four questions (what, why, what next, who);
 * evidence and the underlying alerts are one click away.
 */
export function IssueCard({ ws, issue, compact = false, index, titles = {} }: { ws: Workspace; issue: Issue; compact?: boolean; index?: number; titles?: Record<string, string> }) {
  const v = viewHelpers(ws);
  const today = ws.org.demoDate;
  const impacts = issue.impacts.filter((x) => x.unit !== "text" || x.value !== null);
  return (
    <article id={issue.id} className="card scroll-mt-24 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {index !== undefined && (
          <span className="mr-1 text-xs font-semibold tabular-nums text-ink-faint" aria-hidden="true">
            {index}
          </span>
        )}
        <SeverityBadge severity={issue.severity} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{ISSUE_KIND_LABEL[issue.kind]}</span>
        {issue.executive && (
          <Badge tone="purple" icon="◆" title={issue.executiveReason}>
            Executive decision
          </Badge>
        )}
        <ReviewState issue={issue} />
      </div>
      <h3 className="mt-2 text-[16px] font-semibold leading-snug tracking-tight text-ink">{issue.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{issue.what}</p>
      {issue.why && (
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          <span className="font-medium">Why it matters: </span>
          {issue.why}
        </p>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-ink-muted">Owner</dt>
          <dd className="font-medium">{v.person(issue.ownerId)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted">Next update</dt>
          <dd className={issue.nextUpdateOverdue ? "font-medium text-bad" : "font-medium"}>
            {issue.nextUpdateOverdue ? "Overdue" : fmtDate(issue.nextUpdate)} <span className="text-xs font-normal text-ink-muted">{issue.nextUpdateOverdue ? "· plan date has passed" : `· ${relativeDays(today, issue.nextUpdate)}`}</span>
          </dd>
        </div>
        {impacts[0] && (
          <div>
            <dt className="text-xs font-medium text-ink-muted">{impacts[0].label}</dt>
            <dd className="font-medium tabular-nums" title={impacts[0].basis}>
              {formatImpact(ws, impacts[0])}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 border-t border-line pt-3">
        <PlanLine ws={ws} issue={issue} compact={compact} />
      </div>

      <details className="group mt-3">
        <summary className="cursor-pointer select-none text-[13px] font-medium text-accent">
          Show impact, evidence and affected {ws.profile.terms.accounts.toLowerCase()}
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          {issue.executiveReason && <p className="text-violet">{issue.executiveReason}</p>}
          {impacts.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-ink-muted">Impact (each measured separately; never added together)</div>
              <ul className="space-y-1">
                {impacts.map((x) => (
                  <li key={x.label} className="flex flex-wrap gap-x-2">
                    <span className="font-medium tabular-nums">{formatImpact(ws, x) || "—"}</span>
                    <span>{x.label}</span>
                    <span className="text-xs text-ink-muted">· {x.basis}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(issue.accountIds.length > 0 || issue.projectIds.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {issue.accountIds.length > 0 && (
                <span>
                  <span className="text-xs text-ink-muted">{ws.profile.terms.accounts}: </span>
                  {issue.accountIds.map((id, n) => (
                    <span key={id}>
                      {n > 0 && ", "}
                      <Link href={`/accounts/${id}`}>{v.account(id)}</Link>
                    </span>
                  ))}
                </span>
              )}
              {issue.projectIds.length > 0 && (
                <span>
                  <span className="text-xs text-ink-muted">{ws.profile.terms.projects}: </span>
                  {issue.projectIds.map((id, n) => (
                    <span key={id}>
                      {n > 0 && ", "}
                      <Link href={`/projects/${id}`}>{v.project(id)}</Link>
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          {issue.parts.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-medium text-ink-muted">Grouped from {issue.parts.length} alerts</div>
              <ul className="list-disc space-y-0.5 pl-5 text-ink-soft">
                {issue.parts.map((p) => (
                  <li key={p.id}>{p.title}</li>
                ))}
              </ul>
            </div>
          )}
          {issue.review.detail && <p className="text-xs text-ink-muted">{issue.review.detail}</p>}
          <EvidenceLinks ws={ws} links={issue.evidence.filter((l) => l.type !== "issue")} />
          {issue.related.length > 0 && (
            <p className="text-xs text-ink-muted">
              Related issues:{" "}
              {issue.related.map((id, n) => (
                <span key={id}>
                  {n > 0 && " · "}
                  <Link href={`/issues#${id}`}>{titles[id] ?? "Related issue"}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}

const TIME_LABEL = { historical: "Past period", current: "Current", forecast: "Forecast" } as const;

/** A figure with its scope, period and warnings attached, so it is never read out of context. */
export function MetricCard({ m }: { m: Metric }) {
  const toneCls = m.tone === "bad" ? "text-bad" : m.tone === "warn" ? "text-warn" : m.tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-ink-soft">{m.href ? <Link href={m.href} className="link-quiet">{m.label}</Link> : m.label}</div>
        <KindTag kind={m.kind} quiet />
      </div>
      <div className={`mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tightest ${toneCls}`}>
        {m.value}
        {m.tone && <span className="sr-only"> ({m.tone === "bad" ? "needs attention" : m.tone === "warn" ? "watch" : "good"})</span>}
      </div>
      {m.sub && <div className="mt-1.5 text-[13px] leading-snug text-ink-soft">{m.sub}</div>}
      <div className="mt-auto pt-2 text-xs leading-snug text-ink-muted">
        {m.scope} · {TIME_LABEL[m.time]} · {m.period}
      </div>
      {(m.warnings.length > 0 || m.calcHref) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {m.warnings.map((w) => (
            <Badge key={w.label + w.detail} tone="warn" icon="!" title={w.detail}>
              {w.label}
            </Badge>
          ))}
          {m.calcHref && (
            <Link href={m.calcHref} className="text-xs">
              View calculation
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
