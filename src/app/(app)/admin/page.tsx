import Link from "next/link";
import { Badge, Card, CardLink, PageHeader } from "@/components/ui";
import { getMember } from "@/data/member";
import { getWorkspace } from "@/data/session";
import type { RoleId } from "@/domain/types";
import { fmtDate } from "@/lib/dates";
import { CAPABILITY_LABELS, ROLES } from "@/lib/permissions";
import { PUBLIC_DEMO } from "@/lib/supabase/config";

const SEVERITY = { high: ["bad", "Failing"], medium: ["warn", "Stale"], low: ["neutral", "Minor"] } as const;

function capValue(v: boolean | string) {
  if (v === true) return <span className="text-good">✓ Yes</span>;
  if (v === false) return <span className="text-ink-muted">✗ No</span>;
  return <span>{String(v).replace(/_/g, " ")}</span>;
}

/**
 * Administration landing. Everyone sees which sources are unreliable and what
 * that affects, in plain words; connector internals stay on Integrations for
 * roles with system detail. The capability matrix lives here.
 */
export default async function AdminPage() {
  const ws = await getWorkspace();
  const member = await getMember();
  const caps = ws.caps;
  const roles = Object.keys(ROLES) as RoleId[];
  const detail = caps.viewSystemDetail || caps.manageIntegrations;
  const pendingMappings = ws.data.mappings.filter((m) => m.status === "needs_review" && !ws.overlay.mappingDecisions[m.id]).length;
  const rejectedImports = ws.overlay.imports.batches.filter((b) => b.rejected > 0).length;
  const connected = ws.data.connectors.filter((c) => c.state !== "not_configured").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Data sources, who can see what, demo settings and how figures are calculated." />

      <Card
        id="sources"
        title="Data sources"
        subtitle={`${ws.sources.length ? `${ws.sources.length} of ${connected} connections need attention` : `All ${connected} connections are healthy`}. Every connection in this demo is simulated.`}
        actions={detail ? <CardLink href="/integrations">Connection detail</CardLink> : undefined}
      >
        {ws.sources.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing is out of date. Reports use current data.</p>
        ) : (
          <ul className="space-y-3">
            {ws.sources.map((s) => {
              const [tone, label] = SEVERITY[s.severity];
              return (
                <li key={s.connectorId} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone} icon={s.severity === "high" ? "!" : "◐"}>
                      {label}
                    </Badge>
                    <span className="font-medium">{s.provider}</span>
                    {s.lastSuccessfulSync && <span className="text-xs text-ink-muted">Last good sync {fmtDate(s.lastSuccessfulSync)}</span>}
                  </div>
                  <p className="mt-1 text-ink-soft">{s.summary}</p>
                  {s.affects.length > 0 && <p className="text-xs text-ink-muted">Affects: {s.affects.join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {!detail && <p className="mt-3 text-xs text-ink-muted">Connection settings and failure detail are visible to administrators.</p>}
        {detail && (pendingMappings > 0 || rejectedImports > 0) && (
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {pendingMappings > 0 && (
              <li>
                <Link href="/integrations#mappings">
                  {pendingMappings} name {pendingMappings === 1 ? "match needs" : "matches need"} review
                </Link>
                <span className="text-ink-muted"> before their data is attributed to a client or project.</span>
              </li>
            )}
            {rejectedImports > 0 && (
              <li>
                <Link href="/integrations#imports">
                  {rejectedImports} {rejectedImports === 1 ? "import" : "imports"} had rejected rows
                </Link>
              </li>
            )}
          </ul>
        )}
      </Card>

      <Card id="access" title="Who can see what" subtitle="Enforced where data is loaded, before any screen or the assistant receives it. Business data and system administration are separate permissions." padded={false}>
        <div className="px-5 pb-1 pt-4 text-sm text-ink-soft">
          You are viewing as <strong className="text-ink">{ws.user.name}</strong> ({ROLES[ws.ctx.role].label}).{" "}
          {member ? `Signed in as ${member.email}.` : PUBLIC_DEMO ? "Public preview: the role switcher previews each role and is not sign-in." : "Local demo: the role switcher previews each role and is not sign-in."}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Capability</th>
                {roles.map((r) => (
                  <th key={r} className={`th ${r === ws.ctx.role ? "text-accent" : ""}`}>
                    {ROLES[r].label}
                    {r === ws.ctx.role ? " (you)" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_LABELS.map(([k, label]) => (
                <tr key={k}>
                  <td className="td">{label}</td>
                  {roles.map((r) => (
                    <td key={r} className="td text-sm">
                      {capValue(ROLES[r].caps[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Phones get the current role's column as a list; the full matrix needs width. */}
        <ul className="divide-y divide-line sm:hidden">
          {CAPABILITY_LABELS.map(([k, label]) => (
            <li key={k} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
              <span>{label}</span>
              <span className="shrink-0">{capValue(caps[k])}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 border-t border-line px-5 py-3 text-xs text-ink-soft">
          {roles.map((r) => (
            <li key={r}>
              <strong>{ROLES[r].label}:</strong> {ROLES[r].description}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Settings and demo" actions={<CardLink href="/settings">Open</CardLink>}>
          <p className="text-sm text-ink-soft">Organization, currency, business profiles, the demo reset and the record of demo edits.</p>
        </Card>
        <Card title="How numbers are calculated" actions={<CardLink href="/calculations">Open</CardLink>}>
          <p className="text-sm text-ink-soft">Every formula behind revenue, margin, utilization, health and confidence.</p>
        </Card>
      </div>
    </div>
  );
}
