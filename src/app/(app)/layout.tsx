import Link from "next/link";
import { AssistantDrawer } from "@/components/Assistant";
import { Nav, type NavItem } from "@/components/Nav";
import { Switchers } from "@/components/Switchers";
import { canSwitchRole, getMember } from "@/data/member";
import { getWorkspace } from "@/data/session";
import { reportingPeriods } from "@/lib/calc/company";
import { fmtDate } from "@/lib/dates";
import { ROLES, aggregateScope } from "@/lib/permissions";

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

  const switcherProps = { profile: ws.ctx.profileId, role: ws.ctx.role, period: ws.analysis.period.key, periods: reportingPeriods(ws.data).map((p) => ({ key: p.key, label: p.label })), roleUser: ws.user.name, canSwitchRole: canSwitchRole(member) };

  return (
    <>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="lg:flex">
          <Nav items={items} orgName={ws.org.name} profileLabel={ws.profile.label} controls={<Switchers {...switcherProps} show={["profile", "role"]} variant="sidebar" />} />
          <div className="min-w-0 flex-1">
            <header className="relative z-30 border-b border-line bg-canvas/80 backdrop-blur-xl lg:sticky lg:top-0">
              <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-10">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                  <span title="Synthetic data only. All connector statuses are simulated and the assistant is a deterministic simulation (no AI service connected). Not production-ready." className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn ring-1 ring-inset ring-warn-line">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warn" />
                    Demo · synthetic data
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-inset ring-line">
                    <span className="text-ink-muted">Today</span>
                    <strong className="font-semibold text-ink">{fmtDate(ws.org.demoDate)}</strong>
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-inset ring-line 2xl:inline-flex">
                    <span className="text-ink-muted">Viewing as</span>
                    <strong className="font-semibold text-ink">{ws.user.name}</strong>
                    <span className="text-ink-muted">· {ROLES[ws.ctx.role].label}</span>
                  </span>
                  <Link href="/integrations" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs no-underline ring-1 ring-inset ${degraded.length ? "bg-warn-soft/60 text-warn ring-warn-line hover:text-warn" : "bg-surface text-ink-soft ring-line hover:text-ink"}`}>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${degraded.length ? "bg-warn" : "bg-good"}`} />
                    {degraded.length ? `${degraded.length} source${degraded.length === 1 ? "" : "s"} stale` : "Sources fresh"}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Switchers {...switcherProps} show={["period"]} />
                  <AssistantDrawer suggestions={suggestions} broadScope={aggregateScope(ws.caps)} />
                  {member && (
                    <a href="/auth/sign-out" title={`Signed in as ${member.email}. Sign out`} className="group inline-flex h-9 items-center gap-2 rounded-full bg-surface pl-1 pr-3 text-xs font-medium text-ink-soft no-underline ring-1 ring-inset ring-line hover:text-ink">
                      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">
                        {(member.displayName ?? member.email).slice(0, 2).toUpperCase()}
                      </span>
                      Sign out
                    </a>
                  )}
                </div>
              </div>
            </header>
            <main id="main" className="mx-auto max-w-[1400px] px-4 pb-16 pt-8 lg:px-10 lg:pt-10">
              {ws.scopeNote && <div className="mb-6 rounded-xl border border-accent-line bg-accent-soft/60 px-4 py-2.5 text-[13px] text-ink-soft">{ws.scopeNote} Other accounts are not loaded for this role.</div>}
              {children}
            </main>
          </div>
        </div>
    </>
  );
}
