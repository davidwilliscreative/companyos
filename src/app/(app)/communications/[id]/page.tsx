import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, SourceTag } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { CATEGORY_LABEL, looksLikeInstruction } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace();
  const t = ws.data.threads.find((x) => x.id === id);
  if (!t) notFound();
  const v = viewHelpers(ws);
  const related = ws.analysis.signals.filter((s) => [...s.evidence, ...s.counterEvidence, ...s.resolutionEvidence].some((e) => e.threadId === t.id));
  const flagged = t.messages.filter((m) => looksLikeInstruction(m.body));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/communications" className="text-ink-muted">
            ← Communications
          </Link>
        }
        title={t.subject}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{t.channel}</Badge>
            {t.accountId && <Link href={`/accounts/${t.accountId}`}>{v.account(t.accountId)}</Link>}
            {t.projectId && (
              <>
                · <Link href={`/projects/${t.projectId}`}>{v.project(t.projectId)}</Link>
              </>
            )}
            <span>· {t.location}</span>
            <SourceTag system={t.source.system} />
          </span>
        }
      />
      {flagged.length > 0 && (
        <Notice title="Instruction-like text detected">
          {flagged.length} message{flagged.length === 1 ? " contains" : "s contain"} text that looks like instructions to an automated system. OpsInstinct treats all message content as untrusted data: it is never executed or followed, and the assistant does not change behavior because of it.
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card padded={false}>
          <ol className="divide-y divide-line">
            {t.messages.map((m) => {
              const inj = looksLikeInstruction(m.body);
              return (
                <li key={m.id} id={m.id} className="scroll-mt-20 px-4 py-3 target:bg-accent-soft">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-ink">{m.author}</span>
                    <Badge tone={m.authorSide === "client" ? "accent" : "neutral"}>{m.authorSide === "client" ? (ws.profile.id === "enterprise" ? "Stakeholder" : "Client") : "Internal"}</Badge>
                    <span className="text-ink-muted">
                      {fmtDate(m.sentAt.slice(0, 10), { year: true })} {m.sentAt.slice(11, 16)} UTC
                    </span>
                    {inj && <Badge tone="warn">Untrusted instruction-like text, ignored</Badge>}
                  </div>
                  <p className={`mt-1 whitespace-pre-wrap text-sm ${inj ? "rounded border border-dashed border-warn/40 bg-warn-soft/40 p-2" : ""}`}>{m.body}</p>
                </li>
              );
            })}
          </ol>
        </Card>
        <Card title="Signals using this thread">
          {related.length === 0 ? (
            <p className="text-sm text-ink-muted">No signals reference this thread.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {related.map((s) => (
                <li key={s.id}>
                  <Link href={`/signals/${s.id}`}>{CATEGORY_LABEL[s.category]}</Link>
                  <div className="text-xs text-ink-muted">
                    {s.severity} · {s.review.status}
                    {s.autoResolved ? " · resolved in thread" : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
