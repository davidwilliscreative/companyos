import Link from "next/link";
import { AssistantDrawer } from "@/components/Assistant";
import { Nav, type NavItem } from "@/components/Nav";
import { Switchers } from "@/components/Switchers";
import { canSwitchRole, getMember } from "@/data/member";
import { getWorkspace } from "@/data/session";
import { reportingPeriods } from "@/lib/calc/company";
import { fmtDate } from "@/lib/dates";
import { ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  const member = await getMember();
  const t = ws.profile.terms;
  const openActions = ws.data.actions.filter((a) => (a.status === "open" || a.status === "in_progress") && a.dueDate < ws.org.demoDate).length;
  const unreviewed = ws.analysis.signals.filter((s) => s.review.status === "unreviewed" && !s.autoResolved && s.polarity !== "positive").length;
  const items: NavItem[] = [
    { href: "/", label: "Overview" },
    { href: "/accounts", label: t.accounts },
    { href: "/projects", label: t.projects },
    { href: "/finance", label: ws.profile.modules.financeMode === "budget" ? "Budgets" : ws.profile.modules.financeMode === "subscription" ? "Revenue & cash" : "Finance & profitability" },
    { href: "/team", label: "Team & capacity" },
    { href: "/signals", label: ws.profile.modules.expansion ? "Signals & opportunities" : "Signals", badge: unreviewed || undefined },
    { href: "/actions", label: "Actions", badge: openActions || undefined },
    { href: "/briefing", label: "Weekly briefing" },
    { href: "/communications", label: "Communications" },
    { href: "/integrations", label: "Integrations" },
    { href: "/settings", label: "Settings & demo" },
    { href: "/calculations", label: "How numbers are calculated" },
  ];
  const degraded = ws.data.connectors.filter((c) => c.state === "degraded" || c.state === "failed" || c.state === "stale");
  const suggestions =
    ws.profile.id === "agency"
      ? ["Which accounts need attention this week, and why?", "Which projects are forecast to miss their margin targets?", "What is blocking this launch, and who owns the next step?", "Which overdue invoices most affect our cash outlook?", "Can we accept a new project given current staffing?", "What changed since last week?", "Where do we have credible expansion opportunities?"]
      : ws.profile.id === "saas"
        ? ["Which customers need attention this week, and why?", "Which renewals are at risk?", "Why did Quarry Health's health decline?", "Where do we have credible expansion opportunities?", "What is blocking the SSO launch?", "What changed since last week?"]
        : ["Which business units need attention this week?", "Which initiatives are over budget?", "What is blocking the field service pilot?", "What changed since last week?", "Can we take on a new initiative given current staffing?"];

  return (
    <>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="lg:flex">
          <Nav items={items} orgName={ws.org.name} profileLabel={ws.profile.label} />
          <div className="min-w-0 flex-1">
            <div className="border-b border-[#f1dfb8] bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
              <strong>Demo.</strong> Synthetic data only. All connector statuses are simulated and the assistant is a deterministic simulation (no AI service connected). Not production-ready.
            </div>
            <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur lg:px-8">
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                <span>
                  Demo date <strong className="text-ink">{fmtDate(ws.org.demoDate)}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Viewing as <strong className="text-ink">{ws.user.name}</strong> ({ROLES[ws.ctx.role].label})
                </span>
                <span aria-hidden="true">·</span>
                {member && (
                  <>
                    <span>
                      Signed in as <strong className="text-ink">{member.displayName ?? member.email}</strong>{" "}
                      <a href="/auth/sign-out" className="text-ink-soft underline">
                        Sign out
                      </a>
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <Link href="/integrations" className={degraded.length ? "text-warn" : "text-ink-soft"}>
                  {degraded.length ? `⚠︎ ${degraded.length} data source${degraded.length === 1 ? "" : "s"} stale or degraded` : "All sources fresh (simulated)"}
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Switchers profile={ws.ctx.profileId} role={ws.ctx.role} period={ws.analysis.period.key} periods={reportingPeriods(ws.data).map((p) => ({ key: p.key, label: p.label }))} roleUser={ws.user.name} canSwitchRole={canSwitchRole(member)} />
                <AssistantDrawer suggestions={suggestions} />
              </div>
            </header>
            <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
              {ws.scopeNote && <div className="mb-4 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-soft">{ws.scopeNote} Other accounts are not loaded for this role.</div>}
              {children}
            </main>
          </div>
        </div>
    </>
  );
}
