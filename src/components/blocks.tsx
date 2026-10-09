import Link from "next/link";
import type { Workspace } from "@/data/access";
import type { EvidenceLink, Signal } from "@/domain/types";
import type { AttentionItem } from "@/lib/analytics";
import { addDays, fmtDate, relativeDays } from "@/lib/dates";
import { CATEGORY_LABEL } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";
import { ActionForm } from "./forms";
import { Badge, ConfidenceBadge, EmptyState, ReviewBadge, SeverityBadge } from "./ui";

export function EvidenceLinks({ ws, links, className = "" }: { ws: Workspace; links: EvidenceLink[]; className?: string }) {
  const v = viewHelpers(ws);
  if (!links.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 text-xs ${className}`}>
      {links.map((l, i) => (
        <li key={`${l.type}:${l.id}:${i}`}>
          <Link href={v.href(l)}>
            <span className="text-ink-muted">{l.type === "calculation" ? "Calculation" : l.type.charAt(0).toUpperCase() + l.type.slice(1)}:</span> {v.linkLabel(l)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function peopleOptions(ws: Workspace) {
  return ws.data.people.filter((p) => p.type === "employee").map((p) => ({ id: p.id, name: p.name }));
}

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  account: "Account health",
  renewal: "Renewal",
  margin: "Margin / budget",
  schedule: "Schedule",
  invoice: "Receivable",
  capacity: "Capacity",
  opportunity: "Opportunity",
  data: "Missing data",
  action: "Overdue action",
};

export function AttentionList({ ws, items, limit, showCreate = true }: { ws: Workspace; items: AttentionItem[]; limit?: number; showCreate?: boolean }) {
  const v = viewHelpers(ws);
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) return <EmptyState title="Nothing needs attention">No alerts match your role and filters. Missing data would appear here, not be hidden.</EmptyState>;
  const existing = new Set(ws.data.actions.flatMap((a) => a.links.map((l) => `${l.type}:${l.id}`)));
  return (
    <ol className="divide-y divide-line">
      {shown.map((i, n) => {
        const hasAction = i.links.some((l) => existing.has(`${l.type}:${l.id}`)) && i.kind !== "action";
        return (
          <li key={i.id} id={showCreate ? i.id : undefined} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-muted" aria-hidden="true">
                {n + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={i.severity} />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{KIND_LABEL[i.kind]}</span>
                </div>
                <div className="mt-1 font-medium text-ink">
                  <Link href={v.href(i.links[0])} className="text-ink hover:text-accent">
                    {i.title}
                  </Link>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{i.why}</p>
                <p className="mt-1 text-sm">
                  <span className="text-ink-muted">Next step: </span>
                  {i.next}
                </p>
                <EvidenceLinks ws={ws} links={i.links} className="mt-1.5" />
              </div>
              <dl className="grid w-full shrink-0 grid-cols-3 gap-2 text-xs sm:w-56 sm:grid-cols-1 sm:gap-1">
                <div>
                  <dt className="text-ink-muted">Impact</dt>
                  <dd className="font-medium tabular-nums">{i.impactValue !== null ? v.money(i.impactValue, { compact: true }) : "—"}</dd>
                  <dd className="text-[11px] text-ink-muted">{i.impactLabel}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Owner</dt>
                  <dd>{v.person(i.ownerId)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Due</dt>
                  <dd>
                    {fmtDate(i.dueDate)} <span className="text-ink-muted">({relativeDays(ws.org.demoDate, i.dueDate)})</span>
                  </dd>
                </div>
              </dl>
            </div>
            {showCreate && i.kind !== "action" && (
              <div className="ml-8 mt-2">
                {hasAction ? (
                  <Link href="/actions" className="text-xs">
                    ✓ An action already tracks this
                  </Link>
                ) : (
                  <ActionForm
                    people={peopleOptions(ws)}
                    canManage={ws.caps.manageActions}
                    minDate={ws.org.demoDate}
                    defaults={{ title: i.next.length < 120 ? `${i.title}: ${i.next}`.slice(0, 160) : i.title, description: i.why, ownerId: i.ownerId, dueDate: i.dueDate < ws.org.demoDate ? addDays(ws.org.demoDate, 2) : i.dueDate, severity: i.severity, impact: i.impactValue !== null ? `${v.money(i.impactValue, { compact: true })} ${i.impactLabel.toLowerCase()}` : i.impactLabel, accountId: i.accountId, links: i.links, origin: "alert" }}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SignalRow({ ws, s }: { ws: Workspace; s: Signal }) {
  const v = viewHelpers(ws);
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={s.severity} />
        <ConfidenceBadge confidence={s.confidence} reason={s.confidenceReason} />
        <ReviewBadge status={s.review.status} />
        {s.autoResolved && <Badge tone="good">Resolved in thread</Badge>}
        {s.newEvidenceSinceReview && <Badge tone="warn">New evidence since dismissal</Badge>}
        {s.counterEvidence.length > 0 && <Badge tone="neutral">{s.counterEvidence.length} contradicting</Badge>}
      </div>
      <div className="mt-1">
        <Link href={`/signals/${s.id}`} className="font-medium text-ink hover:text-accent">
          {CATEGORY_LABEL[s.category]}: {v.account(s.accountId)}
        </Link>
      </div>
      <p className="text-sm text-ink-soft">{s.summary}</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        Detected {fmtDate(s.detectedOn)} · last evidence {fmtDate(s.lastEvidenceOn)} · {s.evidence.length} message{s.evidence.length === 1 ? "" : "s"} · owner {v.person(s.ownerId)}
      </p>
    </li>
  );
}
