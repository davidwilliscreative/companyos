import Link from "next/link";
import type { Workspace } from "@/data/access";
import type { EvidenceLink, Signal } from "@/domain/types";
import type { AttentionItem } from "@/lib/analytics";
import { addDays, fmtDate, relativeDays } from "@/lib/dates";
import { CATEGORY_LABEL } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";
import { ActionForm } from "./forms";
import { Badge, ConfidenceBadge, EmptyState, ReviewBadge, SeverityBadge } from "./ui";

export function EvidenceLinks({ ws, links, className = "", dark = false }: { ws: Workspace; links: EvidenceLink[]; className?: string; dark?: boolean }) {
  const v = viewHelpers(ws);
  if (!links.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 text-xs ${className}`}>
      {links.map((l, i) => (
        <li key={`${l.type}:${l.id}:${i}`}>
          <Link
            href={v.href(l)}
            className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-1 no-underline ring-1 ring-inset transition ${dark ? "bg-white/5 text-white/85 ring-white/10 hover:bg-white/10 hover:text-white" : "bg-surface text-ink-soft ring-line hover:text-accent hover:ring-accent-line"}`}
          >
            <span className={dark ? "text-white/50" : "text-ink-faint"}>{l.type === "calculation" ? "Calculation" : l.type.charAt(0).toUpperCase() + l.type.slice(1)}</span>
            <span className="truncate">{v.linkLabel(l)}</span>
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

const SEV_DOT: Record<AttentionItem["severity"], string> = { critical: "bg-bad ring-bad-line", high: "bg-bad/80 ring-bad-line", medium: "bg-warn ring-warn-line", low: "bg-ink-faint ring-line" };

function actionDefaults(ws: Workspace, i: AttentionItem) {
  const v = viewHelpers(ws);
  return { title: i.next.length < 120 ? `${i.title}: ${i.next}`.slice(0, 160) : i.title, description: i.why, ownerId: i.ownerId, dueDate: i.dueDate < ws.org.demoDate ? addDays(ws.org.demoDate, 2) : i.dueDate, severity: i.severity, impact: i.impactValue !== null ? `${v.money(i.impactValue, { compact: true })} ${i.impactLabel.toLowerCase()}` : i.impactLabel, accountId: i.accountId, links: i.links, origin: "alert" as const };
}

/** The single most important item, given visual weight so the page has an obvious starting point. */
export function FeaturedAttention({ ws, item: i }: { ws: Workspace; item: AttentionItem }) {
  const v = viewHelpers(ws);
  const existing = new Set(ws.data.actions.flatMap((a) => a.links.map((l) => `${l.type}:${l.id}`)));
  const hasAction = i.links.some((l) => existing.has(`${l.type}:${l.id}`)) && i.kind !== "action";
  return (
    <article id={i.id} className="relative overflow-hidden rounded-2xl bg-sidebar p-6 text-white shadow-lift sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a9a4ff]">Top priority</span>
          <span aria-hidden="true" className="text-white/30">·</span>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">{KIND_LABEL[i.kind]}</span>
          <SeverityBadge severity={i.severity} />
        </div>
        <h3 className="mt-3 max-w-3xl text-[22px] font-semibold leading-snug tracking-tight sm:text-2xl">
          <Link href={v.href(i.links[0])} className="text-white no-underline hover:text-white hover:underline hover:decoration-white/30 hover:underline-offset-4">
            {i.title}
          </Link>
        </h3>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/70">{i.why}</p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-3">
          <div className="bg-sidebar-soft px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Impact</div>
            <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{i.impactValue !== null ? v.money(i.impactValue, { compact: true }) : "—"}</div>
            <div className="text-xs text-white/50">{i.impactLabel}</div>
          </div>
          <div className="bg-sidebar-soft px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Owner</div>
            <div className="mt-1 text-[15px] font-medium">{v.person(i.ownerId)}</div>
          </div>
          <div className="bg-sidebar-soft px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Decide by</div>
            <div className="mt-1 text-[15px] font-medium">{fmtDate(i.dueDate)}</div>
            <div className="text-xs text-white/50">{relativeDays(ws.org.demoDate, i.dueDate)}</div>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <span className="font-semibold text-white">Next step </span>
          <span className="text-white/75">{i.next}</span>
        </div>
        <EvidenceLinks ws={ws} links={i.links} className="mt-4" dark />
        {i.kind !== "action" && (
          <div className="mt-4">
            {hasAction ? (
              <Link href="/actions" className="text-xs text-white/70 hover:text-white">
                ✓ An action already tracks this
              </Link>
            ) : (
              <ActionForm people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={ws.org.demoDate} defaults={actionDefaults(ws, i)} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Scannable one-line-per-item list. Detail lives on the linked page. */
export function AttentionRows({ ws, items, start = 1 }: { ws: Workspace; items: AttentionItem[]; start?: number }) {
  const v = viewHelpers(ws);
  if (!items.length) return <EmptyState title="Nothing else needs attention" />;
  return (
    <ol className="divide-y divide-line/70">
      {items.map((i, n) => (
        <li key={i.id} id={i.id} className="group relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-canvas/60">
          <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-faint" aria-hidden="true">
            {String(n + start).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ring-2 ${SEV_DOT[i.severity]}`} />
              <span className="sr-only">Severity {i.severity}.</span>
              {KIND_LABEL[i.kind]}
            </div>
            <Link href={v.href(i.links[0])} className="mt-1 block font-medium leading-snug text-ink no-underline after:absolute after:inset-0 hover:text-ink group-hover:text-accent">
              {i.title}
            </Link>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-muted">{i.why}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-ink">{i.impactValue !== null ? v.money(i.impactValue, { compact: true }) : "—"}</div>
            <div className={`text-xs ${i.dueDate <= addDays(ws.org.demoDate, 2) ? "font-medium text-bad" : "text-ink-muted"}`}>{relativeDays(ws.org.demoDate, i.dueDate)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

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
          <li key={i.id} id={showCreate ? i.id : undefined} className="py-4 first:pt-0 last:pb-0">
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
                    defaults={actionDefaults(ws, i)}
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

/**
 * One review state per signal. A thread that resolved itself but nobody has
 * confirmed reads "Appears resolved · awaiting confirmation", never both
 * "Resolved" and "Unreviewed"; a dismissed signal with new messages says why it is back.
 */
export function SignalReviewBadge({ s }: { s: Signal }) {
  if (s.newEvidenceSinceReview) return <Badge tone="warn" icon="↻" title={s.review.note}>Reopened: new evidence {fmtDate(s.lastEvidenceOn)}</Badge>;
  if (s.autoResolved && s.review.status === "unreviewed") return <Badge tone="good" icon="✓" title="Later messages in the same thread suggest this was resolved. Confirm to close it.">Appears resolved · awaiting confirmation</Badge>;
  return <ReviewBadge status={s.review.status} />;
}

export function SignalRow({ ws, s }: { ws: Workspace; s: Signal }) {
  const v = viewHelpers(ws);
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={s.severity} />
        <ConfidenceBadge confidence={s.confidence} reason={s.confidenceReason} />
        <SignalReviewBadge s={s} />
        {s.counterEvidence.some((e) => e.relation === "contradicts") && <Badge tone="neutral">{s.counterEvidence.filter((e) => e.relation === "contradicts").length} contradicting</Badge>}
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
