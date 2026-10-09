import type { BillRate, CompensationRecord, Contract, CurrencyCode, Dataset, Expense, Invoice, Payment, ProfileId, TimeEntry } from "@/domain/types";
import { convert } from "@/lib/money";
import { buildSeed } from "./seed";
import type { OrgOverlay } from "./state";

/**
 * Builds the full (unscoped) dataset for an organization: deterministic seed +
 * validated imports + explicitly applied scenarios + mapping decisions.
 * This is internal to the server. UI and assistant code must go through
 * `getWorkspace()` in ./access.ts, which applies role permissions.
 */

const seedCache = new Map<ProfileId, Dataset>();
function seed(profile: ProfileId): Dataset {
  let s = seedCache.get(profile);
  if (!s) {
    s = buildSeed(profile);
    seedCache.set(profile, s);
  }
  return structuredClone(s);
}

function upsert<T extends { id: string }>(items: T[], incoming: Record<string, unknown> | undefined): T[] {
  if (!incoming) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const [id, rec] of Object.entries(incoming)) byId.set(id, rec as T);
  return [...byId.values()];
}

/** Seed + overlay, in original record currencies. Used for import previews. */
export function buildRawDataset(profile: ProfileId, overlay: OrgOverlay): Dataset {
  const ds = seed(profile);
  const imp = overlay.imports.records;
  ds.compensation = upsert<CompensationRecord>(ds.compensation, imp.compensation);
  ds.billRates = upsert<BillRate>(ds.billRates, imp.billable_rates);
  ds.contracts = upsert<Contract>(ds.contracts, imp.contracts);
  ds.timeEntries = upsert<TimeEntry>(ds.timeEntries, imp.time_entries);
  ds.invoices = upsert<Invoice>(ds.invoices, imp.invoices);
  ds.payments = upsert<Payment>(ds.payments, imp.payments);
  ds.expenses = upsert<Expense>(ds.expenses, imp.expenses);
  for (const patch of Object.values(imp.project_budgets ?? {}) as { projectId: string; budgetHours: number; budgetCost?: number }[]) {
    const p = ds.projects.find((x) => x.id === patch.projectId);
    if (p) {
      p.budgetHours = patch.budgetHours;
      p.budgetCost = patch.budgetCost;
    }
  }
  // Sheets connector freshness reflects the latest applied import.
  const lastBatch = overlay.imports.batches.at(-1);
  if (lastBatch) {
    const sheets = ds.connectors.find((c) => c.kind === "spreadsheet");
    if (sheets) {
      sheets.lastSuccessfulSync = lastBatch.at;
      sheets.lastAttempt = lastBatch.at;
      sheets.state = "healthy";
    }
  }

  // Explicitly applied what-if scenarios
  for (const [projectId, adj] of Object.entries(overlay.projectAdjustments)) {
    const p = ds.projects.find((x) => x.id === projectId);
    if (!p) continue;
    if (adj.remainingHoursEstimate !== undefined) p.remainingHoursEstimate = adj.remainingHoursEstimate;
    if (adj.remainingCostRate !== undefined) p.remainingCostRateOverride = adj.remainingCostRate;
    if (adj.futureBillRateFactor !== undefined) p.futureBillRateFactor = adj.futureBillRateFactor;
    if (adj.targetMargin !== undefined) p.targetMargin = adj.targetMargin;
    if (adj.contractValue !== undefined) {
      const c = ds.contracts.find((x) => x.id === p.contractId);
      if (c && c.fixedFee !== undefined) c.fixedFee = adj.contractValue;
    }
    p.estimateUpdatedOn = adj.appliedAt.slice(0, 10);
    p.estimateSource = { system: "manual", dataset: "What-if scenario (applied)" };
    p.scenarioNote = adj.note;
  }

  for (const m of ds.mappings) {
    const d = overlay.mappingDecisions[m.id];
    if (d) m.status = d;
  }

  // Actions: seeded actions can be edited; user actions are added.
  ds.actions = upsert(ds.actions, overlay.actions as Record<string, unknown>);
  return ds;
}

/** Convert every monetary record to the single reporting currency (fixed demo FX rates). */
export function normalizeCurrency(ds: Dataset, target: CurrencyCode): Dataset {
  ds.org.reportingCurrency = target;
  const c = (amount: number, from: CurrencyCode) => convert(amount, from, target);
  ds.compensation = ds.compensation.map((r) => ({
    ...r,
    annualSalary: r.annualSalary === undefined ? undefined : c(r.annualSalary, r.currency),
    annualEmployerCosts: r.annualEmployerCosts === undefined ? undefined : c(r.annualEmployerCosts, r.currency),
    hourlyCost: r.hourlyCost === undefined ? undefined : c(r.hourlyCost, r.currency),
    currency: target,
  }));
  ds.billRates = ds.billRates.map((r) => ({ ...r, hourlyRate: c(r.hourlyRate, r.currency), currency: target }));
  ds.expenses = ds.expenses.map((x) => (x.currency === target ? x : { ...x, originalAmount: x.amount, originalCurrency: x.currency, amount: c(x.amount, x.currency), currency: target }));
  ds.invoices = ds.invoices.map((x) => ({ ...x, amount: c(x.amount, x.currency), currency: target }));
  ds.payments = ds.payments.map((x) => ({ ...x, amount: c(x.amount, x.currency), currency: target }));
  ds.contracts = ds.contracts.map((x) => ({
    ...x,
    fixedFee: x.fixedFee === undefined ? undefined : c(x.fixedFee, x.currency),
    monthlyFee: x.monthlyFee === undefined ? undefined : c(x.monthlyFee, x.currency),
    currency: target,
  }));
  ds.subscriptions = ds.subscriptions.map((s) => ({ ...s, mrr: c(s.mrr, s.currency), currency: target }));
  ds.projects = ds.projects.map((p) => ({
    ...p,
    budgetCost: p.budgetCost === undefined ? undefined : c(p.budgetCost, "USD"),
    remainingExpenseEstimate: c(p.remainingExpenseEstimate, "USD"),
    remainingCostRateOverride: p.remainingCostRateOverride,
    scopeChanges: p.scopeChanges.map((s) => ({ ...s, amount: s.amount === undefined ? undefined : c(s.amount, "USD") })),
  }));
  ds.businessUnits = ds.businessUnits.map((b) => ({ ...b, annualBudget: b.annualBudget === undefined ? undefined : c(b.annualBudget, "USD") }));
  ds.org.openingCash = { ...ds.org.openingCash, amount: c(ds.org.openingCash.amount, ds.org.openingCash.currency), currency: target };
  ds.org.overheadMonthly = ds.org.overheadMonthly.map((o) => ({ ...o, amount: c(o.amount, "USD") }));
  for (const k of Object.keys(ds.opportunitySeeds)) {
    const v = ds.opportunitySeeds[k];
    if (v.estimatedValue !== null) ds.opportunitySeeds[k] = { ...v, estimatedValue: c(v.estimatedValue, "USD") };
  }
  return ds;
}

export function buildDataset(profile: ProfileId, overlay: OrgOverlay): Dataset {
  const raw = buildRawDataset(profile, overlay);
  return normalizeCurrency(raw, overlay.settings.reportingCurrency ?? raw.org.reportingCurrency);
}
