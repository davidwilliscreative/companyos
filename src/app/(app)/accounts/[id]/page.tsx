import Link from "next/link";
import { notFound } from "next/navigation";
import { AskAssistantButton, AssistantScope } from "@/components/Assistant";
import { UsageChart } from "@/components/Charts";
import { SignalRow } from "@/components/blocks";
import { IssueCard, ISSUE_KIND_LABEL } from "@/components/issues";
import { FlightTable, LaunchTable } from "@/components/profile-panels";
import { LevelBadge, StatusPanel } from "@/components/status";
import { Badge, Card, DefList, EmptyState, KindTag, MilestoneBadge, Notice, PageHeader, SeverityBadge, Tabs, CardLink } from "@/components/ui";
import { ChangeRow } from "@/components/weekly";
import { getWorkspace } from "@/data/session";
import { invoiceStatus, paymentBehavior } from "@/lib/calc/company";
import { addMonths, fmtDate, fmtMonthShort, monthsBetween, relativeDays } from "@/lib/dates";
import { interpretAccount } from "@/lib/interpret";
import { buildIssues } from "@/lib/issues";
import { fmtPct, fmtPts } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const ws = await getWorkspace();
  const acc = ws.data.accounts.find((a) => a.id === id);
  if (!acc) notFound();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const h = a.health[acc.id];
  const issues = buildIssues(ws);
  const mine = issues.filter((i) => i.accountIds.includes(acc.id));
  const titles = Object.fromEntries(issues.map((i) => [i.id, i.title]));
  const it = interpretAccount(ws, acc.id, issues);
  const projects = ws.data.projects.filter((p) => p.accountId === acc.id);
  const signals = a.signals.filter((s) => s.accountId === acc.id);
  const openRisks = signals.filter((s) => s.polarity === "risk" && !s.autoResolved && s.review.status !== "dismissed" && s.review.status !== "resolved");
  const closedSignals = signals.filter((s) => s.autoResolved || s.review.status === "dismissed" || s.review.status === "resolved");
  const positives = signals.filter((s) => s.polarity !== "risk" && !closedSignals.includes(s));
  const opps = a.opportunities.filter((o) => o.accountId === acc.id);
  const invoices = ws.data.invoices.filter((i) => i.accountId === acc.id).sort((x, y) => (x.issueDate < y.issueDate ? 1 : -1));
  const threads = ws.data.threads.filter((th) => th.accountId === acc.id).sort((x, y) => ((x.messages.at(-1)?.sentAt ?? "") < (y.messages.at(-1)?.sentAt ?? "") ? 1 : -1));
  const actions = ws.data.actions.filter((x) => x.accountId === acc.id || mine.some((i) => i.plans.some((p) => p.actionId === x.id)));
  const contracts = ws.data.contracts.filter((c) => c.accountId === acc.id);
  const sub = ws.data.subscriptions.find((s) => s.accountId === acc.id);
  const pay = ws.profile.modules.invoices && ws.caps.viewCommercialTerms ? paymentBehavior(ws.data, acc.id) : null;
  const renewal = a.renewals.find((r) => r.accountId === acc.id);
  const months = monthsBetween(ws.org.dataStart, addMonths(ws.org.demoDate, 0));
  const showInvoices = ws.profile.modules.invoices && ws.caps.viewCommercialTerms;
  const changes = ws.changes.items.filter((c) => c.accountId === acc.id);
  const mode = ws.profile.modules.financeMode;
  const launches = Object.values(a.launches).filter((r) => r.launch.accountId === acc.id);
  const flights = Object.values(a.media).filter((m) => m.flight.accountId === acc.id);

  // Tabs adapt to the profile and the role; a tab with nothing in it is not shown.
  const hasFinancials = showInvoices || (ws.caps.viewProjectCosts && projects.some((p) => a.projectFin[p.id])) || !!sub;
  const tabs = [
    { key: "overview", label: "Overview" },
    ...(projects.length ? [{ key: "delivery", label: mode === "budget" ? "Initiatives" : "Delivery", count: projects.filter((p) => p.status !== "completed").length }] : []),
    ...(hasFinancials ? [{ key: "financials", label: mode === "budget" ? "Budget" : mode === "subscription" ? "Billing and usage" : "Financials" }] : []),
    { key: "evidence", label: "Evidence and history", count: openRisks.length },
  ];
  const tab = tabs.some((x) => x.key === tabParam) ? tabParam! : "overview";
  const [key, ...rest] = mine.filter((i) => i.kind !== "opportunity");

  return (
    <div className="space-y-6">
      <AssistantScope kind="account" id={acc.id} label={`This ${t.account.toLowerCase()}`} name={acc.name} suggestions={[`What is the current status of ${acc.name}?`, "What are the main risks right now?", "What is blocking delivery, and who owns the next step?", showInvoices ? "Are there overdue invoices?" : "What changed since last week?"]} />
      <PageHeader
        eyebrow={
          <Link href="/accounts" className="text-ink-muted">
            ← {t.accounts}
          </Link>
        }
        title={acc.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <LevelBadge level={it.overall}>{it.overallLabel}</LevelBadge>
            <span>
              {acc.industry} · {t.owner}: {v.person(acc.ownerId)}
              {renewal ? ` · renews ${fmtDate(renewal.renewalDate)}` : ""}
            </span>
          </span>
        }
        actions={<AskAssistantButton label={`Ask about this ${t.account.toLowerCase()}`} />}
      />

      <Tabs base={`/accounts/${acc.id}`} tabs={tabs} current={tab} />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <StatusPanel
              it={it}
              why={
                <div id="health" className="space-y-3">
                  <p className="text-sm text-ink-soft">
                    The weighted health score is <strong className="text-ink">{h.score ?? "—"}/100</strong> ({h.status.replace("_", " ")}) with {fmtPct(h.completeness)} of inputs available. It averages the components below, so a single serious problem can be hidden by good results elsewhere; the status above judges each dimension on its own. <Link href="/calculations#health">Method</Link>
                  </p>
                  {h.dataGaps.length > 0 && (
                    <Notice title={h.status === "insufficient" ? "Not enough current information" : "Data gaps"}>
                      <ul className="list-disc pl-5">
                        {h.dataGaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </Notice>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    {h.components.map((c) => (
                      <div key={c.key} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-sm tabular-nums">
                            {c.score === null ? <span className="text-ink-muted">no data</span> : <strong>{c.score}</strong>} <span className="text-xs text-ink-muted">· weight {fmtPct(c.weight)}</span>
                          </div>
                        </div>
                        {c.note && <p className="mt-1 text-xs text-ink-muted">{c.note}</p>}
                        {c.factors.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {c.factors.map((f, i) => (
                              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                                <span>{f.link ? <Link href={v.href(f.link)}>{f.label}</Link> : f.label}</span>
                                <span className={`shrink-0 tabular-nums ${f.effect < 0 ? "text-bad" : "text-good"}`}>
                                  {f.effect > 0 ? "+" : ""}
                                  {f.effect}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              }
            />

            <section aria-labelledby="key-issue" className="space-y-3">
              <h2 id="key-issue" className="text-lg font-semibold tracking-tight">
                {key ? "Key issue" : "Issues"}
              </h2>
              {key ? <IssueCard ws={ws} issue={key} titles={titles} /> : <EmptyState title={`Nothing needs attention for ${acc.name}`}>Missing or stale data would appear here.</EmptyState>}
              {rest.length > 0 && (
                <div className="card p-4">
                  <div className="mb-2 text-sm font-medium">Also open for this {t.account.toLowerCase()}</div>
                  <ul className="space-y-2 text-sm">
                    {rest.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={i.severity} />
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{ISSUE_KIND_LABEL[i.kind]}</span>
                        <Link href={`/issues#${i.id}`}>{i.title}</Link>
                        <span className="text-xs text-ink-muted">· {v.person(i.ownerId)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <Card title="Plans" actions={<CardLink href={`/actions?account=${acc.id}`}>All</CardLink>}>
              {actions.length === 0 ? (
                <p className="text-sm text-ink-muted">No plans yet. Create one from an issue.</p>
              ) : (
                <ul className="space-y-2.5">
                  {actions.map((x) => (
                    <li key={x.id} className="text-sm">
                      <Link href={`/actions#${x.id}`}>{x.title}</Link>
                      <div className="text-xs text-ink-muted">
                        {v.person(x.ownerId)} · {x.status.replace("_", " ")} · {x.status === "done" ? "completed" : `next update ${fmtDate(x.dueDate)}`}
                        {x.dueDate < ws.org.demoDate && (x.status === "open" || x.status === "in_progress") ? <span className="font-medium text-bad"> · overdue</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Details">
              <DefList
                items={[
                  [t.owner, v.person(acc.ownerId)],
                  ["Services", acc.services.join(", ") || "—"],
                  ...(renewal ? ([["Next renewal", `${fmtDate(renewal.renewalDate, { year: true })}${renewal.noticeDate ? ` (notice by ${fmtDate(renewal.noticeDate)})` : ""}${renewal.annualValue !== null ? ` · ${v.money(renewal.annualValue, { compact: true })} a year` : ""}`]] as [string, string][]) : []),
                  ...contracts.map((c) => [t.contract, `${c.name} · ${c.type.replace("_", " ")} · ${fmtDate(c.startDate)} – ${fmtDate(c.endDate, { year: true })}`] as [string, string]),
                  ["Last client contact", h.lastClientContact ? `${fmtDate(h.lastClientContact)} (${relativeDays(ws.org.demoDate, h.lastClientContact)})` : "None on record"],
                ]}
              />
              {acc.contacts.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-1 text-xs font-medium text-ink-muted">Contacts</div>
                  <ul className="space-y-1 text-sm">
                    {acc.contacts.map((c) => (
                      <li key={c.email}>
                        {c.name} <span className="text-xs text-ink-muted">· {c.title}{c.primary ? " · primary" : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "delivery" && (
        <div className="space-y-3">
          {launches.length > 0 && (
            <Card title="Retail launches" subtitle="Shelf dates and the print deadlines behind them." padded={false}>
              <LaunchTable ws={ws} rows={launches} showAccount={false} />
            </Card>
          )}
          {flights.length > 0 && (
            <Card title="Media flights" subtitle="Spend and KPI against plan, from ad platform reporting." padded={false}>
              <FlightTable ws={ws} rows={flights} showAccount={false} />
            </Card>
          )}
          {projects.map((p) => {
            const f = a.projectFin[p.id];
            const ms = ws.data.milestones.filter((m) => m.projectId === p.id && a.milestones[m.id]?.state !== "done").sort((x, y) => (a.milestones[x.id].due < a.milestones[y.id].due ? -1 : 1));
            return (
              <article key={p.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-semibold">
                    <Link href={`/projects/${p.id}`}>{p.name}</Link>
                  </h3>
                  <span className="text-xs text-ink-muted">
                    {p.status.replace("_", " ")} · {p.billing.replace("_", " ")} · owner {v.person(p.ownerId)} · ends {fmtDate(p.currentEndDate)}
                    {p.currentEndDate !== p.originalEndDate && <span className="text-warn"> (was {fmtDate(p.originalEndDate)})</span>}
                  </span>
                </div>
                {ms.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {ms.slice(0, 4).map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2">
                        <MilestoneBadge state={a.milestones[m.id].state} />
                        <Link href={`/projects/${p.id}#${m.id}`}>{m.name}</Link>
                        <span className="text-xs text-ink-muted">
                          due {fmtDate(a.milestones[m.id].due)} · {v.person(m.ownerId)}
                          {m.blockedReason ? ` · ${m.blockedReason}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">No open milestones.</p>
                )}
                {ws.caps.viewProjectCosts && f && f.margin.forecastAtCompletion !== null && f.margin.target !== null && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Forecast margin {fmtPct(f.margin.forecastAtCompletion)} against a {fmtPct(f.margin.target)} target ({fmtPts(f.margin.forecastAtCompletion - f.margin.target)}). <Link href={`/projects/${p.id}?tab=financials`}>Financials</Link>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === "financials" && (
        <div className="space-y-6">
          {ws.caps.viewProjectCosts && projects.some((p) => a.projectFin[p.id]) && (
            <Card title={mode === "budget" ? "Forecast against budget" : "Project margins"} subtitle="Forecast at completion for each piece of work; past and future are not mixed." padded={false}>
              <ul className="divide-y divide-line">
                {projects.map((p) => {
                  const f = a.projectFin[p.id];
                  if (!f) return null;
                  return (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                      <span>
                        <Link href={`/projects/${p.id}?tab=financials`}>{p.name}</Link>
                        <span className="block text-xs text-ink-muted">{p.status === "completed" ? "Completed" : "Forecast at completion"}</span>
                      </span>
                      {mode === "budget" || p.billing === "internal" ? (
                        <span className={f.budget.forecastVsBudget !== null && f.budget.forecastVsBudget > 0 ? "text-bad" : "text-good"}>{f.budget.forecastVsBudget !== null ? `${v.money(f.budget.forecastVsBudget, { compact: true, sign: true })} vs budget` : "—"}</span>
                      ) : (
                        <span className={f.margin.variance !== null && f.margin.variance < -0.05 ? "font-medium text-bad" : ""}>
                          {fmtPct(f.margin.forecastAtCompletion)} <span className="text-xs text-ink-muted">vs {fmtPct(f.margin.target)} target{f.margin.variance !== null ? ` (${fmtPts(f.margin.variance)})` : ""}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {sub && (
            <Card title="Subscription and usage" actions={<KindTag kind="observed" />}>
              <DefList
                items={[
                  ["Plan", `${sub.plan}, ${sub.seats} seats`],
                  ...(ws.caps.viewCommercialTerms ? ([["Monthly recurring revenue", v.money(sub.mrr)]] as [string, string][]) : []),
                  ["Renewal", `${fmtDate(sub.renewalDate, { year: true })} (${relativeDays(ws.org.demoDate, sub.renewalDate)})`],
                ]}
              />
              <div className="mt-3">
                <UsageChart data={sub.activeSeatsByMonth.map((n, i) => ({ label: fmtMonthShort(months[i] ?? ""), active: n, seats: sub.seats }))} />
                {sub.activeSeatsByMonth.some((x) => x === null) && <p className="text-xs text-warn">Usage data missing for {sub.activeSeatsByMonth.filter((x) => x === null).length} month(s). Gaps are shown as breaks, not zeros.</p>}
              </div>
            </Card>
          )}

          {showInvoices && (
            <Card id="invoices" title="Invoices and payments" subtitle={pay && pay.avgDaysLate !== null ? `Pays on average ${Math.abs(pay.avgDaysLate)} days ${pay.avgDaysLate >= 0 ? "after" : "before"} the due date, across ${pay.sample} paid invoices.` : "No paid invoices to infer payment behavior."} padded={false}>
              {invoices.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">No invoices.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {invoices.map((i) => {
                    const s = invoiceStatus(ws.data, i);
                    return (
                      <li key={i.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-5 py-3 text-sm">
                        <Link href={`/finance/invoices/${i.id}`}>{i.number}</Link>
                        <span className="text-right tabular-nums">{v.money(i.amount)}</span>
                        <span className="text-xs text-ink-muted">
                          Issued {fmtDate(i.issueDate)} · due {fmtDate(i.dueDate)}
                        </span>
                        <span className="text-right text-xs">
                          {s.bucket === "paid" ? (
                            <span className="text-good">✓ Paid {fmtDate(s.paidOn ?? undefined)}</span>
                          ) : s.daysOverdue > 0 ? (
                            <span className={`font-medium ${s.daysOverdue > 60 ? "text-bad" : "text-warn"}`}>! {v.money(s.outstanding, { compact: true })} · {s.daysOverdue} days overdue</span>
                          ) : (
                            <span className="text-ink-soft">Not yet due</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "evidence" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card id="signals" title="Risk signals" subtitle="Inferred from communications. Confidence describes evidence strength, not a probability." actions={<CardLink href={`/signals?account=${acc.id}`}>All signals</CardLink>}>
              {openRisks.length === 0 ? <p className="text-sm text-ink-muted">No open risk signals.</p> : <ul className="divide-y divide-line">{openRisks.map((s) => <SignalRow key={s.id} ws={ws} s={s} />)}</ul>}
              {positives.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Positive and opportunity signals</div>
                  <ul className="divide-y divide-line">{positives.map((s) => <SignalRow key={s.id} ws={ws} s={s} />)}</ul>
                </div>
              )}
              {closedSignals.length > 0 && (
                <details className="mt-4 border-t border-line pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-ink-muted">Resolved and dismissed ({closedSignals.length}), kept for history</summary>
                  <ul className="mt-2 divide-y divide-line">{closedSignals.map((s) => <SignalRow key={s.id} ws={ws} s={s} />)}</ul>
                </details>
              )}
            </Card>
            {opps.length > 0 && (
              <Card title="Expansion opportunities" subtitle="Manual estimates are never counted as committed revenue">
                <ul className="space-y-3">
                  {opps.map((o) => (
                    <li key={o.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/signals?tab=opportunities#${o.id}`} className="font-medium">
                          {o.offering}
                        </Link>
                        <Badge tone={o.readiness === "ready" ? "good" : o.readiness === "developing" ? "accent" : "neutral"}>{o.readiness}</Badge>
                      </div>
                      <blockquote className="mt-1 border-l-2 border-line pl-2 text-ink-soft">“{o.need}”</blockquote>
                      <div className="mt-1 text-xs text-ink-muted">
                        {o.readinessReason} · {o.estimatedValue !== null ? <>Manual estimate {v.money(o.estimatedValue)}</> : "Value not estimated"}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card title="Changes in the last 7 days">
              {changes.length === 0 ? <p className="text-sm text-ink-muted">No changes.</p> : <ul className="space-y-3">{changes.map((c, i) => <ChangeRow key={i} ws={ws} c={c} />)}</ul>}
            </Card>
            <Card title="Conversations" subtitle="Simulated, from authorized mailboxes and channels only">
              {threads.length === 0 ? (
                <p className="text-sm text-ink-muted">{ws.caps.communications === "none" ? "Message content is restricted for your role." : "No conversations visible to your role."}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {threads.slice(0, 10).map((th) => (
                    <li key={th.id}>
                      <Link href={`/communications/${th.id}`}>{th.subject}</Link>
                      <div className="text-xs text-ink-muted">
                        {th.channel} · {th.messages.length} messages · last {fmtDate(th.messages.at(-1)?.sentAt.slice(0, 10))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
