import type { RoleId } from "@/domain/types";
import type { SheetDatasetKey } from "./connectors/sheets";

/**
 * Demo roles and what they may see or do. Enforcement happens in the data
 * layer (src/data/access.ts), so screens and the assistant receive only what
 * the role is allowed to read.
 */
export interface Capabilities {
  allAccounts: boolean;
  viewCompensation: boolean;
  viewCompanyFinance: boolean;
  viewProjectCosts: boolean;
  communications: "all" | "billing_only" | "own_accounts" | "none";
  manageActions: boolean;
  reviewSignals: boolean;
  applyScenarios: boolean;
  manageIntegrations: boolean;
  importDatasets: "all" | "non_restricted" | "none";
  resetDemo: boolean;
}

export const ROLES: Record<RoleId, { label: string; description: string; caps: Capabilities }> = {
  executive: {
    label: "Executive",
    description: "Company-wide view, including compensation and all authorized communications. Cannot change integrations.",
    caps: { allAccounts: true, viewCompensation: true, viewCompanyFinance: true, viewProjectCosts: true, communications: "all", manageActions: true, reviewSignals: true, applyScenarios: true, manageIntegrations: false, importDatasets: "none", resetDemo: true },
  },
  finance: {
    label: "Finance",
    description: "All financial data and compensation; communications limited to billing threads. Can import financial datasets.",
    caps: { allAccounts: true, viewCompensation: true, viewCompanyFinance: true, viewProjectCosts: true, communications: "billing_only", manageActions: true, reviewSignals: false, applyScenarios: true, manageIntegrations: false, importDatasets: "all", resetDemo: true },
  },
  account_owner: {
    label: "Account owner",
    description: "Only the accounts they own. Sees project cost aggregates and margins, never individual salaries or company cash.",
    caps: { allAccounts: false, viewCompensation: false, viewCompanyFinance: false, viewProjectCosts: true, communications: "own_accounts", manageActions: true, reviewSignals: true, applyScenarios: false, manageIntegrations: false, importDatasets: "none", resetDemo: true },
  },
  admin: {
    label: "Administrator",
    description: "Manages integrations, mappings and non-restricted imports. No compensation, financial results or message content.",
    caps: { allAccounts: true, viewCompensation: false, viewCompanyFinance: false, viewProjectCosts: false, communications: "none", manageActions: false, reviewSignals: false, applyScenarios: false, manageIntegrations: true, importDatasets: "non_restricted", resetDemo: true },
  },
};

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
