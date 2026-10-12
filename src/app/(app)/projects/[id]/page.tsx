import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalRow, peopleOptions } from "@/components/blocks";
import { ChangeRow } from "@/components/weekly";
import { AskAssistantButton, AssistantScope } from "@/components/Assistant";
import { ActionForm } from "@/components/forms";
import { ScenarioCalculator } from "@/components/ScenarioCalculator";
import { IssueCard } from "@/components/issues";
import { FlightTable, LaunchTable } from "@/components/profile-panels";
import { StatusPanel } from "@/components/status";
import { Badge, Card, DefList, EmptyState, MilestoneBadge, Notice, PageHeader, Restricted, SeverityBadge, SourceTag, Stat, Tabs, CardLink } from "@/components/ui";
import { interpretProject } from "@/lib/interpret";
import { buildIssues } from "@/lib/issues";
import { scenarioBaseFor } from "@/data/scenario-base";
import { getWorkspace } from "@/data/session";
import { addDays, fmtDate, fmtMonth, relativeDays } from "@/lib/dates";
import { plannedHoursBetween } from "@/lib/calc/finance";
import { fmtHours, fmtPct, fmtPts } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

const BILLING_LABEL: Record<string, string> = { fixed_fee: "Fixed fee", retainer: "Retainer", time_materials: "Time & materials", internal: "Internal initiative" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; explore?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ws = await getWorkspace();
  const p = ws.data.projects.find((x) => x.id === id);
  if (!p) notFound();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const f = a.projectFin[p.id];
  const milestones = ws.data.milestones.filter((m) => m.projectId === p.id).sort((x, y) => (a.milestones[x.id].due < a.milestones[y.id].due ? -1 : 1));
  const tasks = ws.data.tasks.filter((x) => x.projectId === p.id).sort((x, y) => (x.due < y.due ? -1 : 1));
  const threads = ws.data.threads.filter((th) => th.projectId === p.id);
  const actions = ws.data.actions.filter((x) => x.links.some((l) => (l.type === "project" && l.id === p.id) || milestones.some((m) => l.type === "milestone" && l.id === m.id)));
  const base = scenarioBaseFor(ws, p);
  const adj = ws.overlay.projectAdjustments[p.id];
  const deps = p.dependsOn.map((d) => ws.planning.projects.find((x) => x.id === d)).filter(Boolean);
  const dependents = ws.data.projects.filter((x) => x.dependsOn.includes(p.id));
  const launches = Object.values(a.launches).filter((r) => r.launch.projectId === p.id);
  const flights = Object.values(a.media).filter((m) => m.flight.projectId === p.id);
  const hoursByPerson = new Map<string, { hours: number; billable: number }>();
  for (const e of ws.data.timeEntries) {
    if (e.projectId !== p.id) continue;
    const cur = hoursByPerson.get(e.personId) ?? { hours: 0, billable: 0 };
    cur.hours += e.hours;
    if (e.billable) cur.billable += e.hours;
    hoursByPerson.set(e.personId, cur);
  }
  const internal = p.billing === "internal";
  const showMoney = ws.caps.viewProjectCosts && !!f;
  const issues = buildIssues(ws);
  const titles = Object.fromEntries(issues.map((i) => [i.id, i.title]));
  const mine = issues.filter((i) => i.projectIds.includes(p.id) || i.parts.some((x) => x.links.some((l) => l.type === "project" && l.id === p.id)));
  const [key, ...others] = mine;
  const it = interpretProject(ws, p.id, issues);
  // Blockers come before any calculation: blocked or late milestones and blocked tasks, with who owns the next step.
  const blockers = [
    ...milestones.filter((m) => ["blocked", "late", "awaiting_client"].includes(a.milestones[m.id].state)).map((m) => ({ id: m.id, name: m.name, state: a.milestones[m.id].state === "awaiting_client" ? "Waiting on approval" : a.milestones[m.id].state === "late" ? "Late" : "Blocked", tone: (a.milestones[m.id].state === "awaiting_client" ? "warn" : "bad") as "warn" | "bad", reason: m.blockedReason ?? `Due ${fmtDate(a.milestones[m.id].due)}`, ownerId: m.ownerId })),
    ...tasks.filter((x) => x.status === "blocked").map((x) => ({ id: x.id, name: x.title, state: "Blocked task", tone: "bad" as const, reason: x.blockerNote ?? "Blocked", ownerId: x.assigneeId ?? p.ownerId })),
  ];
  const projectSignals = a.signals.filter((x) => x.projectId === p.id && x.polarity === "risk" && !x.autoResolved && x.review.status !== "dismissed");
  const changes = ws.changes.items.filter((c) => c.projectId === p.id || c.links.some((l) => milestones.some((m) => m.id === l.id)));
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "delivery", label: "Delivery", count: blockers.length },
    ...(ws.caps.viewProjectCosts && f ? [{ key: "financials", label: internal ? "Budget" : "Financials" }] : []),
    { key: "team", label: "Team" },
    { key: "evidence", label: "Evidence", count: projectSignals.length },
  ];
  const tab = tabs.some((x) => x.key === sp.tab) ? sp.tab! : "overview";
  const exploreOpen = sp.explore === "1";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/projects" className="text-ink-muted">
            ← {t.projects}
          </Link>
        }
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{BILLING_LABEL[p.billing]}</Badge>
            <Badge>{p.status.replace("_", " ")}</Badge>
            {p.accountId && <Link href={`/accounts/${p.accountId}`}>{v.account(p.accountId)}</Link>}
            <span>
              Owner {v.person(p.ownerId)} · {fmtDate(p.startDate)} – {fmtDate(p.currentEndDate, { year: true })}
              {p.currentEndDate !== p.originalEndDate && <span className="text-warn"> (originally {fmtDate(p.originalEndDate)})</span>}
            </span>
          </span>
        }
        actions={<AskAssistantButton label={`Ask about this ${t.project.toLowerCase()}`} />}
      />
      <AssistantScope kind="project" id={p.id} label={`This ${t.project.toLowerCase()}`} name={p.name} suggestions={[`What is the current status of ${p.name}?`, `What is blocking ${p.name}?`, ...(ws.caps.viewProjectCosts ? [`Why is ${p.name} forecast at this margin?`] : []), "Who is overloaded right now?"]} />
      <Tabs base={`/projects/${p.id}`} tabs={tabs} current={tab} />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <p className="max-w-3xl text-sm text-ink-soft">{p.description}</p>
            <StatusPanel it={it} />
            {blockers.length > 0 && (
              <Card title="Blockers" subtitle="What is stopping progress, and who owns the next step">
                <ul className="space-y-2.5 text-sm">
                  {blockers.map((b) => (
                    <li key={b.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={b.tone} icon="■">{b.state}</Badge>
                        <Link href={`#${b.id}`} className="font-medium">{b.name}</Link>
                      </div>
                      <div className="mt-0.5 text-ink-soft">{b.reason}</div>
                      <div className="text-xs text-ink-muted">Next step owner: {v.person(b.ownerId)}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <section aria-labelledby="key-issue" className="space-y-3">
              <h2 id="key-issue" className="text-lg font-semibold tracking-tight">{key ? "Key issue" : "Issues"}</h2>
              {key ? <IssueCard ws={ws} issue={key} titles={titles} /> : <EmptyState title={`Nothing needs attention on this ${t.project.toLowerCase()}`} />}
              {others.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {others.map((i) => (
                    <li key={i.id}>
                      Also: <Link href={`/issues#${i.id}`}>{i.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="space-y-6">
        <Card title="Plans">
          {actions.length > 0 && (
            <ul className="mb-3 space-y-1.5 text-sm">
              {actions.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <SeverityBadge severity={x.severity} />
                  <Link href={`/actions#${x.id}`}>{x.title}</Link>
                </li>
              ))}
            </ul>
          )}
          <ActionForm label="Create plan" people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={ws.org.demoDate} defaults={{ ownerId: p.ownerId, dueDate: addDays(ws.org.demoDate, 7), accountId: p.accountId, links: [{ type: "project", id: p.id }] }} />
        </Card>
          </div>
        </div>
      )}

      {tab === "delivery" && (
        <div className="space-y-6">
      {launches.length > 0 && (
        <Card title="Retail launches" subtitle="Shelf dates this project's artwork release has to meet." padded={false}>
          <LaunchTable ws={ws} rows={launches} showAccount={false} />
        </Card>
      )}
      {flights.length > 0 && (
        <Card title="Media flights" subtitle="Spend and KPI against plan, from ad platform reporting." padded={false}>
          <FlightTable ws={ws} rows={flights} showAccount={false} />
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Milestones" padded={false}>
          {milestones.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No milestones.</p>
          ) : (
            <ul className="divide-y divide-line">
              {milestones.map((m) => {
                const st = a.milestones[m.id];
                return (
                  <li key={m.id} id={m.id} className="scroll-mt-20 p-4 target:bg-accent-soft">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{m.name}</span>
                      <MilestoneBadge state={st.state} />
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {m.completedOn ? `Completed ${fmtDate(m.completedOn)}` : `Due ${fmtDate(st.due)} (${relativeDays(ws.org.demoDate, st.due)})`} · owner {v.person(m.ownerId)}
                      {m.billingAmount && ws.caps.viewProjectCosts ? ` · billing ${v.money(m.billingAmount)}` : ""}
                    </div>
                    {m.blockedReason && <p className="mt-1 text-sm text-bad">{m.blockedReason}</p>}
                    {m.awaitingClientSince && !m.completedOn && <p className="mt-0.5 text-xs text-warn">Waiting since {fmtDate(m.awaitingClientSince)} ({relativeDays(ws.org.demoDate, m.awaitingClientSince)})</p>}
                    {m.dueChanges.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                        <li>Originally due {fmtDate(m.originalDue)}</li>
                        {m.dueChanges.map((c) => (
                          <li key={c.changedOn + c.newDue}>
                            {fmtDate(c.changedOn)}: moved to {fmtDate(c.newDue)}. {c.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Tasks" padded={false} subtitle="Synced from project management (simulated)">
          {tasks.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No tasks.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((x) => {
                const overdue = x.status !== "done" && x.due < ws.org.demoDate;
                return (
                  <li key={x.id} id={x.id} className="scroll-mt-20 px-4 py-3 target:bg-accent-soft">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">{x.title}</span>
                      <Badge tone={x.status === "done" ? "good" : x.status === "blocked" ? "bad" : overdue ? "warn" : "neutral"}>{x.status === "in_progress" ? "In progress" : x.status === "todo" ? (overdue ? "Overdue" : "To do") : x.status.charAt(0).toUpperCase() + x.status.slice(1)}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {x.assigneeId ? <Link href={`/team#${x.assigneeId}`}>{v.person(x.assigneeId)}</Link> : <span className="text-warn">Unassigned</span>} · due {fmtDate(x.due)} · {x.estimateHours} h est.
                      {x.dependsOn.length > 0 && <> · depends on {x.dependsOn.map((d) => tasks.find((y) => y.id === d)?.title ?? d).join(", ")}</>}
                    </div>
                    {x.blockerNote && <p className="mt-1 text-xs text-bad">Blocker: {x.blockerNote}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

        <Card title="Dependencies and scope changes">
          {deps.length === 0 && dependents.length === 0 ? (
            <p className="text-sm text-ink-muted">No cross-project dependencies.</p>
          ) : (
            <DefList
              items={[
                ...deps.map((d) => ["Depends on", ws.data.projects.some((x) => x.id === d!.id) ? <Link key={d!.id} href={`/projects/${d!.id}`}>{d!.name}</Link> : d!.name] as [string, React.ReactNode]),
                ...dependents.map((d) => ["Blocks", <Link key={d.id} href={`/projects/${d.id}`}>{d.name}</Link>] as [string, React.ReactNode]),
              ]}
            />
          )}
          {p.scopeChanges.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-sm font-medium">Scope changes</div>
              <ul className="space-y-1 text-xs">
                {p.scopeChanges.map((s) => (
                  <li key={s.id}>
                    {fmtDate(s.date)}: {s.description} ({s.hours} h, {s.billable ? (s.approved ? "billable, approved" : "billable, pending approval") : "non-billable"}
                    {s.amount && ws.caps.viewProjectCosts ? `, ${v.money(s.amount)}` : ""})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        </div>
      )}

      {tab === "financials" && (
        <div className="space-y-6">
      {f && (f.missing.length > 0 || f.notes.length > 0) && (
        <div className="space-y-2">
          {f.missing.length > 0 && (
            <Notice title="Missing or incomplete data affects these figures">
              <ul className="list-disc pl-5">
                {f.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Notice>
          )}
          {f.notes.map((n) => (
            <Notice key={n} tone="info">
              {n}
            </Notice>
          ))}
        </div>
      )}
      {p.scenarioNote && <Notice tone="info" title="An applied scenario is included in this forecast">{p.scenarioNote}</Notice>}

      {!ws.caps.viewProjectCosts ? (
        <Restricted what="Project costs, revenue and margins are not available to your role." />
      ) : f ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:gap-4">
          {internal ? (
            <>
              <Stat label="Approved budget" value={v.money(f.cost.budget, { compact: true })} kind="observed" />
              <Stat label="Cost to date" value={v.money(f.cost.directToDate, { compact: true })} sub={f.budget.costConsumedPct !== null ? `${fmtPct(f.budget.costConsumedPct)} of budget` : undefined} kind="calculated" />
              <Stat label="Forecast cost" value={v.money(f.cost.forecastTotal, { compact: true })} kind="calculated" />
              <Stat label="Forecast vs budget" value={v.money(f.budget.forecastVsBudget, { compact: true, sign: true })} tone={(f.budget.forecastVsBudget ?? 0) > 0 ? "bad" : "good"} kind="calculated" href="#calculation" />
            </>
          ) : (
            <>
              <Stat label="Revenue at completion" value={v.money(f.revenue.atCompletion, { compact: true })} sub="Forecast" kind="calculated" href="#calculation" />
              <Stat label="Earned to date" value={v.money(f.revenue.earnedToDate, { compact: true })} sub={`To date, since ${fmtDate(f.measurementStart)}`} kind="calculated" />
              <Stat label="Invoiced / collected" value={v.money(f.revenue.invoicedToDate, { compact: true })} sub={`${v.money(f.revenue.collectedToDate, { compact: true })} collected`} kind="observed" />
              <Stat label="Margin to date" value={fmtPct(f.margin.actualToDate)} sub={`To date · ${v.money(f.margin.profitToDate, { compact: true })} profit`} kind="calculated" />
              <Stat label="Forecast margin" value={fmtPct(f.margin.forecastAtCompletion)} sub={`Forecast · target ${fmtPct(f.margin.target)} · ${fmtPts(f.margin.variance)}`} tone={f.margin.variance !== null && f.margin.variance < -0.05 ? "bad" : f.margin.variance !== null && f.margin.variance >= 0 ? "good" : "warn"} kind="calculated" href="#calculation" />
            </>
          )}
          <Stat label="Hours: actual vs planned" value={fmtHours(f.hours.actual)} sub={`${fmtHours(plannedHoursBetween(p, f.measurementStart, ws.org.demoDate))} planned to date · ${fmtHours(f.hours.remaining)} remaining · budget ${fmtHours(f.hours.budget)}`} tone={f.hours.atCompletion > f.hours.budget ? "warn" : undefined} kind="observed" />
        </div>
      ) : null}

      {showMoney && (
        <Card id="calculation" title="How this forecast is calculated" subtitle="Every figure is traceable to time entries, rates, contracts and expenses" actions={<CardLink href="/calculations">All formulas</CardLink>}>
          <p className="mb-3 text-sm text-ink-soft">{f.revenue.basis}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <tbody>
                <tr>
                  <td className="td font-medium" colSpan={3}>
                    Cost (direct)
                  </td>
                </tr>
                <CalcRow label="Employee labor to date" formula="Σ hours × hourly cost (salary + employer costs ÷ annual working hours × FTE)" value={v.money(f.cost.labor)} />
                <CalcRow label="Contractor cost to date" formula="Σ hours × contractor hourly cost" value={v.money(f.cost.contractor)} />
                <CalcRow label="Project expenses to date" formula="Σ expenses tagged to this project" value={v.money(f.cost.expenses)} />
                <CalcRow label="Direct cost to date" formula="labor + contractor + expenses" value={v.money(f.cost.directToDate)} strong />
                <CalcRow label="Remaining labor" formula={`${fmtHours(f.hours.remaining)} × ${v.money(f.cost.remainingRate)}/h blended cost of planned team${p.remainingCostRateOverride !== undefined ? " (scenario override)" : ""}`} value={v.money(f.cost.remainingLabor)} />
                <CalcRow label="Remaining expenses" formula="Owner's estimate" value={v.money(f.cost.remainingExpenses)} />
                <CalcRow label="Forecast cost at completion" formula="direct to date + remaining labor + remaining expenses" value={v.money(f.cost.forecastTotal)} strong />
                {!internal && (
                  <>
                    <tr>
                      <td className="td font-medium" colSpan={3}>
                        Revenue and margin
                      </td>
                    </tr>
                    <CalcRow label="Earned revenue to date" formula={p.billing === "fixed_fee" ? "fee × (hours to date ÷ hours at completion)" : p.billing === "retainer" ? "monthly fee × completed months" : "Σ billable hours × bill rate"} value={v.money(f.revenue.earnedToDate)} />
                    <CalcRow label="Revenue at completion" formula={p.billing === "fixed_fee" ? "contract fee + approved billable change orders" : p.billing === "retainer" ? "monthly fee × months in term" : "earned + remaining hours × billable share × blended bill rate"} value={v.money(f.revenue.atCompletion)} />
                    <CalcRow label="Margin to date" formula="(earned to date − direct cost to date) ÷ earned to date" value={fmtPct(f.margin.actualToDate, 1)} />
                    <CalcRow label="Forecast margin at completion" formula="(revenue at completion − forecast cost) ÷ revenue at completion" value={fmtPct(f.margin.forecastAtCompletion, 1)} strong />
                    <CalcRow label="Work in progress (earned − invoiced)" formula="earned to date − invoiced to date" value={v.money(f.revenue.wip)} />
                  </>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Measured from {fmtDate(f.measurementStart, { year: true })}. Estimate last updated {fmtDate(p.estimateUpdatedOn)} ({relativeDays(ws.org.demoDate, p.estimateUpdatedOn)}). <SourceTag system={p.estimateSource.system} detail={p.estimateSource.dataset} />
          </p>

          {f.unbilled.items.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-sm font-medium">Work delivered without matching revenue</div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Item</th>
                    <th className="th">Type</th>
                    <th className="th num">Hours</th>
                    <th className="th num">Value at bill rates</th>
                  </tr>
                </thead>
                <tbody>
                  {f.unbilled.items.map((u) => (
                    <tr key={u.label}>
                      <td className="td">{u.label}</td>
                      <td className="td text-xs">{u.kind === "absorbed_scope" ? "Approved, non-billable" : u.kind === "pending_change" ? "Change not yet approved" : "Retainer overage"}</td>
                      <td className="td num">{fmtHours(u.hours)}</td>
                      <td className="td num">{v.money(u.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {f.retainer && (
            <div className="mt-4">
              <div className="mb-1 text-sm font-medium">Retainer usage ({f.retainer.includedPerMonth} h/month included)</div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Month</th>
                    <th className="th num">Hours</th>
                    <th className="th num">Overage</th>
                  </tr>
                </thead>
                <tbody>
                  {f.retainer.months.map((m) => (
                    <tr key={m.ym}>
                      <td className="td">{fmtMonth(m.ym)}</td>
                      <td className="td num">{fmtHours(m.hours)}</td>
                      <td className={`td num ${m.overageHours > 0 ? "text-bad" : ""}`}>{m.overageHours > 0 ? fmtHours(m.overageHours) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showMoney && base && (
        <details id="scenario" className="card group p-5" open={exploreOpen}>
          <summary className="cursor-pointer select-none text-[15px] font-semibold">
            Explore options <span className="text-sm font-normal text-ink-muted">· test price, scope and staffing changes; nothing changes unless someone with permission applies it</span>
          </summary>
          <div className="mt-4">
          <ScenarioCalculator projectId={p.id} base={base} currency={ws.org.reportingCurrency} canApply={ws.caps.applyScenarios} applied={adj ? { note: adj.note, at: adj.appliedAt, by: v.person(adj.appliedBy) } : null} />
          </div>
        </details>
      )}

        </div>
      )}

      {tab === "evidence" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Signals from conversations" subtitle="Inferred; confidence describes evidence strength">
            {projectSignals.length === 0 ? <p className="text-sm text-ink-muted">No open signals tied to this {t.project.toLowerCase()}.</p> : <ul className="divide-y divide-line">{projectSignals.map((x) => <SignalRow key={x.id} ws={ws} s={x} />)}</ul>}
          </Card>
          <div className="space-y-6">
            <Card title="Changes in the last 7 days">
              {changes.length === 0 ? <p className="text-sm text-ink-muted">No changes.</p> : <ul className="space-y-3">{changes.map((c, n) => <ChangeRow key={n} ws={ws} c={c} />)}</ul>}
            </Card>
            <Card title="Conversations" subtitle="Simulated, from authorized mailboxes and channels only">
              {threads.length === 0 ? (
                <p className="text-sm text-ink-muted">None visible to your role.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {threads.map((th) => (
                    <li key={th.id}>
                      <Link href={`/communications/${th.id}`}>{th.subject}</Link> <span className="text-xs text-ink-muted">· {th.messages.length} messages</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className="max-w-3xl">
        <Card title="Team and planned hours">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Person</th>
                <th className="th num">Planned h/week</th>
                <th className="th num">Hours logged</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...p.assignments.map((x) => x.personId), ...hoursByPerson.keys()])].map((pid) => {
                const asg = p.assignments.filter((x) => x.personId === pid && x.to >= ws.org.demoDate);
                return (
                  <tr key={pid}>
                    <td className="td">
                      <Link href={`/team#${pid}`}>{v.person(pid)}</Link>
                    </td>
                    <td className="td num">{asg.length ? asg.reduce((s, x) => s + x.hoursPerWeek, 0) : "—"}</td>
                    <td className="td num">{fmtHours(hoursByPerson.get(pid)?.hours ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {f && f.schedule.unstaffedHours > 0 && <p className="mt-2 text-xs text-warn">{fmtHours(f.schedule.unstaffedHours)} of remaining effort is not covered by planned assignments before the end date.</p>}
          {f && (
            <p className="mt-2 text-xs text-ink-muted">
              Forecast completion: {f.schedule.forecastCompletion ? fmtDate(f.schedule.forecastCompletion, { year: true }) : "cannot be estimated"}. {f.schedule.forecastBasis}
            </p>
          )}
          <p className="mt-2 text-[11px] text-ink-muted">Individual cost rates are not shown here. They derive from restricted compensation data.</p>
        </Card>

        </div>
      )}
    </div>
  );
}

function CalcRow({ label, formula, value, strong }: { label: string; formula: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <td className={`td ${strong ? "font-medium" : ""}`}>{label}</td>
      <td className="td text-xs text-ink-muted">{formula}</td>
      <td className={`td num ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}
