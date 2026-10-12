import { CurrencyForm, MembersManager, ResetButton } from "@/components/forms";
import { Card, CardLink, DefList, PageHeader } from "@/components/ui";
import { getMember } from "@/data/member";
import { persistenceDescription } from "@/data/persistence";
import { getWorkspace, readStore } from "@/data/session";
import { headers } from "next/headers";
import { PROFILES } from "@/domain/profiles";
import type { RoleId } from "@/domain/types";
import { fmtDate } from "@/lib/dates";
import { DEMO_FX_TO_USD } from "@/lib/money";
import { ROLES } from "@/lib/permissions";
import { PROFILE_LINKS } from "@/lib/profile-links";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PUBLIC_DEMO } from "@/lib/supabase/config";

export default async function SettingsPage() {
  const ws = await getWorkspace();
  const audit = (await readStore())
    .read()
    .audit.filter((x) => x.orgId === ws.org.id && (ws.caps.recordScope === "all" || x.actor === ws.user.id))
    .slice(-15)
    .reverse();
  const roles = Object.keys(ROLES) as RoleId[];
  const member = await getMember();
  const members =
    member?.role === "executive"
      ? ((await supabaseAdmin().from("members").select("email, role, display_name").order("email")).data ?? []).map((x) => ({ email: x.email as string, role: x.role as RoleId, displayName: x.display_name as string | null }))
      : null;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings and demo controls"
        subtitle={
          member
            ? `Signed in as ${member.email} (${ROLES[member.role].label}). ${member.role === "executive" ? "As an executive you can preview other roles from the header." : ""}`
            : PUBLIC_DEMO
              ? "Public preview. Anyone with the link can view and try the synthetic demo; changes go to a shared sandbox."
              : "Local demo. The role switcher simulates who is signed in; it is not authentication."
        }
      />
      {members && member && (
        <Card title="People with access" subtitle="Only these Google accounts can sign in. Their role decides what data is loaded for them.">
          <MembersManager members={members} me={member.email} />
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Organization">
          <DefList
            items={[
              ["Name", ws.org.name],
              ["Profile", PROFILES[ws.ctx.profileId].label],
              ["Demo date (controlled “today”)", fmtDate(ws.org.demoDate, { year: true })],
              ["History loaded from", fmtDate(ws.org.dataStart, { year: true })],
              ["Working hours / year (full time)", ws.org.annualWorkingHours.toLocaleString()],
              ["Default target margin", `${Math.round(ws.org.defaultTargetMargin * 100)}%`],
            ]}
          />
          <div className="mt-4 border-t border-line pt-4">
            <CurrencyForm current={ws.org.reportingCurrency} canChange={ws.caps.recordScope === "all"} />
            <p className="mt-2 text-xs text-ink-muted">
              Records in other currencies are converted with fixed demo rates:{" "}
              {Object.entries(DEMO_FX_TO_USD)
                .filter(([c]) => c !== "USD")
                .map(([c, r]) => `1 ${c} = ${r} USD`)
                .join(", ")}
              . A production system would use dated rates from the finance provider.
            </p>
          </div>
        </Card>
        <Card title="Reset demo">
          <p className="mb-3 text-sm text-ink-soft">
            Edits (actions, comments, signal reviews, opportunity estimates, applied scenarios, mapping decisions, imports and currency) are {persistenceDescription().text}. Resetting restores the original synthetic data for all three
            profiles.
          </p>
          {!member || member.role === "executive" ? <ResetButton /> : <p className="text-xs text-ink-muted">Only executives can reset the shared demo data.</p>}
        </Card>
      </div>

      <Card title="Roles and permissions" actions={<CardLink href="/admin#access">Who can see what</CardLink>}>
        <p className="text-sm text-ink-soft">
          Each role loads only the data it is allowed to see. The full capability matrix is in Administration. Demo personas:{" "}
          {roles.map((r, i) => (
            <span key={r}>
              {i > 0 && ", "}
              {ROLES[r].label} {ws.data.people.find((p) => p.id === ws.org.demoPersonas[r])?.name}
            </span>
          ))}
          .
        </p>
      </Card>

      <Card title="Direct links" subtitle="Send one of these to open the app on a profile. Add a role to the end, for example /media_agency/finance, to also pick the role where the role switcher is available.">
        <ul className="divide-y divide-line text-sm">
          {Object.values(PROFILES).map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span className="font-medium">{p.label}</span>
              <a href={`/${PROFILE_LINKS[p.id]}`} className="break-all font-mono text-[13px]">
                {origin}/{PROFILE_LINKS[p.id]}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Business profiles" subtitle="Switch profiles in the header. Each has its own organization, data, terminology and modules." padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className="th">Setting</th>
                {Object.values(PROFILES).map((p) => (
                  <th key={p.id} className="th">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td">Accounts are</td>
                {Object.values(PROFILES).map((p) => (
                  <td key={p.id} className="td">
                    {p.terms.accounts}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td">Work is</td>
                {Object.values(PROFILES).map((p) => (
                  <td key={p.id} className="td">
                    {p.terms.projects}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td">Finance mode</td>
                {Object.values(PROFILES).map((p) => (
                  <td key={p.id} className="td">
                    {p.modules.financeMode}
                  </td>
                ))}
              </tr>
              {(["billableUtilization", "invoices", "projectMargins", "subscriptions", "expansion", "retailLaunches", "mediaPacing"] as const).map((m) => (
                <tr key={m}>
                  <td className="td">{m.replace(/([A-Z])/g, " $1").toLowerCase()}</td>
                  {Object.values(PROFILES).map((p) => (
                    <td key={p.id} className="td">
                      {p.modules[m] ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="td">Health components</td>
                {Object.values(PROFILES).map((p) => (
                  <td key={p.id} className="td text-xs">
                    {p.healthComponents.map((c) => `${c.label} ${Math.round(c.weight * 100)}%`).join(", ")}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent demo edits (audit trail)">
        {audit.length === 0 ? (
          <p className="text-sm text-ink-muted">No edits yet for this organization.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {audit.map((x, i) => (
              <li key={i}>
                <span className="text-ink-muted">{x.at.slice(0, 16).replace("T", " ")}</span> · <code>{x.action}</code> · {ws.data.people.find((p) => p.id === x.actor)?.name ?? x.actor} · {x.detail}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
