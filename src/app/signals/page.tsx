import Link from "next/link";
import { SignalRow } from "@/components/blocks";
import { OpportunityEditor } from "@/components/forms";
import { Badge, Card, EmptyState, KindTag, Notice, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import type { SignalCategory } from "@/domain/types";
import { CATEGORY_LABEL, CONFIDENCE_EXPLAINER } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export default async function SignalsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const a = ws.analysis;
  const str = (k: string, d: string) => (typeof sp[k] === "string" ? (sp[k] as string) : d);
  const tab = str("tab", "open");
  const account = str("account", "all");
  const category = str("category", "all");
  const review = str("review", "all");

  const isClosed = (s: (typeof a.signals)[number]) => s.autoResolved || s.review.status === "dismissed" || s.review.status === "resolved";
  const base = a.signals.filter((s) => (account === "all" || s.accountId === account) && (category === "all" || s.category === category) && (review === "all" || s.review.status === review));
  const open = base.filter((s) => !isClosed(s) && s.polarity === "risk").sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || (x.lastEvidenceOn < y.lastEvidenceOn ? 1 : -1));
  const positive = base.filter((s) => !isClosed(s) && s.polarity !== "risk");
  const closed = base.filter(isClosed);
  const opps = a.opportunities.filter((o) => account === "all" || o.accountId === account);
  const tabs = [
    { key: "open", label: `Open risks (${open.length})` },
    ...(ws.profile.modules.expansion ? [{ key: "opportunities", label: `Opportunities (${opps.length})` }] : []),
    { key: "positive", label: `Positive (${positive.length})` },
    { key: "closed", label: `Resolved and dismissed (${closed.length})` },
  ];
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab, account, category, review, ...patch });
    for (const [k, val] of [...p.entries()]) if (val === "all") p.delete(k);
    return `/signals?${p.toString()}`;
  };
  const categories = [...new Set(a.signals.map((s) => s.category))] as SignalCategory[];

  return (
    <div className="space-y-6">
      <PageHeader title={ws.profile.modules.expansion ? "Signals and opportunities" : "Signals"} subtitle="Inferred from authorized communications using transparent rules. Each signal shows its evidence, contradicting messages and how confident the evidence is. Signals never produce churn probabilities." />
      <Notice tone="info" title="What confidence means">
        {CONFIDENCE_EXPLAINER}
      </Notice>
      {ws.caps.communications === "none" && <Notice>Your role cannot read message content, so evidence excerpts are hidden. Categories, severities and dates are still shown.</Notice>}
      {ws.caps.communications === "billing_only" && <Notice>Your role sees billing conversations only. Evidence from other threads is shown as restricted.</Notice>}

      <nav aria-label="Signal views" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link key={t.key} href={qs({ tab: t.key })} aria-current={tab === t.key ? "page" : undefined} className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm no-underline hover:no-underline ${tab === t.key ? "border-line border-b-white bg-white font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== "opportunities" && (
        <form className="flex flex-wrap items-end gap-3" aria-label="Filter signals">
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label className="label" htmlFor="account">{ws.profile.terms.account}</label>
            <select id="account" name="account" className="input" defaultValue={account}>
              <option value="all">All</option>
              {ws.data.accounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" className="input" defaultValue={category}>
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="review">Review status</label>
            <select id="review" name="review" className="input" defaultValue={review}>
              <option value="all">All</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="confirmed">Confirmed</option>
              <option value="dismissed">Dismissed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <button className="btn btn-primary">Apply</button>
          <Link href={`/signals?tab=${tab}`} className="btn">
            Clear
          </Link>
        </form>
      )}

      {tab === "opportunities" ? (
        <div className="space-y-4">
          <Notice tone="info">Opportunities come from expansion interest in client messages, matched to the service catalog. Values are manual estimates by a person and are never added to revenue, forecasts or cash.</Notice>
          {opps.length === 0 ? (
            <EmptyState title="No opportunities detected" />
          ) : (
            opps.map((o) => (
              <Card key={o.id} id={o.id} title={`${v.account(o.accountId)}: ${o.offering}`} subtitle={o.readinessReason} actions={<Badge tone={o.readiness === "ready" ? "good" : o.readiness === "developing" ? "accent" : "neutral"}>{o.readiness}</Badge>}>
                <blockquote className="border-l-2 border-accent pl-3 text-sm text-ink">“{o.need}”</blockquote>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    Owner <strong>{v.person(o.ownerId)}</strong>
                  </span>
                  <span>
                    Status <strong>{o.status}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    Value {o.estimatedValue !== null ? <strong>{v.money(o.estimatedValue)}</strong> : <span className="text-ink-muted">not estimated</span>} {o.estimatedValue !== null && <KindTag kind="estimate" />}
                    {o.estimatedBy && <span className="text-xs text-ink-muted">by {v.person(o.estimatedBy)}</span>}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  <span className="text-ink-muted">Next step:</span> {o.nextStep}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {o.evidence.map((e) => (
                    <li key={e.messageId}>
                      <Link href={`/communications/${e.threadId}#${e.messageId}`}>
                        {e.author} ({e.authorSide}), {e.sentAt.slice(0, 10)}
                      </Link>
                      : <span className="text-ink-soft">“{e.excerpt}”</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  <Link href={`/signals/${o.signalId}`}>Underlying signal →</Link>
                </p>
                <OpportunityEditor opp={o} canEdit={ws.caps.manageActions} currency={ws.org.reportingCurrency} />
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card padded>
          {(() => {
            const list = tab === "closed" ? closed : tab === "positive" ? positive : open;
            if (!list.length) return <EmptyState title="No signals match">Clear filters or choose another view.</EmptyState>;
            return (
              <ul className="divide-y divide-line">
                {list.map((s) => (
                  <SignalRow key={s.id} ws={ws} s={s} />
                ))}
              </ul>
            );
          })()}
        </Card>
      )}
    </div>
  );
}
