import type { Account, CompensationRecord, Dataset, ID, Invoice, Milestone, Payment, Person, Project, Task, Thread, TimeEntry } from "@/domain/types";

/** Lookup tables built once per dataset (cached by object identity). */
export interface DataIndex {
  person: Map<ID, Person>;
  project: Map<ID, Project>;
  account: Map<ID, Account>;
  entriesByProject: Map<ID, TimeEntry[]>;
  entriesByPerson: Map<ID, TimeEntry[]>;
  compByPerson: Map<ID, CompensationRecord[]>;
  paymentsByInvoice: Map<ID, Payment[]>;
  invoicesByProject: Map<ID, Invoice[]>;
  invoicesByAccount: Map<ID, Invoice[]>;
  milestonesByProject: Map<ID, Milestone[]>;
  tasksByProject: Map<ID, Task[]>;
  projectsByAccount: Map<ID, Project[]>;
  threadsByAccount: Map<ID, Thread[]>;
  messageById: Map<ID, { thread: Thread; index: number }>;
}

const cache = new WeakMap<Dataset, DataIndex>();

function group<T>(items: T[], key: (t: T) => ID | undefined): Map<ID, T[]> {
  const m = new Map<ID, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function indexOf(ds: Dataset): DataIndex {
  const hit = cache.get(ds);
  if (hit) return hit;
  const compByPerson = group(ds.compensation, (c) => c.personId);
  for (const arr of compByPerson.values()) arr.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const messageById = new Map<ID, { thread: Thread; index: number }>();
  for (const t of ds.threads) t.messages.forEach((m, i) => messageById.set(m.id, { thread: t, index: i }));
  const idx: DataIndex = {
    person: new Map(ds.people.map((p) => [p.id, p])),
    project: new Map(ds.projects.map((p) => [p.id, p])),
    account: new Map(ds.accounts.map((a) => [a.id, a])),
    entriesByProject: group(ds.timeEntries, (e) => e.projectId),
    entriesByPerson: group(ds.timeEntries, (e) => e.personId),
    compByPerson,
    paymentsByInvoice: group(ds.payments, (p) => p.invoiceId),
    invoicesByProject: group(ds.invoices, (i) => i.projectId),
    invoicesByAccount: group(ds.invoices, (i) => i.accountId),
    milestonesByProject: group(ds.milestones, (m) => m.projectId),
    tasksByProject: group(ds.tasks, (t) => t.projectId),
    projectsByAccount: group(ds.projects, (p) => p.accountId),
    threadsByAccount: group(ds.threads, (t) => t.accountId),
    messageById,
  };
  cache.set(ds, idx);
  return idx;
}
