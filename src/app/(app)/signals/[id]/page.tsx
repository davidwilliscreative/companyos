import Link from "next/link";
import { notFound } from "next/navigation";
import { peopleOptions } from "@/components/blocks";
import { ActionForm, SignalReviewControls } from "@/components/forms";
import { Badge, Card, ConfidenceBadge, DefList, KindTag, Notice, PageHeader, ReviewBadge, SeverityBadge } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import type { Evidence } from "@/domain/types";
import { addDays, fmtDate } from "@/lib/dates";
import { CATEGORY_LABEL, CONFIDENCE_EXPLAINER } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace();
  const s = ws.analysis.signals.find((x) => x.id === id);
  if (!s) notFound();
  const v = viewHelpers(ws);
  const existing = ws.data.actions.filter((a) => a.links.some((l) => l.type === "signal" && l.id === s.id));
  const sev = s.severity;

  const EvidenceList = ({ items, empty }: { items: Evidence[]; empty: string }) =>
    items.length === 0 ? (
      <p className="text-sm text-ink-muted">{empty}</p>
    ) : (
      <ul className="space-y-3">
        {items.map((e) => {
          const visible = ws.data.threads.some((t) => t.id === e.threadId);
          return (
            <li key={e.messageId} className="text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="font-medium text-ink">{e.author}</span>
                <Badge tone={e.authorSide === "client" ? "accent" : "neutral"}>{e.authorSide === "client" ? "Client" : "Internal"}</Badge>
                <span>{fmtDate(e.sentAt.slice(0, 10), { year: true })}</span>
                {visible ? <Link href={`/communications/${e.threadId}#${e.messageId}`}>Open message →</Link> : <span>Thread restricted for your role</span>}
              </div>
              <blockquote className="mt-1 border-l-2 border-line pl-3 text-ink">“{e.excerpt}”</blockquote>
              {e.matched.length > 0 && visible && <div className="mt-0.5 text-[11px] text-ink-muted">Matched: {e.matched.join(", ")}</div>}
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/signals" className="text-ink-muted">
            ← Signals
          </Link>
        }
        title={`${CATEGORY_LABEL[s.category]}: ${v.account(s.accountId)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={sev} />
            <ConfidenceBadge confidence={s.confidence} reason={s.confidenceReason} />
            <ReviewBadge status={s.review.status} />
            <KindTag kind="inferred" />
            {s.autoResolved && <Badge tone="good">Resolved later in the thread</Badge>}
          </span>
        }
      />
      {s.newEvidenceSinceReview && <Notice title="New evidence since this was dismissed">{s.review.note}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="Why this was flagged">
            <p className="text-sm">{s.summary}</p>
            <p className="mt-2 text-sm text-ink-soft">{s.explanation}</p>
            <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
              <div className="text-xs font-medium text-ink-muted">Confidence: {s.confidence}</div>
              <p className="mt-0.5">{s.confidenceReason}</p>
              <p className="mt-1 text-[11px] text-ink-muted">{CONFIDENCE_EXPLAINER}</p>
            </div>
          </Card>
          <Card title={`Supporting evidence (${s.evidence.length})`}>
            <EvidenceList items={s.evidence} empty="No supporting messages." />
          </Card>
          <Card title={`Contradicting evidence (${s.counterEvidence.length})`} subtitle="Messages that point the other way are kept, not hidden">
            <EvidenceList items={s.counterEvidence} empty="No contradicting messages found." />
          </Card>
          {s.resolutionEvidence.length > 0 && (
            <Card title="Resolution evidence" subtitle="Later messages indicating the issue was resolved">
              <EvidenceList items={s.resolutionEvidence} empty="" />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <DefList
              items={[
                [ws.profile.terms.account, <Link key="a" href={`/accounts/${s.accountId}`}>{v.account(s.accountId)}</Link>],
                ...(s.projectId ? ([[ws.profile.terms.project, <Link key="p" href={`/projects/${s.projectId}`}>{v.project(s.projectId)}</Link>]] as [string, React.ReactNode][]) : []),
                ["Detected", fmtDate(s.detectedOn, { year: true })],
                ["Last evidence", fmtDate(s.lastEvidenceOn, { year: true })],
                ["Owner", v.person(s.ownerId)],
                ["Recommended", s.recommendedAction],
                ...(s.review.by ? ([["Reviewed", `${v.person(s.review.by)} on ${s.review.at?.slice(0, 10)}${s.review.note ? `: ${s.review.note}` : ""}`]] as [string, string][]) : []),
              ]}
            />
          </Card>
          <Card title="Review">
            <SignalReviewControls signalId={s.id} status={s.review.status} canReview={ws.caps.reviewSignals} />
          </Card>
          <Card title="Actions">
            {existing.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {existing.map((a) => (
                  <li key={a.id}>
                    <Link href={`/actions#${a.id}`}>{a.title}</Link> <span className="text-xs text-ink-muted">· {a.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={ws.org.demoDate} defaults={{ title: `${v.account(s.accountId)}: ${s.recommendedAction}`.slice(0, 160), description: s.summary, ownerId: s.ownerId, dueDate: addDays(ws.org.demoDate, sev === "critical" || sev === "high" ? 3 : 7), severity: sev, accountId: s.accountId, links: [{ type: "signal", id: s.id }, { type: "account", id: s.accountId }, ...s.evidence.slice(0, 3).map((e) => ({ type: "message" as const, id: e.messageId }))], origin: "signal" }} />
          </Card>
        </div>
      </div>
    </div>
  );
}
