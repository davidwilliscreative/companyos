import type { ProfileId } from "./types";

/**
 * Business profiles control terminology, which modules appear, and which
 * metrics are meaningful. Calculations never assume agency concepts unless
 * the profile enables them.
 */
export interface ProfileConfig {
  id: ProfileId;
  label: string;
  description: string;
  terms: {
    account: string;
    accounts: string;
    project: string;
    projects: string;
    owner: string;
    contract: string;
    revenue: string;
  };
  modules: {
    /** delivery = client projects with margins; subscription = ARR/MRR; budget = cost centres vs budget */
    financeMode: "delivery" | "subscription" | "budget";
    billableUtilization: boolean;
    invoices: boolean;
    projectMargins: boolean;
    subscriptions: boolean;
    dependencies: boolean;
    expansion: boolean;
  };
  healthComponents: { key: HealthComponentKey; label: string; weight: number }[];
}

export type HealthComponentKey = "delivery" | "financial" | "relationship" | "engagement" | "usage" | "budget";

export const PROFILES: Record<ProfileId, ProfileConfig> = {
  agency: {
    id: "agency",
    label: "Agency",
    description: "Client services firm: retainers, fixed-fee and T&M projects, billable utilization and delivery margins.",
    terms: {
      account: "Client",
      accounts: "Clients",
      project: "Project",
      projects: "Projects",
      owner: "Account owner",
      contract: "Engagement",
      revenue: "Earned revenue",
    },
    modules: {
      financeMode: "delivery",
      billableUtilization: true,
      invoices: true,
      projectMargins: true,
      subscriptions: false,
      dependencies: true,
      expansion: true,
    },
    healthComponents: [
      { key: "relationship", label: "Relationship signals", weight: 0.35 },
      { key: "delivery", label: "Delivery", weight: 0.3 },
      { key: "financial", label: "Financial", weight: 0.25 },
      { key: "engagement", label: "Engagement recency", weight: 0.1 },
    ],
  },
  saas: {
    id: "saas",
    label: "SaaS startup",
    description: "Subscription software company: customers, ARR, renewals, product usage and product initiatives.",
    terms: {
      account: "Customer",
      accounts: "Customers",
      project: "Initiative",
      projects: "Product initiatives",
      owner: "Customer success owner",
      contract: "Subscription",
      revenue: "Recognized subscription revenue",
    },
    modules: {
      financeMode: "subscription",
      billableUtilization: false,
      invoices: true,
      projectMargins: false,
      subscriptions: true,
      dependencies: true,
      expansion: true,
    },
    healthComponents: [
      { key: "usage", label: "Product usage", weight: 0.35 },
      { key: "relationship", label: "Relationship signals", weight: 0.35 },
      { key: "financial", label: "Payments", weight: 0.15 },
      { key: "engagement", label: "Engagement recency", weight: 0.15 },
    ],
  },
  enterprise: {
    id: "enterprise",
    label: "Larger organization",
    description: "Multi-unit organization: business units, internal initiatives, budgets, cross-unit dependencies.",
    terms: {
      account: "Business unit",
      accounts: "Business units",
      project: "Initiative",
      projects: "Initiatives",
      owner: "Unit lead",
      contract: "Budget",
      revenue: "Budget",
    },
    modules: {
      financeMode: "budget",
      billableUtilization: false,
      invoices: false,
      projectMargins: false,
      subscriptions: false,
      dependencies: true,
      expansion: false,
    },
    healthComponents: [
      { key: "delivery", label: "Initiative delivery", weight: 0.45 },
      { key: "budget", label: "Budget", weight: 0.35 },
      { key: "relationship", label: "Stakeholder signals", weight: 0.2 },
    ],
  },
};

export function getProfile(id: ProfileId): ProfileConfig {
  return PROFILES[id];
}
