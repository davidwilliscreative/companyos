import type { BillRate, CompensationRecord, Contract, CurrencyCode, Dataset, Expense, ID, Invoice, Payment, Provenance, TimeEntry } from "@/domain/types";
import { mondayOf } from "@/lib/dates";
import { invoiceOutstanding } from "@/lib/calc/finance";
import { convert } from "@/lib/money";

/**
 * Simulated Google Sheets import.
 *
 * Phase one never contacts Google. Each "sheet" below is a synthetic grid of
 * raw cell strings, exactly as a read-only Sheets API `values.get` would return
 * them. The pipeline (map columns → validate → preview → apply) is the same one
 * a real connector would feed.
 */

export type SheetDatasetKey = "compensation" | "billable_rates" | "contracts" | "time_entries" | "project_budgets" | "invoices" | "payments" | "expenses";

export type FieldType = "string" | "number" | "date" | "currency" | "boolean" | "person" | "project" | "account" | "invoice";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  synonyms: string[];
  min?: number;
}

export interface SheetDataset {
  key: SheetDatasetKey;
  label: string;
  spreadsheet: string;
  sheetName: string;
  lastModified: string;
  /** Compensation is separately permissioned. */
  restricted: boolean;
  description: string;
  fields: FieldSpec[];
  stableKey: string[];
  columns: string[];
  rows: string[][];
}

const F = (key: string, label: string, type: FieldType, required: boolean, synonyms: string[] = [], min?: number): FieldSpec => ({ key, label, type, required, synonyms, min });

/* ------------------------------------------------------------------ *
 * Synthetic workbooks (agency profile is the richest example)
 * ------------------------------------------------------------------ */

function agencySheets(ds: Dataset): SheetDataset[] {
  const comp = ds.compensation.filter((c) => c.annualSalary !== undefined);
  const workbook = "Fieldwork Finance Workbook";
  return [
    {
      key: "compensation", label: "Employee compensation & employer costs", spreadsheet: "Compensation 2026 (restricted)", sheetName: "Comp", lastModified: "2026-10-03T16:20:00Z", restricted: true,
      description: "Annual salary and employer costs (taxes, benefits, pension) with effective dates. Includes Omar Haddad, whose record is missing from current data.",
      fields: [F("personId", "Employee ID", "person", true, ["employee id", "emp id", "staff id"]), F("effectiveFrom", "Effective from", "date", true, ["effective date", "start", "valid from"]), F("annualSalary", "Annual salary", "number", true, ["base salary", "salary", "base salary annual"], 0), F("annualEmployerCosts", "Employer costs (annual)", "number", true, ["employer costs", "on costs", "benefits taxes"], 0), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["personId", "effectiveFrom"],
      columns: ["Emp ID", "Name", "Base Salary (annual)", "Employer costs", "Effective date", "CCY"],
      rows: [
        ...comp.map((c) => [c.personId, ds.people.find((p) => p.id === c.personId)?.name ?? "", String(c.annualSalary), String(c.annualEmployerCosts ?? ""), c.effectiveFrom, c.currency]),
        ["p_omar", "Omar Haddad", "118000", "22000", "2026-08-03", "USD"],
        ["p_omar", "Omar Haddad", "118000", "22000", "2026-08-03", "USD"],
        ["p_aisha", "Aisha Rahman", "141000", "26000", "2026-10-01", "USD"],
        ["p_zoe", "Zoe Grant", "99000", "18000", "2026-10-12", "USD"],
        ["p_ben", "Ben Carter", "104000", "", "2026-13-01", "USD"],
      ],
    },
    {
      key: "billable_rates", label: "Billable rates", spreadsheet: workbook, sheetName: "Rates", lastModified: "2026-09-30T11:00:00Z", restricted: false,
      description: "Client-facing hourly rates by person with effective dates. Separate from labor cost.",
      fields: [F("personId", "Person ID", "person", true, ["person", "employee id"]), F("effectiveFrom", "Effective from", "date", true, ["effective"]), F("hourlyRate", "Hourly rate", "number", true, ["rate", "bill rate"], 0), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["personId", "effectiveFrom"],
      columns: ["Person ID", "Rate", "Effective", "Currency"],
      rows: [...ds.billRates.map((r) => [r.personId, String(r.hourlyRate), r.effectiveFrom, r.currency]), ["p_tom", "160", "2026-11-01", "USD"]],
    },
    {
      key: "contracts", label: "Contracts", spreadsheet: workbook, sheetName: "Contracts", lastModified: "2026-09-15T10:00:00Z", restricted: false,
      description: "Contract register: type, term, fees.",
      fields: [F("id", "Contract ID", "string", true, ["contract id"]), F("accountId", "Client ID", "account", true, ["client id", "account id"]), F("type", "Type", "string", true), F("startDate", "Start", "date", true), F("endDate", "End", "date", true), F("fixedFee", "Fixed fee", "number", false, ["fee"]), F("monthlyFee", "Monthly fee", "number", false, ["retainer fee"])],
      stableKey: ["id"],
      columns: ["Contract ID", "Client ID", "Type", "Start", "End", "Fee", "Monthly fee"],
      rows: [
        ...ds.contracts.map((c) => [c.id, c.accountId ?? "", c.type, c.startDate, c.endDate, c.fixedFee ? String(c.fixedFee) : "", c.monthlyFee ? String(c.monthlyFee) : ""]),
        ["ct_northwind_web", "a_northwind", "fixed_fee", "2026-11-16", "", "", ""],
      ],
    },
    {
      key: "time_entries", label: "Time entries (backfill)", spreadsheet: "Resourcing & Rates", sheetName: "Timesheet export", lastModified: "2026-10-04T18:00:00Z", restricted: false,
      description: "Weekly timesheets kept in a spreadsheet while the Lumen project was paused in the PM tool. Fills the gap after Aug 24.",
      fields: [F("personId", "Person ID", "person", true, ["person"]), F("projectId", "Project code", "project", true, ["project", "project id"]), F("date", "Week starting", "date", true, ["week", "week of"]), F("hours", "Hours", "number", true, [], 0), F("billable", "Billable", "boolean", false)],
      stableKey: ["projectId", "personId", "date"],
      columns: ["Person ID", "Project code", "Week of", "Hours", "Billable?"],
      rows: [
        ...["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].flatMap((w) => [["p_leo", "pr_lumen_sprint", w, "6", "Y"], ["p_tom", "pr_lumen_sprint", w, w === "2026-09-07" ? "0" : "5.5", "Y"]]),
        ["p_leo", "pr_lumen_sprint", "2026-09-14", "6", "Y"],
        ["p_tom", "pr_lumen_sprint", "2026-10-05", "abc", "Y"],
        ["p_leo", "pr_lumen_v2", "2026-09-28", "4", "Y"],
      ],
    },
    {
      key: "project_budgets", label: "Project budgets", spreadsheet: workbook, sheetName: "Budgets", lastModified: "2026-10-01T09:00:00Z", restricted: false,
      description: "Budgeted hours and internal cost budgets per project.",
      fields: [F("projectId", "Project code", "project", true, ["project"]), F("budgetHours", "Budget hours", "number", true, ["hours budget"], 0), F("budgetCost", "Cost budget", "number", false, ["budget cost"], 0)],
      stableKey: ["projectId"],
      columns: ["Project code", "Budget hours", "Cost budget"],
      rows: [...ds.projects.map((p) => [p.id, String(p.id === "pr_int_site" ? 260 : p.budgetHours), p.budgetCost ? String(p.budgetCost) : ""])],
    },
    {
      key: "invoices", label: "Invoices", spreadsheet: workbook, sheetName: "AR ledger", lastModified: "2026-10-04T23:00:00Z", restricted: false,
      description: "Invoice ledger kept alongside the accounting system. Used for reconciliation; the accounting provider remains authoritative.",
      fields: [F("number", "Invoice number", "string", true, ["invoice", "invoice no"]), F("accountId", "Client ID", "account", true, ["client"]), F("issueDate", "Issue date", "date", true, ["issued"]), F("dueDate", "Due date", "date", true, ["due"]), F("amount", "Amount", "number", true, [], 0), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["number"],
      columns: ["Invoice", "Client", "Issued", "Due", "Amount", "CCY"],
      rows: ds.invoices.slice(-12).map((i) => [i.number, i.accountId, i.issueDate, i.dueDate, String(i.id === "inv_pr_orchard_platform_m2" ? 44_500 : i.amount), i.currency]),
    },
    {
      key: "payments", label: "Payments received", spreadsheet: workbook, sheetName: "Receipts", lastModified: "2026-10-05T07:30:00Z", restricted: false,
      description: "Receipts logged by finance before the accounting sync. Includes Orchard's payment received Oct 2.",
      fields: [F("ref", "Receipt ref", "string", true, ["receipt", "reference"]), F("invoiceNumber", "Invoice number", "invoice", true, ["invoice"]), F("date", "Received", "date", true, ["date received"]), F("amount", "Amount", "number", true, [], 0.01), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["ref"],
      columns: ["Receipt ref", "Invoice", "Received", "Amount", "CCY"],
      rows: [
        ["RCPT-2210", "FW-1054", "2026-10-02", "45000", "USD"],
        ["RCPT-2211", "FW-1047", "2026-10-02", "-28500", "USD"],
        ["RCPT-2212", "FW-9999", "2026-10-03", "1200", "USD"],
        ["RCPT-2190", ds.invoices.find((i) => i.id === "inv_pr_harbor_web_m1")?.number ?? "FW-1041", "2026-05-27", "49500", "USD"],
      ],
    },
    {
      key: "expenses", label: "Direct project expenses", spreadsheet: workbook, sheetName: "Expenses", lastModified: "2026-10-02T12:00:00Z", restricted: false,
      description: "Supplementary project expenses not yet in the accounting system.",
      fields: [F("ref", "Expense ref", "string", true, ["reference"]), F("projectId", "Project code", "project", true, ["project"]), F("date", "Date", "date", true), F("description", "Description", "string", true), F("amount", "Amount", "number", true, [], 0), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["ref"],
      columns: ["Expense ref", "Project code", "Date", "Description", "Amount", "CCY"],
      rows: [
        ["EXP-301", "pr_harbor_web", "2026-09-24", "Booking engine sandbox licence", "950", "USD"],
        ["EXP-302", "pr_copper_app", "2026-09-28", "Field test travel (Lyon depot)", "1400", "EUR"],
        ["EXP-303", "pr_verdant_launch", "", "Stock imagery", "300", "USD"],
      ],
    },
  ];
}

function compOnlySheets(ds: Dataset): SheetDataset[] {
  return [
    {
      key: "compensation", label: "Compensation & employer costs", spreadsheet: "Headcount & compensation (restricted)", sheetName: "Comp", lastModified: "2026-10-01T09:00:00Z", restricted: true,
      description: "Loaded cost inputs for capacity and initiative cost tracking.",
      fields: [F("personId", "Employee ID", "person", true, ["employee id", "emp id"]), F("effectiveFrom", "Effective from", "date", true, ["effective date"]), F("annualSalary", "Annual salary", "number", true, ["base salary", "salary"], 0), F("annualEmployerCosts", "Employer costs (annual)", "number", true, ["employer costs"], 0), F("currency", "Currency", "currency", false, ["ccy"])],
      stableKey: ["personId", "effectiveFrom"],
      columns: ["Emp ID", "Base Salary (annual)", "Employer costs", "Effective date", "CCY"],
      rows: ds.compensation.map((c) => [c.personId, String(c.annualSalary ?? ""), String(c.annualEmployerCosts ?? ""), c.effectiveFrom, c.currency]),
    },
    {
      key: "project_budgets", label: "Initiative budgets", spreadsheet: "Portfolio budgets", sheetName: "Budgets", lastModified: "2026-10-01T09:00:00Z", restricted: false,
      description: "Approved hours and cost budgets per initiative.",
      fields: [F("projectId", "Initiative code", "project", true, ["project", "initiative"]), F("budgetHours", "Budget hours", "number", true, [], 0), F("budgetCost", "Cost budget", "number", false, [], 0)],
      stableKey: ["projectId"],
      columns: ["Initiative code", "Budget hours", "Cost budget"],
      rows: ds.projects.map((p) => [p.id, String(p.budgetHours), String(p.budgetCost ?? "")]),
    },
  ];
}

/** The simulated spreadsheets are a fixed external source: always built from the seed, never from imported data. */
export function sheetDatasets(base: Dataset): SheetDataset[] {
  return base.org.profileId === "agency" ? agencySheets(base) : compOnlySheets(base);
}

/* ------------------------------------------------------------------ *
 * Mapping, validation and preview
 * ------------------------------------------------------------------ */

export type ColumnMapping = Record<string, string | null>; // fieldKey -> column header

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function suggestMapping(def: SheetDataset): ColumnMapping {
  const out: ColumnMapping = {};
  for (const f of def.fields) {
    const candidates = [f.key, f.label, ...f.synonyms].map(norm);
    const col = def.columns.find((c) => candidates.includes(norm(c))) ?? def.columns.find((c) => candidates.some((x) => norm(c).includes(x) || x.includes(norm(c))));
    out[f.key] = col ?? null;
  }
  return out;
}

export interface PreviewRow {
  rowNumber: number;
  stableId: string | null;
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  action: "create" | "update" | "unchanged" | "reject" | "duplicate";
  recordId?: string;
  record?: unknown;
  changes?: string[];
}

export interface ImportPreview {
  dataset: SheetDatasetKey;
  rows: PreviewRow[];
  summary: { create: number; update: number; unchanged: number; reject: number; duplicate: number };
  mappingErrors: string[];
}

function parseValue(f: FieldSpec, raw: string | undefined, ds: Dataset): { value?: unknown; error?: string; warning?: string } {
  const v = (raw ?? "").trim();
  if (!v) return f.required ? { error: `${f.label} is missing` } : { value: undefined };
  switch (f.type) {
    case "number": {
      const n = Number(v.replace(/[,$€£\s]/g, ""));
      if (!Number.isFinite(n)) return { error: `${f.label} "${v}" is not a number` };
      if (f.min !== undefined && n < f.min) return { error: `${f.label} must be at least ${f.min}` };
      return { value: n };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `${f.label} "${v}" is not a YYYY-MM-DD date` };
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { error: `${f.label} "${v}" is not a valid date` };
      return { value: v };
    }
    case "currency":
      return ["USD", "EUR", "GBP"].includes(v.toUpperCase()) ? { value: v.toUpperCase() } : { error: `Unsupported currency "${v}"` };
    case "boolean":
      return { value: ["y", "yes", "true", "1"].includes(v.toLowerCase()) };
    case "person":
      return ds.people.some((p) => p.id === v) ? { value: v } : { error: `Unknown person "${v}" (no matching person record)` };
    case "project":
      return ds.projects.some((p) => p.id === v) ? { value: v } : { error: `Unknown project code "${v}"` };
    case "account":
      return ds.accounts.some((a) => a.id === v) ? { value: v } : { error: `Unknown client "${v}"` };
    case "invoice":
      return ds.invoices.some((i) => i.number === v) ? { value: v } : { error: `Unknown invoice "${v}"` };
    default:
      return { value: v };
  }
}

function provenance(def: SheetDataset, rowNumber: number, batchId: string, at: string): Provenance {
  return { system: "sheets", dataset: `${def.spreadsheet} › ${def.sheetName}`, rowRef: `${def.sheetName}!A${rowNumber}`, batchId, importedAt: at };
}

/** Convert validated values into a domain record (or patch) with a stable id. */
function toRecord(def: SheetDataset, v: Record<string, unknown>, ds: Dataset, prov: Provenance): { id: string; record: unknown; existing?: unknown; error?: string; warning?: string } {
  const cur = (v.currency as CurrencyCode | undefined) ?? ds.org.reportingCurrency;
  switch (def.key) {
    case "compensation": {
      const id = `comp_${v.personId}_${v.effectiveFrom}`;
      const rec: CompensationRecord = { id, orgId: ds.org.id, personId: v.personId as ID, effectiveFrom: v.effectiveFrom as string, annualSalary: v.annualSalary as number, annualEmployerCosts: v.annualEmployerCosts as number, currency: cur, source: prov };
      return { id, record: rec, existing: ds.compensation.find((c) => c.id === id) };
    }
    case "billable_rates": {
      const id = `rate_${v.personId}_${v.effectiveFrom}`;
      const rec: BillRate = { id, orgId: ds.org.id, personId: v.personId as ID, effectiveFrom: v.effectiveFrom as string, hourlyRate: v.hourlyRate as number, currency: cur, source: prov };
      return { id, record: rec, existing: ds.billRates.find((r) => r.id === id) };
    }
    case "contracts": {
      const id = v.id as string;
      const existing = ds.contracts.find((c) => c.id === id);
      const rec: Contract = { ...(existing ?? {}), id, orgId: ds.org.id, accountId: v.accountId as ID, name: existing?.name ?? id, type: v.type as Contract["type"], startDate: v.startDate as string, endDate: v.endDate as string, fixedFee: v.fixedFee as number | undefined, monthlyFee: v.monthlyFee as number | undefined, currency: cur, source: prov };
      return { id, record: rec, existing };
    }
    case "time_entries": {
      const week = mondayOf(v.date as string);
      const warning = week !== v.date ? `Date moved to Monday ${week} (time is recorded weekly)` : undefined;
      const id = `te_${v.projectId}_${v.personId}_${week}`;
      const project = ds.projects.find((p) => p.id === v.projectId);
      if (week > ds.org.demoDate) return { id, record: null, error: "Week is after the demo date" };
      const rec: TimeEntry = { id, orgId: ds.org.id, personId: v.personId as ID, projectId: v.projectId as ID, date: week, hours: v.hours as number, billable: (v.billable as boolean | undefined) ?? project?.billing !== "internal", source: prov };
      return { id, record: rec, existing: ds.timeEntries.find((e) => e.id === id), warning };
    }
    case "project_budgets": {
      const id = `budget_${v.projectId}`;
      const p = ds.projects.find((x) => x.id === v.projectId)!;
      const rec = { projectId: p.id, budgetHours: v.budgetHours as number, budgetCost: (v.budgetCost as number | undefined) ?? p.budgetCost };
      return { id, record: rec, existing: { projectId: p.id, budgetHours: p.budgetHours, budgetCost: p.budgetCost } };
    }
    case "invoices": {
      const existing = ds.invoices.find((i) => i.number === v.number);
      const id = existing?.id ?? `inv_sheet_${v.number}`;
      const rec: Invoice = { ...(existing ?? { description: `Imported invoice ${v.number}` }), id, orgId: ds.org.id, accountId: v.accountId as ID, number: v.number as string, issueDate: v.issueDate as string, dueDate: v.dueDate as string, amount: v.amount as number, currency: cur, source: prov } as Invoice;
      let warning: string | undefined;
      if (existing && existing.amount !== v.amount) warning = `Amount differs from accounting system (${existing.amount} vs ${v.amount}). Accounting is authoritative for invoices; review before applying.`;
      return { id, record: rec, existing, warning };
    }
    case "payments": {
      const inv = ds.invoices.find((i) => i.number === v.invoiceNumber)!;
      const id = `pay_sheet_${v.ref}`;
      const existing = ds.payments.find((p) => p.id === id);
      if (!existing) {
        const { outstanding } = invoiceOutstanding(ds, inv, ds.org.demoDate);
        if (outstanding <= 0) return { id, record: null, error: `Invoice ${inv.number} is already fully paid in the accounting system (likely duplicate receipt)` };
        if ((v.amount as number) > outstanding + 0.01) return { id, record: null, error: `Amount exceeds outstanding balance (${outstanding})` };
      }
      const rec: Payment = { id, orgId: ds.org.id, invoiceId: inv.id, date: v.date as string, amount: v.amount as number, currency: cur, source: prov };
      if (cur !== inv.currency) return { id, record: rec, existing, warning: `Paid in ${cur}; converted at fixed demo rate (${Math.round(convert(v.amount as number, cur, inv.currency))} ${inv.currency})` };
      return { id, record: rec, existing };
    }
    case "expenses": {
      const id = `ex_sheet_${v.ref}`;
      const rec: Expense = { id, orgId: ds.org.id, projectId: v.projectId as ID, date: v.date as string, category: "Imported", description: v.description as string, amount: v.amount as number, currency: cur, source: prov };
      return { id, record: rec, existing: ds.expenses.find((e) => e.id === id), warning: cur !== ds.org.reportingCurrency ? `Converted from ${cur} at fixed demo rate` : undefined };
    }
  }
}

function comparable(x: unknown): string {
  if (!x || typeof x !== "object") return JSON.stringify(x);
  const { source: _s, ...rest } = x as Record<string, unknown>;
  void _s;
  return JSON.stringify(Object.keys(rest).sort().reduce((o, k) => ({ ...o, [k]: rest[k] === undefined ? null : rest[k] }), {}));
}

function diff(a: unknown, b: unknown): string[] {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return [];
  const out: string[] = [];
  const A = a as Record<string, unknown>;
  const B = b as Record<string, unknown>;
  for (const k of Object.keys(B)) {
    if (k === "source") continue;
    if (JSON.stringify(A[k] ?? null) !== JSON.stringify(B[k] ?? null)) out.push(`${k}: ${JSON.stringify(A[k] ?? null)} → ${JSON.stringify(B[k] ?? null)}`);
  }
  return out;
}

/**
 * Validate a sheet against a column mapping and the current dataset.
 * `ds` must already include previously imported records so that repeated
 * imports report "unchanged" instead of creating duplicates.
 */
export function previewImport(def: SheetDataset, mapping: ColumnMapping, ds: Dataset, batch: { id: string; at: string }): ImportPreview {
  const mappingErrors: string[] = [];
  for (const f of def.fields) {
    const col = mapping[f.key];
    if (f.required && !col) mappingErrors.push(`Required field "${f.label}" is not mapped to a column`);
    if (col && !def.columns.includes(col)) mappingErrors.push(`Column "${col}" does not exist in the sheet`);
  }
  const rows: PreviewRow[] = [];
  const seen = new Set<string>();
  def.rows.forEach((cells, i) => {
    const rowNumber = i + 2; // header is row 1
    const values: Record<string, unknown> = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const f of def.fields) {
      const col = mapping[f.key];
      const raw = col ? cells[def.columns.indexOf(col)] : undefined;
      const r = parseValue(f, raw, ds);
      if (r.error) errors.push(r.error);
      if (r.warning) warnings.push(r.warning);
      values[f.key] = r.value;
    }
    if (!values.currency && def.fields.some((f) => f.key === "currency")) warnings.push(`Currency missing; assumed ${ds.org.reportingCurrency}`);
    if (mappingErrors.length || errors.length) {
      rows.push({ rowNumber, stableId: null, values, errors: [...errors], warnings, action: "reject" });
      return;
    }
    const stableId = def.stableKey.map((k) => String(values[k])).join("|");
    if (seen.has(stableId)) {
      rows.push({ rowNumber, stableId, values, errors: [], warnings: [`Duplicate of an earlier row with the same ${def.stableKey.join(" + ")}; skipped`], action: "duplicate" });
      return;
    }
    seen.add(stableId);
    const conv = toRecord(def, values, ds, provenance(def, rowNumber, batch.id, batch.at));
    if (conv.warning) warnings.push(conv.warning);
    if (conv.error || !conv.record) {
      rows.push({ rowNumber, stableId, values, errors: [conv.error ?? "Could not build record"], warnings, action: "reject" });
      return;
    }
    const action = !conv.existing ? "create" : comparable(conv.existing) === comparable(conv.record) ? "unchanged" : "update";
    rows.push({ rowNumber, stableId, values, errors: [], warnings, action, recordId: conv.id, record: conv.record, changes: action === "update" ? diff(conv.existing, conv.record) : undefined });
  });
  const summary = { create: 0, update: 0, unchanged: 0, reject: 0, duplicate: 0 };
  for (const r of rows) summary[r.action] += 1;
  return { dataset: def.key, rows, summary, mappingErrors };
}
