import Link from "next/link";
import { MappingDecision } from "@/components/forms";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate, relativeDays } from "@/lib/dates";
import { viewHelpers } from "@/lib/view";

const STATE_TONE = { healthy: "good", degraded: "warn", stale: "warn", failed: "bad", not_configured: "neutral" } as const;

export default async function IntegrationsPage() {
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  const pending = ws.data.mappings.filter((m) => m.status === "needs_review");
  const batches = [...ws.overlay.imports.batches].reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Every connector in this demo is simulated. Nothing connects to Gmail, Slack, ClickUp, accounting or any AI service. The interfaces are ready for real connectors (see docs/connectors.md)."
        actions={
          <Link href="/integrations/sheets" className="btn btn-primary">
            Google Sheets import (simulated)
          </Link>
        }
      />
      {!ws.caps.manageIntegrations && <Notice tone="info">Only the Administrator role can confirm mappings and change connector settings. You can view status.</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        {ws.data.connectors.map((c) => (
          <Card
            key={c.id}
            id={c.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {c.provider} <Badge tone="purple">Simulated</Badge>
                <Badge tone={STATE_TONE[c.state]}>{c.state.replace("_", " ")}</Badge>
              </span>
            }
            subtitle={`${c.kind.replace("_", " ")} · authoritative for ${c.authoritativeFor.join(", ") || "nothing"}`}
          >
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Last successful sync</dt>
                <dd>{c.lastSuccessfulSync ? `${fmtDate(c.lastSuccessfulSync.slice(0, 10))} (${relativeDays(ws.org.demoDate, c.lastSuccessfulSync.slice(0, 10))})` : "Never"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Records synced</dt>
                <dd>{c.recordsSynced?.toLocaleString() ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <div className="text-xs font-medium text-ink-muted">Permission scopes</div>
              <ul className="mt-1 space-y-0.5 text-xs">
                {c.scopes.map((s) => (
                  <li key={s.scope}>
                    <span className={s.granted ? "text-good" : "text-bad"}>{s.granted ? "✓" : "✗"}</span> <code>{s.scope}</code>
                    {s.note ? <span className="text-ink-muted"> · {s.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            {(c.included.length > 0 || c.excluded.length > 0) && (
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="font-medium text-ink-muted">Included</div>
                  <ul>
                    {c.included.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-ink-muted">Excluded</div>
                  <ul>
                    {c.excluded.map((x) => (
                      <li key={x.name}>
                        {x.name} <span className="text-ink-muted">({x.reason})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {c.failures.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#efcdc7] bg-bad-soft p-2 text-xs text-bad">
                <div className="font-medium">Recent failures</div>
                <ul>
                  {c.failures.map((f) => (
                    <li key={f.at + f.message}>
                      {f.at.slice(0, 10)}: {f.message}
                      {f.recordRef ? ` (${f.recordRef})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card id="mappings" title="Entity mapping" subtitle={`External names matched to ${ws.profile.terms.accounts.toLowerCase()} and ${ws.profile.terms.projects.toLowerCase()}. Low-confidence matches wait for review instead of being merged silently. ${pending.length} need review.`} padded={false}>
        {ws.data.mappings.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Mappings are visible to Administrator, Executive and Finance roles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">External name</th>
                  <th className="th">Source</th>
                  <th className="th">Suggested match</th>
                  <th className="th">Confidence</th>
                  <th className="th">Status</th>
                  <th className="th">Decision</th>
                </tr>
              </thead>
              <tbody>
                {ws.data.mappings.map((m) => (
                  <tr key={m.id}>
                    <td className="td">
                      <div className="font-medium">{m.externalName}</div>
                      <div className="text-[11px] text-ink-muted">{m.externalId}</div>
                    </td>
                    <td className="td text-xs">{ws.data.connectors.find((c) => c.id === m.connectorId)?.provider}</td>
                    <td className="td text-sm">
                      {m.suggestedAccountId ? v.account(m.suggestedAccountId) : m.suggestedProjectId ? v.project(m.suggestedProjectId) : <span className="text-ink-muted">No match</span>}
                      <div className="text-[11px] text-ink-muted">{m.reason}</div>
                    </td>
                    <td className="td text-xs">{m.confidence}</td>
                    <td className="td">
                      <Badge tone={m.status === "confirmed" ? "good" : m.status === "rejected" ? "neutral" : "warn"}>{m.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="td">
                      <MappingDecision id={m.id} status={m.status} canManage={ws.caps.manageIntegrations} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Import history">
        {batches.length === 0 ? (
          <p className="text-sm text-ink-muted">No imports yet in this demo session.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {batches.map((b) => (
              <li key={b.id}>
                {b.at.slice(0, 10)} · <strong>{b.dataset}</strong> from {b.spreadsheet} by {v.person(b.by)}: {b.created} created, {b.updated} updated, {b.unchanged} unchanged, {b.rejected} rejected, {b.duplicates} duplicates
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
