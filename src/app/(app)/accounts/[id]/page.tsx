import Link from "next/link";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/Assistant";
import { UsageChart } from "@/components/Charts";
import { SignalRow, peopleOptions } from "@/components/blocks";
import { ActionForm } from "@/components/forms";
import { Badge, Card, DefList, EmptyState, HealthBadge, KindTag, MilestoneBadge, Notice, PageHeader, SeverityBadge, Stat, Trend, CardLink } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { answerQuestion } from "@/lib/assistant/simulated";
import { invoiceStatus, paymentBehavior } from "@/lib/calc/company";
import { addDays, addMonths, daysBetween, fmtDate, fmtMonthShort, monthsBetween, relativeDays } from "@/lib/dates";
import { fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace();
  const acc = ws.data.accounts.find((a) => a.id === id);
  if (!acc) notFound();
  const v = viewHelpers(ws);
  const t = ws.profile.terms;
  const a = ws.analysis;
  const h = a.health[acc.id];
  const prev = a.healthPrev[acc.id];
  const delta = h.score !== null && prev !== null ? h.score - prev : null;
  const projects = ws.data.projects.filter((p) => p.accountId === acc.id);
  const signals = a.signals.filter((s) => s.accountId === acc.id);
  const openRisks = signals.filter((s) => s.polarity === "risk" && !s.autoResolved && s.review.status !== "dismissed" && s.review.status !== "resolved");
  const closedSignals = signals.filter((s) => s.autoResolved || s.review.status === "dismissed" || s.review.status === "resolved");
  const positives = signals.filter((s) => s.polarity === "positive" && !openRisks.includes(s) && !closedSignals.includes(s));
  const opps = a.opportunities.filter((o) => o.accountId === acc.id);
  const invoices = ws.data.invoices.filter((i) => i.accountId === acc.id).sort((x, y) => (x.issueDate < y.issueDate ? 1 : -1));
  const threads = ws.data.threads.filter((th) => th.accountId === acc.id).sort((x, y) => ((x.messages.at(-1)?.sentAt ?? "") < (y.messages.at(-1)?.sentAt ?? "") ? 1 : -1));
  const actions = ws.data.actions.filter((x) => x.accountId === acc.id);
  const contracts = ws.data.contracts.filter((c) => c.accountId === acc.id);
  const sub = ws.data.subscriptions.find((s) => s.accountId === acc.id);
  const pay = ws.profile.modules.invoices ? paymentBehavior(ws.data, acc.id) : null;
  const summary = answerQuestion(ws, { question: `Summarize ${acc.name}`, scope: { accountId: acc.id } });
  const renewal = a.renewals.find((r) => r.accountId === acc.id);
  const months = monthsBetween(ws.org.dataStart, addMonths(ws.org.demoDate, 0));
  const showAr = ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts);
  const ar = invoices.map((i) => invoiceStatus(ws.data, i));
  const arOutstanding = ar.reduce((s, x) => s + x.outstanding, 0);
  const arOverdue = ar.filter((x) => x.daysOverdue > 0).reduce((s, x) => s + x.outstanding, 0);
  const activeProjects = projects.filter((p) => p.status !== "completed");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/accounts" className="text-ink-muted">
            ← {t.accounts}
          </Link>
        }
        title={acc.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <HealthBadge status={h.status} score={h.score} />
            <span>
              {acc.industry} · {t.owner}: {v.person(acc.ownerId)} · {t.account.toLowerCase()} since {fmtDate(acc.since, { year: true })}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-4">
        <Stat label="Health score" value={h.status === "insufficient" || h.score === null ? "—" : <>{h.score}<span className="text-lg font-medium text-ink-faint">/100</span></>} sub={<Trend delta={delta} suffix=" pts in 30 days" />} kind="calculated" href="#health" tone={h.status === "at_risk" ? "bad" : h.status === "watch" ? "warn" : h.status === "healthy" ? "good" : undefined} />
        <Stat label="Next renewal" value={renewal ? fmtDate(renewal.renewalDate) : "—"} sub={renewal ? `${relativeDays(ws.org.demoDate, renewal.renewalDate)} · ${v.money(renewal.annualValue, { compact: true })} a year` : "No renewal on file"} kind="observed" tone={renewal && daysBetween(ws.org.demoDate, renewal.renewalDate) <= 60 ? "warn" : undefined} />
        {showAr ? (
          <Stat label="Receivables" value={v.money(arOutstanding, { compact: true })} sub={arOverdue > 0 ? `${v.money(arOverdue, { compact: true })} overdue` : "Nothing overdue"} kind="observed" href="#invoices" tone={arOverdue > 0 ? "warn" : undefined} />
        ) : (
          <Stat label={`Active ${t.projects.toLowerCase()}`} value={activeProjects.length} sub={`${projects.length} in total`} kind="observed" />
        )}
        <Stat label="Open risks" value={openRisks.length} sub={openRisks.length ? `Highest: ${openRisks[0].severity}` : "None open"} kind="inferred" href="#signals" tone={openRisks.some((r) => r.severity === "critical" || r.severity === "high") ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card title="Summary" subtitle="Composed by the simulated assistant from this account's records" actions={<KindTag kind="calculated" />}>
            <div className="space-y-1.5 text-sm">
              {summary.answer.map((p, i) => (
                <p key={i} className={i === 0 ? "font-medium" : "text-ink-soft"}>
                  {p}
                </p>
              ))}
            </div>
            {summary.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                {summary.notes.map((n) => (
                  <li key={n}>⚠︎ {n}</li>
                ))}
              </ul>
            )}
            {summary.evidence.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {summary.evidence.slice(0, 8).map((e) => (
                  <li key={`${e.type}:${e.id}`}>
                    <Link href={e.href}>{e.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="health" title="Health breakdown" subtitle={`Weighted score as of ${fmtDate(h.asOf)}. Components without enough data are excluded and lower completeness; they are never counted as healthy.`} actions={<CardLink href="/calculations#health">Method</CardLink>}>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
              <span>
                Score <strong className="text-lg tabular-nums">{h.score ?? "—"}</strong>/100
              </span>
              <span>
                Data completeness <strong className="tabular-nums">{fmtPct(h.completeness)}</strong>
              </span>
              <span>
                Last client contact <strong>{h.lastClientContact ? `${fmtDate(h.lastClientContact)} (${relativeDays(ws.org.demoDate, h.lastClientContact)})` : "none on record"}</strong>
              </span>
            </div>
            {h.dataGaps.length > 0 && (
              <div className="mb-3">
                <Notice title={h.status === "insufficient" ? "Not enough current information to assess health" : "Data gaps"}>
                  <ul className="list-disc pl-5">
                    {h.dataGaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
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
                          <span>
                            {f.link ? <Link href={v.href(f.link)}>{f.label}</Link> : f.label} <KindTag kind={f.kind} />
                          </span>
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
          </Card>

          <Card title={t.projects} padded={false}>
            {projects.length === 0 ? (
              <div className="p-4">
                <EmptyState title={`No ${t.projects.toLowerCase()}`} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="th">{t.project}</th>
                      <th className="th">Type</th>
                      <th className="th">Next milestone</th>
                      {ws.caps.viewProjectCosts && <th className="th num">{ws.profile.modules.projectMargins ? "Forecast margin" : "Forecast vs budget"}</th>}
                      <th className="th">Ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const f = a.projectFin[p.id];
                      const next = ws.data.milestones.filter((m) => m.projectId === p.id && a.milestones[m.id]?.state !== "done").sort((x, y) => (a.milestones[x.id].due < a.milestones[y.id].due ? -1 : 1))[0];
                      return (
                        <tr key={p.id}>
                          <td className="td">
                            <Link href={`/projects/${p.id}`}>{p.name}</Link>
                            <div className="text-xs text-ink-muted">{p.status.replace("_", " ")}</div>
                          </td>
                          <td className="td text-xs">{p.billing.replace("_", " ")}</td>
                          <td className="td text-xs">
                            {next ? (
                              <>
                                <Link href={`/projects/${p.id}#${next.id}`}>{next.name}</Link> <MilestoneBadge state={a.milestones[next.id].state} />
                              </>
                            ) : (
                              <span className="text-ink-muted">—</span>
                            )}
                          </td>
                          {ws.caps.viewProjectCosts && (
                            <td className="td num">
                              {f ? (
                                ws.profile.modules.projectMargins ? (
                                  <span className={f.margin.variance !== null && f.margin.variance < -0.05 ? "text-bad" : ""}>
                                    {fmtPct(f.margin.forecastAtCompletion)} <span className="text-xs text-ink-muted">vs {fmtPct(f.margin.target)}</span>
                                  </span>
                                ) : f.budget.forecastVsBudget !== null ? (
                                  <span className={f.budget.forecastVsBudget > 0 ? "text-bad" : "text-good"}>{v.money(f.budget.forecastVsBudget, { compact: true, sign: true })}</span>
                                ) : (
                                  "—"
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          <td className="td text-xs">{fmtDate(p.currentEndDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card id="signals" title="Risk signals" subtitle="Inferred from communications. Confidence describes evidence strength, not a probability." actions={<Link href={`/signals?account=${acc.id}`} className="text-xs">All signals →</Link>}>
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
                      <Badge>{o.status}</Badge>
                    </div>
                    <blockquote className="mt-1 border-l-2 border-line pl-2 text-ink-soft">“{o.need}”</blockquote>
                    <div className="mt-1 text-xs text-ink-muted">
                      {o.readinessReason} · {o.estimatedValue !== null ? <>Manual estimate {v.money(o.estimatedValue)} <KindTag kind="estimate" /></> : "Value not estimated"}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {sub && (
            <Card title="Subscription and usage" actions={<KindTag kind="observed" />}>
              <DefList
                items={[
                  ["Plan", `${sub.plan}, ${sub.seats} seats`],
                  ["MRR", v.money(sub.mrr)],
                  ["Renewal", `${fmtDate(sub.renewalDate, { year: true })} (${relativeDays(ws.org.demoDate, sub.renewalDate)})`],
                ]}
              />
              <div className="mt-3">
                <UsageChart data={sub.activeSeatsByMonth.map((n, i) => ({ label: fmtMonthShort(months[i] ?? ""), active: n, seats: sub.seats }))} />
                {sub.activeSeatsByMonth.some((x) => x === null) && <p className="text-xs text-warn">Usage data missing for {sub.activeSeatsByMonth.filter((x) => x === null).length} month(s). Gaps are shown as breaks, not zeros.</p>}
              </div>
            </Card>
          )}

          {ws.profile.modules.invoices && (ws.caps.viewCompanyFinance || ws.caps.viewProjectCosts) && (
            <Card id="invoices" title="Invoices and payments" padded={false} subtitle={pay && pay.avgDaysLate !== null ? `Observed payment behavior: on average ${pay.avgDaysLate} days ${pay.avgDaysLate >= 0 ? "after" : "before"} due, across ${pay.sample} paid invoices.` : "No paid invoices to infer payment behavior."}>
              {invoices.length === 0 ? (
                <div className="p-4 text-sm text-ink-muted">No invoices.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr>
                        <th className="th">Invoice</th>
                        <th className="th">Issued</th>
                        <th className="th">Due</th>
                        <th className="th num">Amount</th>
                        <th className="th num">Outstanding</th>
                        <th className="th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((i) => {
                        const s = invoiceStatus(ws.data, i);
                        return (
                          <tr key={i.id}>
                            <td className="td">
                              <Link href={`/finance/invoices/${i.id}`}>{i.number}</Link>
                            </td>
                            <td className="td text-xs">{fmtDate(i.issueDate)}</td>
                            <td className="td text-xs">{fmtDate(i.dueDate)}</td>
                            <td className="td num">{v.money(i.amount)}</td>
                            <td className="td num">{s.outstanding > 0 ? v.money(s.outstanding) : "—"}</td>
                            <td className="td text-xs">{s.bucket === "paid" ? <span className="text-good">Paid {fmtDate(s.paidOn ?? undefined)}</span> : s.daysOverdue > 0 ? <span className={s.daysOverdue > 60 ? "text-bad" : "text-warn"}>{s.daysOverdue} days overdue</span> : "Not yet due"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={`Ask about ${acc.name}`} subtitle="Account assistant: answers only from this account's records">
            <div className="h-[460px]">
              <AssistantChat accountId={acc.id} accountName={acc.name} suggestions={[`What is the current status of ${acc.name}?`, "What are the main risks right now?", "What is blocking delivery, and who owns the next step?", ws.profile.modules.invoices ? "Are there overdue invoices?" : "Is anything over budget?", ws.profile.modules.expansion ? "Is there an expansion opportunity?" : "What changed since last week?"]} />
            </div>
          </Card>

          <Card title="Actions" actions={<Link href={`/actions?account=${acc.id}`} className="text-xs">All →</Link>}>
            {actions.length === 0 ? (
              <p className="mb-3 text-sm text-ink-muted">No actions yet.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {actions.map((x) => (
                  <li key={x.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={x.severity} />
                      <Link href={`/actions#${x.id}`}>{x.title}</Link>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {v.person(x.ownerId)} · due {fmtDate(x.dueDate)} · {x.status.replace("_", " ")}
                      {x.dueDate < ws.org.demoDate && (x.status === "open" || x.status === "in_progress") ? <span className="text-bad"> · overdue</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={ws.org.demoDate} defaults={{ ownerId: acc.ownerId, dueDate: addDays(ws.org.demoDate, 7), accountId: acc.id, links: [{ type: "account", id: acc.id }] }} />
          </Card>

          <Card title="Recent changes" subtitle={`${fmtDate(ws.changes.since)} – ${fmtDate(ws.changes.until)}`}>
            {(() => {
              const items = ws.changes.items.filter((c) => c.accountId === acc.id);
              if (!items.length) return <p className="text-sm text-ink-muted">No changes in the last 7 days.</p>;
              return (
                <ul className="space-y-1.5 text-sm">
                  {items.map((c, i) => (
                    <li key={i}>
                      <span className={c.direction === "worse" ? "text-bad" : c.direction === "better" ? "text-good" : "text-ink-muted"} aria-hidden="true">
                        {c.direction === "worse" ? "▼ " : c.direction === "better" ? "▲ " : "• "}
                      </span>
                      {c.links[0] ? <Link href={v.href(c.links[0])}>{c.title}</Link> : c.title}
                      {c.detail && <div className="text-xs text-ink-muted">{c.detail}</div>}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Card>

          <Card title="Details">
            <DefList
              items={[
                [t.owner, v.person(acc.ownerId)],
                ["Status", acc.status],
                ["Services", acc.services.join(", ") || "—"],
                ...(renewal ? ([["Next renewal", `${fmtDate(renewal.renewalDate, { year: true })}${renewal.noticeDate ? ` (notice by ${fmtDate(renewal.noticeDate)})` : ""}`]] as [string, string][]) : []),
                ...contracts.map((c) => [t.contract, `${c.name} · ${c.type.replace("_", " ")} · ${fmtDate(c.startDate)} – ${fmtDate(c.endDate, { year: true })}`] as [string, string]),
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

          <Card title="Communications" subtitle="Simulated, from authorized mailboxes and channels only">
            {threads.length === 0 ? (
              <p className="text-sm text-ink-muted">{ws.caps.communications === "none" ? "Message content is restricted for your role." : "No threads visible to your role."}</p>
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
    </div>
  );
}
