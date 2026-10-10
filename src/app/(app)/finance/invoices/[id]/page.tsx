import Link from "next/link";
import { notFound } from "next/navigation";
import { peopleOptions } from "@/components/blocks";
import { ActionForm } from "@/components/forms";
import { Card, DefList, Notice, PageHeader, Restricted, SourceTag } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { invoiceStatus, paymentBehavior } from "@/lib/calc/company";
import { addDays, fmtDate } from "@/lib/dates";
import { viewHelpers } from "@/lib/view";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace();
  if (!ws.caps.viewCompanyFinance && !ws.caps.viewProjectCosts) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoice" />
        <Restricted what="Invoices are not available to your role." />
      </div>
    );
  }
  const inv = ws.data.invoices.find((i) => i.id === id);
  if (!inv) notFound();
  const v = viewHelpers(ws);
  const s = invoiceStatus(ws.data, inv);
  const payments = ws.data.payments.filter((p) => p.invoiceId === inv.id);
  const pb = paymentBehavior(ws.data, inv.accountId);
  const threads = ws.data.threads.filter((t) => t.accountId === inv.accountId && t.tags.includes("billing"));
  const excluded = ws.finance?.cash?.excluded.find((x) => x.invoiceId === inv.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/finance#receivables" className="text-ink-muted">
            ← Receivables
          </Link>
        }
        title={`Invoice ${inv.number}`}
        subtitle={
          <>
            <Link href={`/accounts/${inv.accountId}`}>{v.account(inv.accountId)}</Link>
            {inv.projectId && (
              <>
                {" "}
                · <Link href={`/projects/${inv.projectId}`}>{v.project(inv.projectId)}</Link>
              </>
            )}
          </>
        }
      />
      {s.daysOverdue > 0 && (
        <Notice tone={s.daysOverdue > 60 ? "bad" : "warn"} title={`${s.daysOverdue} days overdue`}>
          {v.money(s.outstanding)} outstanding since {fmtDate(inv.dueDate, { year: true })}.
          {excluded ? " Excluded from the base-case cash forecast until a payment date is confirmed." : " Included in the cash forecast."}
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Invoice">
          <DefList
            items={[
              ["Number", inv.number],
              ["Description", inv.description],
              ["Issued", fmtDate(inv.issueDate, { year: true })],
              ["Due", fmtDate(inv.dueDate, { year: true })],
              ["Amount", v.money(inv.amount)],
              ["Paid", v.money(s.paid)],
              ["Outstanding", v.money(s.outstanding)],
              ["Status", s.bucket === "paid" ? `Paid in full on ${fmtDate(s.paidOn ?? undefined, { year: true })}` : s.daysOverdue > 0 ? `${s.daysOverdue} days overdue (${s.bucket} days bucket)` : "Not yet due"],
              ["Source", <SourceTag key="src" system={inv.source.system} detail={inv.source.dataset ?? inv.source.rowRef} />],
            ]}
          />
          {inv.currency !== ws.org.reportingCurrency && <p className="mt-2 text-xs text-ink-muted">Converted to {ws.org.reportingCurrency} at fixed demo exchange rates.</p>}
        </Card>
        <Card title="Payments">
          {payments.length === 0 ? (
            <p className="text-sm text-ink-muted">No payments recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{fmtDate(p.date, { year: true })}</span>
                  <span className="tabular-nums">{v.money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-muted">{pb.avgDaysLate !== null ? `${v.account(inv.accountId)} pays on average ${pb.avgDaysLate} days after due (${pb.sample} paid invoices).` : "No payment history for this account."}</p>
          <div className="mt-4 border-t border-line pt-3">
            <ActionForm people={peopleOptions(ws)} canManage={ws.caps.manageActions} minDate={ws.org.demoDate} label="Create collection action" defaults={{ title: `Chase ${inv.number} (${v.account(inv.accountId)})`, ownerId: ws.org.demoPersonas.finance, dueDate: addDays(ws.org.demoDate, 2), severity: s.daysOverdue > 60 ? "high" : "medium", impact: `${v.money(s.outstanding)} cash`, accountId: inv.accountId, links: [{ type: "invoice", id: inv.id }], origin: "alert" }} />
          </div>
        </Card>
      </div>
      {threads.length > 0 && (
        <Card title="Billing conversations">
          <ul className="space-y-1 text-sm">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/communications/${t.id}`}>{t.subject}</Link> <span className="text-xs text-ink-muted">· last {fmtDate(t.messages.at(-1)?.sentAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
