import type { Dataset, EvidenceLink, ID, ISODate, Signal } from "@/domain/types";
import type { OrgOverlay } from "@/data/state";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { invoiceStatus } from "./calc/company";
import { milestoneDueOn } from "./calc/finance";
import { accountHealth } from "./calc/health";
import { indexOf } from "./calc/index";
import { CATEGORY_LABEL, detectSignals } from "./signals/engine";
import { mergeReviews } from "./analytics";

export interface ChangeItem {
  date: ISODate;
  kind: "signal" | "health" | "milestone" | "invoice" | "payment" | "project" | "action" | "import";
  direction: "worse" | "better" | "neutral";
  title: string;
  detail: string;
  accountId?: ID;
  projectId?: ID;
  links: EvidenceLink[];
}

/** What changed between (asOf − days) and asOf, derived from dated records. */
export function changesSince(ds: Dataset, overlay: OrgOverlay | null, current: Signal[], days = 7): { since: ISODate; until: ISODate; items: ChangeItem[] } {
  const until = ds.org.demoDate;
  const since = addDays(until, -days);
  const idx = indexOf(ds);
  const items: ChangeItem[] = [];
  const inWindow = (d: string) => d.slice(0, 10) > since && d.slice(0, 10) <= until;

  // Signals newly detected or with new evidence
  const before = mergeReviews(ds, detectSignals(ds, { asOf: since }), null);
  for (const s of current) {
    if (s.autoResolved) continue;
    const prev = before.find((b) => b.id === s.id);
    if (!prev && inWindow(s.lastEvidenceOn)) {
      items.push({ date: s.detectedOn > since ? s.detectedOn : s.lastEvidenceOn, kind: "signal", direction: s.polarity === "risk" ? "worse" : "better", title: `New: ${s.summary}`, detail: `${CATEGORY_LABEL[s.category]}, ${s.severity} severity, ${s.confidence} confidence.`, accountId: s.accountId, links: [{ type: "signal", id: s.id }] });
    } else if (prev && s.lastEvidenceOn > prev.lastEvidenceOn) {
      items.push({ date: s.lastEvidenceOn, kind: "signal", direction: s.polarity === "risk" ? "worse" : "better", title: `More evidence: ${s.summary}`, detail: `${s.evidence.length - prev.evidence.length} new message(s); severity ${prev.severity} → ${s.severity}.`, accountId: s.accountId, links: [{ type: "signal", id: s.id }] });
    }
  }

  // Health movement of 5+ points
  for (const a of ds.accounts) {
    if (a.since > since) continue;
    const now = accountHealth(ds, a, current, until).score;
    const then = accountHealth(ds, a, before, since).score;
    if (now === null || then === null || Math.abs(now - then) < 5) continue;
    items.push({ date: until, kind: "health", direction: now < then ? "worse" : "better", title: `${a.name} health ${then} → ${now}`, detail: now < then ? "Declined over the last week." : "Improved over the last week.", accountId: a.id, links: [{ type: "account", id: a.id }] });
  }

  for (const m of ds.milestones) {
    const p = idx.project.get(m.projectId);
    for (const c of m.dueChanges) {
      if (!inWindow(c.changedOn)) continue;
      const prevDue = milestoneDueOn(m, addDays(c.changedOn, -1));
      items.push({ date: c.changedOn, kind: "milestone", direction: c.newDue > prevDue ? "worse" : "better", title: `${p?.name}: "${m.name}" moved ${fmtDate(prevDue, { year: false })} → ${fmtDate(c.newDue, { year: false })}`, detail: c.reason, accountId: p?.accountId, projectId: p?.id, links: [{ type: "milestone", id: m.id }] });
    }
    if (m.completedOn && inWindow(m.completedOn)) items.push({ date: m.completedOn, kind: "milestone", direction: "better", title: `${p?.name}: "${m.name}" completed`, detail: `Completed ${fmtDate(m.completedOn)}.`, accountId: p?.accountId, projectId: p?.id, links: [{ type: "milestone", id: m.id }] });
  }

  for (const p of ds.projects) if (p.completedOn && inWindow(p.completedOn)) items.push({ date: p.completedOn, kind: "project", direction: "better", title: `${p.name} completed`, detail: "", accountId: p.accountId, projectId: p.id, links: [{ type: "project", id: p.id }] });

  for (const inv of ds.invoices) {
    const now = invoiceStatus(ds, inv, until);
    const then = invoiceStatus(ds, inv, since);
    if (now.outstanding > 0 && inWindow(addDays(inv.dueDate, 1))) items.push({ date: addDays(inv.dueDate, 1), kind: "invoice", direction: "worse", title: `Invoice ${inv.number} became overdue`, detail: `${idx.account.get(inv.accountId)?.name}: ${Math.round(now.outstanding).toLocaleString()} outstanding.`, accountId: inv.accountId, links: [{ type: "invoice", id: inv.id }] });
    for (const threshold of [30, 60, 90]) {
      if (now.outstanding > 0 && now.daysOverdue >= threshold && then.daysOverdue < threshold) items.push({ date: addDays(inv.dueDate, threshold), kind: "invoice", direction: "worse", title: `Invoice ${inv.number} passed ${threshold} days overdue`, detail: `${idx.account.get(inv.accountId)?.name}: ${Math.round(now.outstanding).toLocaleString()} outstanding.`, accountId: inv.accountId, links: [{ type: "invoice", id: inv.id }] });
    }
  }
  for (const pay of ds.payments) {
    if (!inWindow(pay.date)) continue;
    const inv = ds.invoices.find((i) => i.id === pay.invoiceId);
    if (!inv) continue;
    items.push({ date: pay.date, kind: "payment", direction: "better", title: `Payment received for ${inv.number}`, detail: `${idx.account.get(inv.accountId)?.name}: ${Math.round(pay.amount).toLocaleString()}.`, accountId: inv.accountId, links: [{ type: "invoice", id: inv.id }] });
  }

  for (const act of ds.actions) {
    if (inWindow(act.createdAt)) items.push({ date: act.createdAt.slice(0, 10), kind: "action", direction: "neutral", title: `Action created: ${act.title}`, detail: `Owner ${idx.person.get(act.ownerId)?.name}, due ${fmtDate(act.dueDate)}.`, accountId: act.accountId, links: act.links });
  }
  for (const b of overlay?.imports.batches ?? []) {
    if (inWindow(b.at)) items.push({ date: b.at.slice(0, 10), kind: "import", direction: "neutral", title: `Imported ${b.dataset} from ${b.spreadsheet}`, detail: `${b.created} created, ${b.updated} updated, ${b.unchanged} unchanged, ${b.rejected} rejected.`, links: [] });
  }

  items.sort((a, b) => (a.date < b.date ? 1 : -1) || (a.direction === "worse" ? -1 : 1));
  return { since, until, items: items.filter((i) => daysBetween(since, i.date) >= 0) };
}
