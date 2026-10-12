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
    /** Media plans: client spend pacing and KPI performance by channel (media agencies). */
    mediaPacing: boolean;
    /** Packaging launches tied to retailer shelf dates and printer deadlines (CPG branding agencies). */
    retailLaunches: boolean;
  };
  /** Starter questions offered in the assistant. */
  suggestions: string[];
  healthComponents: { key: HealthComponentKey; label: string; weight: number }[];
}

export type HealthComponentKey = "delivery" | "financial" | "relationship" | "engagement" | "usage" | "budget" | "media";

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
      mediaPacing: false,
      retailLaunches: false,
    },
    suggestions: [
      "Which accounts need attention this week, and why?",
      "Which projects are forecast to miss their margin targets?",
      "What is blocking this launch, and who owns the next step?",
      "Which overdue invoices most affect our cash outlook?",
      "Can we accept a new project given current staffing?",
      "What changed since last week?",
      "Where do we have credible expansion opportunities?",
    ],
    healthComponents: [
      { key: "relationship", label: "Relationship signals", weight: 0.35 },
      { key: "delivery", label: "Delivery", weight: 0.3 },
      { key: "financial", label: "Financial", weight: 0.25 },
      { key: "engagement", label: "Engagement recency", weight: 0.1 },
    ],
  },
  cpg_branding: {
    id: "cpg_branding",
    label: "CPG branding agency",
    description: "Independent branding and packaging agency for food, beverage and supplement brands: brand launches, rebrands, SKU rollouts and production design, all working back from retailer shelf dates.",
    terms: {
      account: "Brand client",
      accounts: "Brand clients",
      project: "Project",
      projects: "Projects",
      owner: "Account lead",
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
      mediaPacing: false,
      retailLaunches: true,
    },
    suggestions: [
      "Which brand launches are at risk of missing their shelf dates?",
      "Which brand clients need attention this week, and why?",
      "Which projects are forecast to miss their margin targets?",
      "What is blocking the Harvest Table launch, and who owns the next step?",
      "Can we take on another SKU rollout given production capacity?",
      "What changed since last week?",
      "Where do we have credible expansion opportunities?",
    ],
    healthComponents: [
      { key: "relationship", label: "Relationship signals", weight: 0.35 },
      { key: "delivery", label: "Delivery & shelf dates", weight: 0.3 },
      { key: "financial", label: "Financial", weight: 0.25 },
      { key: "engagement", label: "Engagement recency", weight: 0.1 },
    ],
  },
  media: {
    id: "media",
    label: "Media agency",
    description: "Digital-first media, data and content company: paid media planning and buying across search, social, programmatic, CTV and retail media, measurement, and a studio that produces content at scale.",
    terms: {
      account: "Client",
      accounts: "Clients",
      project: "Engagement",
      projects: "Engagements",
      owner: "Client partner",
      contract: "Engagement",
      revenue: "Earned fee revenue",
    },
    modules: {
      financeMode: "delivery",
      billableUtilization: true,
      invoices: true,
      projectMargins: true,
      subscriptions: false,
      dependencies: true,
      expansion: true,
      mediaPacing: true,
      retailLaunches: false,
    },
    suggestions: [
      "Which media plans are off pace or missing their KPI targets?",
      "Which clients need attention this week, and why?",
      "Which engagements are forecast to miss their margin targets?",
      "What is holding up the Kinetic launch flight?",
      "Can we take on a new client given paid media capacity?",
      "What changed since last week?",
      "Where do we have credible expansion opportunities?",
    ],
    healthComponents: [
      { key: "relationship", label: "Relationship signals", weight: 0.3 },
      { key: "media", label: "Media performance", weight: 0.25 },
      { key: "delivery", label: "Delivery", weight: 0.2 },
      { key: "financial", label: "Financial", weight: 0.15 },
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
      mediaPacing: false,
      retailLaunches: false,
    },
    suggestions: [
      "Which customers need attention this week, and why?",
      "Which renewals are at risk?",
      "Why did Quarry Health's health decline?",
      "Where do we have credible expansion opportunities?",
      "What is blocking the SSO launch?",
      "What changed since last week?",
    ],
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
      mediaPacing: false,
      retailLaunches: false,
    },
    suggestions: ["Which business units need attention this week?", "Which initiatives are over budget?", "What is blocking the field service pilot?", "What changed since last week?", "Can we take on a new initiative given current staffing?"],
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

export function isProfileId(x: unknown): x is ProfileId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(PROFILES, x);
}
