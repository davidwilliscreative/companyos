import type { RoleId } from "@/domain/types";
import type { SheetDatasetKey } from "./connectors/sheets";

/**
 * Demo roles and what they may see or do. Enforcement happens in the data
 * layer (src/data/access.ts), so screens and the assistant receive only what
 * the role is allowed to read. The full matrix and the reasoning behind it is
 * documented in docs/permissions-and-issues.md; keep the two in step.
 *
 * System administration and business-data access are separate: managing
 * integrations does not grant financial, compensation or communication access.
 */
export interface Capabilities {
  /** Record scope: every account, or only accounts the user owns. */
  allAccounts: boolean;
  /** Company-wide P&L, payroll, overhead, operating result, cash forecast and concentration. */
  viewCompanyFinance: boolean;
  /** Earned revenue, direct-cost aggregates, margins, budgets and bill rates for permitted accounts and projects. */
  viewProjectCosts: boolean;
  /** Individual salaries, employer costs, loaded labor cost and per-person cost rates. */
  viewCompensation: boolean;
  /** Contract and renewal values, invoice and payment amounts, receivables, milestone billing and opportunity estimates. */
  viewCommercialTerms: boolean;
  /** Message content the role may read. */
  communications: "all" | "billing_only" | "own_accounts" | "none";
  /** Confirm, dismiss or resolve inferred signals. */
  reviewSignals: boolean;
  /** Create and update actions (plans). */
  manageActions: boolean;
  /** Apply a what-if scenario to a project forecast (exploring is open to anyone who can see project financials). */
  applyScenarios: boolean;
  /** Connector settings and entity mapping decisions. */
  manageIntegrations: boolean;
  /** Google Sheets imports. Compensation is a restricted dataset. */
  importDatasets: "all" | "non_restricted" | "none";
  /** Detailed connector status, failures, mappings and import history. Everyone sees a plain-language summary of stale sources. */
  viewSystemDetail: boolean;
  resetDemo: boolean;
}

export const ROLES: Record<RoleId, { label: string; description: string; home: string; caps: Capabilities }> = {
  executive: {
    label: "Executive",
    description: "Company-wide view, including compensation and all authorized communications. Cannot change integrations.",
    home: "Major risks, decisions that need you, operating and cash outlook, and the plans already in place.",
    caps: { allAccounts: true, viewCompanyFinance: true, viewProjectCosts: true, viewCompensation: true, viewCommercialTerms: true, communications: "all", reviewSignals: true, manageActions: true, applyScenarios: true, manageIntegrations: false, importDatasets: "none", viewSystemDetail: true, resetDemo: true },
  },
  finance: {
    label: "Finance",
    description: "All financial data and compensation; communications limited to billing threads. Can import financial datasets.",
    home: "Collections, billing, unbilled work, margin exceptions, cash outlook, missing cost records and Finance-owned actions.",
    caps: { allAccounts: true, viewCompanyFinance: true, viewProjectCosts: true, viewCompensation: true, viewCommercialTerms: true, communications: "billing_only", reviewSignals: false, manageActions: true, applyScenarios: true, manageIntegrations: false, importDatasets: "all", viewSystemDetail: true, resetDemo: true },
  },
  account_owner: {
    label: "Account owner",
    description: "Only the accounts they own, including their contract values, invoices and project margins. Never individual salaries, company results or cash.",
    home: "Your accounts only: client commitments, unresolved issues, renewals, opportunities and your actions.",
    caps: { allAccounts: false, viewCompanyFinance: false, viewProjectCosts: true, viewCompensation: false, viewCommercialTerms: true, communications: "own_accounts", reviewSignals: true, manageActions: true, applyScenarios: false, manageIntegrations: false, importDatasets: "none", viewSystemDetail: false, resetDemo: true },
  },
  admin: {
    label: "Administrator",
    description: "Manages integrations, mappings and non-restricted imports. No compensation, financial values or message content.",
    home: "Failed or stale connections, mapping reviews, import errors, and which reports are affected by unreliable sources.",
    caps: { allAccounts: true, viewCompanyFinance: false, viewProjectCosts: false, viewCompensation: false, viewCommercialTerms: false, communications: "none", reviewSignals: false, manageActions: false, applyScenarios: false, manageIntegrations: true, importDatasets: "non_restricted", viewSystemDetail: true, resetDemo: true },
  },
};

/** Labels for the capability matrix shown in Administration and the docs. */
export const CAPABILITY_LABELS: [keyof Capabilities, string][] = [
  ["allAccounts", "All accounts (otherwise only accounts they own)"],
  ["viewCompanyFinance", "Company financial summaries and cash"],
  ["viewProjectCosts", "Account and project financial aggregates"],
  ["viewCompensation", "Individual compensation and loaded labor cost"],
  ["viewCommercialTerms", "Contract values and invoice amounts"],
  ["communications", "Authorized communications"],
  ["reviewSignals", "Review signals"],
  ["manageActions", "Create and manage actions"],
  ["applyScenarios", "Apply what-if scenarios"],
  ["manageIntegrations", "Manage integrations and mappings"],
  ["importDatasets", "Imports"],
  ["viewSystemDetail", "Connector and import detail"],
];

export function capsFor(role: RoleId): Capabilities {
  return ROLES[role].caps;
}

export function canImport(caps: Capabilities, dataset: { key: SheetDatasetKey; restricted: boolean }): boolean {
  if (caps.importDatasets === "all") return true;
  if (caps.importDatasets === "non_restricted") return !dataset.restricted;
  return false;
}

export function isRole(x: unknown): x is RoleId {
  return x === "executive" || x === "finance" || x === "account_owner" || x === "admin";
}

/** Which scope label applies to an aggregate for this role. Used so differently scoped figures are never shown unlabeled. */
export function aggregateScope(caps: Capabilities): "Company-wide" | "Your accounts" {
  return caps.allAccounts ? "Company-wide" : "Your accounts";
}
