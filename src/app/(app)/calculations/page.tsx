import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { CONFIDENCE_EXPLAINER } from "@/lib/signals/engine";

interface Def {
  id: string;
  name: string;
  formula: string;
  notes: string[];
}

export default async function CalculationsPage() {
  const ws = await getWorkspace();
  const p = ws.profile;
  const defs: Def[] = [
    { id: "labor-cost", name: "Hourly labor cost (employee)", formula: "(annual salary + annual employer costs) ÷ (annual working hours × FTE)", notes: [`Annual working hours: ${ws.org.annualWorkingHours}.`, "The compensation record effective on the date of the work is used, so raises apply from their effective date only.", "Contractors use their hourly cost.", "If a person has no compensation record, their hours are listed as “without cost rate” and cost is understated. It is never assumed to be zero without a warning."] },
    { id: "earned", name: "Earned revenue", formula: "T&M: Σ billable hours × bill rate effective that week · Fixed fee: fee × percent complete (hours to date ÷ hours at completion) · Retainer: monthly fee × completed months · Subscription: MRR × completed months", notes: ["Earned is not invoiced and not collected. All three are shown separately.", "Internal initiatives have no revenue; they are measured against budget.", "Periods before loaded history are excluded, not counted as zero."] },
    { id: "invoiced", name: "Invoiced and collected", formula: "Invoiced = Σ invoices issued in the period · Collected = Σ payments received in the period", notes: ["Work in progress = earned to date − invoiced to date.", "Outstanding = invoice amount − payments recorded up to the demo date."] },
    { id: "delivery-margin", name: "Delivery margin", formula: "(earned revenue − direct cost) ÷ earned revenue, where direct cost = employee labor + contractor cost + project expenses", notes: ["Returned as “—” when earned revenue is zero, rather than dividing by zero.", "Actual-to-date uses cumulative earned and cumulative cost over the same window.", "Forecast at completion = (revenue at completion − forecast cost at completion) ÷ revenue at completion."] },
    { id: "forecast-cost", name: "Forecast cost at completion", formula: "direct cost to date + remaining hours × blended cost rate of the planned team + remaining expense estimate", notes: ["The blended rate is weighted by planned hours per week. If nobody is planned, the recent actual rate is used.", "An applied what-if scenario can override remaining hours and the remaining cost rate; the project page says when this is the case."] },
    { id: "operating", name: "Operating result (simplified)", formula: "earned revenue − total payroll − contractor and expense cost of client work − contractor and expense cost of internal work − overhead", notes: ["Payroll is counted once. Labor recorded on client work is part of delivery cost; the rest of payroll (internal work, bench, leave, admin) is shown as non-client labor.", "This is a management view, not accounting profit: no depreciation, tax or accruals."] },
    { id: "utilization", name: "Billable utilization", formula: "billable hours ÷ available hours, where available = weekly capacity × weeks employed in period − approved time off", notes: ["Only delivery employees are included in the team figure.", p.modules.billableUtilization ? `Target: ${Math.round((ws.org.billableUtilizationTarget ?? 0) * 100)}%.` : "Not used in this profile; capacity is shown as planned load instead."] },
    { id: "capacity", name: "Planned load and over-allocation", formula: "planned hours (from assignments) ÷ weekly capacity, per week", notes: ["Over-allocated = above 105% in at least two of the next four weeks.", "Free capacity = capacity − planned assignments − time off. It does not include unplanned remaining work."] },
    { id: "aging", name: "Receivables aging", formula: "days overdue = demo date − due date, for invoices with an outstanding balance", notes: ["Buckets: not yet due, 1–30, 31–60, 61–90, 90+ days."] },
    { id: "cash", name: "Cash forecast", formula: "opening balance + expected collections + scheduled future billing − payroll − contractors − overhead − remaining project expenses, by week", notes: ["Collections use each account's observed average lateness on paid invoices by default.", "Invoices more than 60 days overdue are excluded from the base case and listed separately. You can change this on the Finance page.", "Opportunity estimates are never included."] },
    { id: "concentration", name: "Revenue concentration", formula: "account earned revenue ÷ total earned revenue in the period", notes: ["Top-1 above 25% or top-3 above 60% is highlighted."] },
    { id: "health", name: `${p.terms.account} health`, formula: `weighted average of available components: ${p.healthComponents.map((c) => `${c.label} ${Math.round(c.weight * 100)}%`).join(", ")}`, notes: ["Each component starts at 100 and loses points for specific, linked factors (late milestones, overdue invoices, risk signals weighted by severity and confidence, usage decline, budget overruns).", "Components without data are excluded and reduce completeness. Below 70% completeness, or with three or more data gaps, the status is “insufficient data”. Missing data is never treated as healthy.", "An open critical risk caps the status at “watch”.", "Healthy ≥ 75, watch 55–74, at risk < 55.", "Pages show status by dimension (relationship, delivery, financial, data confidence, intervention) rather than this score alone. Hard facts override the score in their dimension: a blocked or late milestone puts delivery at risk, a loss-making forecast or an invoice more than 60 days overdue puts financial at risk, and an unresolved high-severity signal with medium or high confidence puts the relationship at risk. The overall status is the worst known dimension."] },
    { id: "confidence", name: "Signal confidence", formula: "Evidence strength label (low / medium / high)", notes: [CONFIDENCE_EXPLAINER, "Signals use rules over message text with recency weighting (30-day half-life). Resolved threads, contradicting messages and dismissed reviews are kept for history. No churn probabilities are produced.", "Opposite-tone messages are classified. A later message in the same conversation, or a directly opposite statement (interest in more work against cancellation risk), contradicts the signal and lowers confidence if it is newer. Praise or complaints in other conversations (for example “Great work on this” while a renewal is in doubt) are shown as context and do not lower confidence."] },
    { id: "scenario", name: "What-if scenarios", formula: "margin = (revenue − (cost to date + remaining hours × blended rate + remaining expenses)) ÷ revenue", notes: ["Blended rate = current rate × (1 − substitute share) + substitute rate × substitute share.", "Max remaining hours for target solves the margin equation for hours at the chosen price and staffing.", "Scenarios change nothing unless an Executive or Finance user applies them; applied scenarios are audited and can be removed."] },
    { id: "currency", name: "Currency", formula: "amount × demo rate to USD ÷ demo rate of reporting currency", notes: [`Reporting currency is ${ws.org.reportingCurrency}. Rates are fixed demo values (EUR 1.08, GBP 1.27 per USD).`] },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="How numbers are calculated" subtitle="Every figure in CompanyOS is computed from recorded facts with these formulas. Each card in the product is tagged Observed, Calculated, Inferred or Manual estimate." />
      <div className="grid gap-4 lg:grid-cols-2">
        {defs.map((d) => (
          <Card key={d.id} id={d.id} title={d.name}>
            <p className="rounded-lg bg-canvas px-3 py-2 font-mono text-[13px] leading-relaxed">{d.formula}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {d.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
