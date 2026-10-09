import type { Account, Action, ConnectorStatus, Dataset, Invoice, Milestone, Organization, Person, Project, Subscription, Task } from "@/domain/types";
import { addDays, monthsBetween } from "@/lib/dates";
import { comp, generatePayments, generateTimeEntries, nextInvoiceNumber, resetInvoiceCounter, src, thread } from "./helpers";

/**
 * SaaS profile: "Relay Metrics", a 10-person B2B analytics startup.
 * Smaller dataset focused on subscriptions, renewals, usage-based customer
 * health and product initiatives (no billable utilization, no project margins).
 */
const ORG = "org_relay";

export function buildSaas(): Dataset {
  resetInvoiceCounter(3200);
  const org: Organization = {
    id: ORG,
    name: "Relay Metrics",
    profileId: "saas",
    reportingCurrency: "USD",
    demoDate: "2026-10-05",
    dataStart: "2026-04-01",
    annualWorkingHours: 1800,
    hoursPerWeek: 40,
    openingCash: { date: "2026-10-05", amount: 1_940_000, currency: "USD", source: src("accounting", "bank-balance") },
    overheadMonthly: [
      { label: "Cloud infrastructure", amount: 21_000 },
      { label: "Software & tools", amount: 4_800 },
      { label: "Office, legal & admin", amount: 9_000 },
    ],
    defaultTargetMargin: 0.75,
    serviceCatalog: [
      { id: "add_sso", name: "Enterprise plan (SSO & audit logs)", keywords: ["sso", "single sign-on", "audit", "enterprise plan", "security review"] },
      { id: "add_seats", name: "Additional seats", keywords: ["more seats", "seats", "licenses", "rollout", "other teams"] },
      { id: "add_api", name: "Data API add-on", keywords: ["api", "export", "warehouse", "integration"] },
    ],
    demoPersonas: { executive: "s_maya", finance: "s_luis", account_owner: "s_jess", admin: "s_sam" },
  };

  const person = (id: string, name: string, title: string, role: string, department: string, salary: number, startDate = "2024-02-01"): [Person, number] => [
    { id, orgId: ORG, name, title, role, department, type: "employee", fte: 1, startDate, email: `${name.split(" ")[0].toLowerCase()}@relaymetrics.example` },
    salary,
  ];
  const roster = [
    person("s_maya", "Maya Chen", "Co-founder & CEO", "Executive", "Leadership", 190_000, "2022-05-01"),
    person("s_luis", "Luis Ortega", "Head of Finance", "Finance", "Operations", 150_000),
    person("s_jess", "Jess Park", "Head of Customer Success", "Customer success", "Customer Success", 125_000),
    person("s_kai", "Kai Morgan", "Customer Success Manager", "Customer success", "Customer Success", 95_000),
    person("s_sam", "Sam Rivera", "IT & Security Administrator", "Operations", "Operations", 110_000),
    person("s_ana", "Ana Silva", "Staff Engineer", "Engineer", "Product & Engineering", 185_000),
    person("s_dev", "Devon Price", "Senior Engineer", "Engineer", "Product & Engineering", 165_000),
    person("s_ola", "Ola Bergstrom", "Engineer", "Engineer", "Product & Engineering", 140_000),
    person("s_rin", "Rin Takahashi", "Product Manager", "Product manager", "Product & Engineering", 150_000),
    person("s_eli", "Eli Novak", "Product Designer", "Designer", "Product & Engineering", 135_000),
  ];
  const people = roster.map(([p]) => p);
  const compensation = roster.map(([p, s]) => comp(ORG, p.id, "2026-01-01", s, Math.round(s * 0.18)));

  const contact = (name: string, title: string, domain: string) => ({ name, title, email: `${name.split(" ")[0].toLowerCase()}@${domain}`, primary: true });
  const acct = (id: string, name: string, industry: string, ownerId: string, since: string, c: ReturnType<typeof contact>, segment: string, aliases: string[] = []): Account => ({
    id, orgId: ORG, name, aliases: [name.split(" ")[0].toLowerCase(), ...aliases], kind: "customer", industry, ownerId, status: "active", since, contacts: [c], services: ["Relay Analytics"], segment,
  });
  const accounts: Account[] = [
    acct("c_northbeam", "Northbeam Retail", "Retail", "s_jess", "2025-03-01", contact("Hollis Grant", "VP Data", "northbeam.example"), "Mid-market"),
    acct("c_quarry", "Quarry Health", "Healthcare", "s_jess", "2024-11-15", contact("Dana Moss", "Director of Analytics", "quarryhealth.example"), "Mid-market"),
    acct("c_tidewater", "Tidewater Bank", "Financial services", "s_kai", "2025-06-01", contact("Leah Ford", "Head of BI", "tidewater.example"), "Enterprise"),
    acct("c_pinecrest", "Pinecrest Logistics", "Logistics", "s_kai", "2025-09-01", contact("Omar Reyes", "Ops Analyst", "pinecrest.example"), "SMB"),
    acct("c_arcadia", "Arcadia Media", "Media", "s_kai", "2025-01-20", contact("Gwen Tate", "COO", "arcadiamedia.example"), "SMB"),
    acct("c_solstice", "Solstice Energy", "Energy", "s_jess", "2025-04-10", contact("Ravi Iyer", "Analytics Lead", "solstice.example"), "Mid-market"),
    acct("c_juniper", "Juniper Labs", "Biotech", "s_kai", "2026-06-01", contact("Ivy Park", "Head of Ops", "juniperlabs.example"), "SMB"),
    acct("c_beacon", "Beacon Schools", "Education", "s_jess", "2025-08-15", contact("Tom Hale", "Data Manager", "beaconschools.example"), "Mid-market"),
  ];

  const sub = (accountId: string, plan: string, seats: number, mrr: number, startDate: string, renewalDate: string, activeSeatsByMonth: (number | null)[]): Subscription => ({
    id: `sub_${accountId}`, orgId: ORG, accountId, plan, seats, mrr, startDate, renewalDate, activeSeatsByMonth, currency: "USD", source: src("accounting", "subscriptions"),
  });
  // Active seats, Apr..Sep. Pinecrest's September usage export is missing (null = no data).
  const subscriptions: Subscription[] = [
    sub("c_northbeam", "Growth", 120, 8_400, "2025-03-01", "2027-02-28", [96, 101, 108, 112, 117, 119]),
    sub("c_quarry", "Growth", 80, 5_200, "2024-11-15", "2026-11-14", [74, 70, 63, 55, 47, 41]),
    sub("c_tidewater", "Enterprise", 150, 12_000, "2025-06-01", "2027-05-31", [131, 133, 136, 138, 140, 141]),
    sub("c_pinecrest", "Starter", 40, 3_100, "2025-09-01", "2026-12-31", [33, 31, 30, 29, 28, null]),
    sub("c_arcadia", "Starter", 30, 2_400, "2025-01-20", "2027-01-19", [22, 19, 17, 15, 12, 9]),
    sub("c_solstice", "Growth", 90, 6_800, "2025-04-10", "2027-04-09", [80, 62, 71, 79, 82, 84]),
    sub("c_juniper", "Starter", 25, 1_900, "2026-06-01", "2027-05-31", [0, 0, 9, 15, 19, 23]),
    sub("c_beacon", "Growth", 60, 4_500, "2025-08-15", "2026-08-14", [52, 53, 51, 54, 55, 56]),
  ];
  // Beacon renewed in August for another year
  subscriptions[7].renewalDate = "2027-08-14";

  const P = (p: Partial<Project> & Pick<Project, "id" | "name" | "ownerId" | "startDate" | "originalEndDate" | "assignments" | "budgetHours" | "budgetCost" | "remainingHoursEstimate">): Project => ({
    orgId: ORG, kind: "internal", billing: "internal", status: "active", currentEndDate: p.originalEndDate, remainingExpenseEstimate: 0, scopeChanges: [], dependsOn: [], description: "",
    department: "Product & Engineering", estimateUpdatedOn: "2026-10-01", estimateSource: src("clickup", "estimates"), ...p,
  });
  const as = (personId: string, hoursPerWeek: number, from: string, to: string) => ({ personId, hoursPerWeek, from, to, billable: false });
  const projects: Project[] = [
    P({ id: "si_platform", name: "Data platform migration", ownerId: "s_ana", startDate: "2026-04-06", originalEndDate: "2026-08-28", currentEndDate: "2026-10-23", budgetHours: 1300, budgetCost: 160_000, remainingHoursEstimate: 220, remainingExpenseEstimate: 6_000,
      description: "Move ingestion to the new columnar store. Prerequisite for SSO audit logs and usage-based billing.", assignments: [as("s_ana", 24, "2026-04-06", "2026-10-23"), as("s_dev", 16, "2026-04-06", "2026-10-23"), as("s_ola", 10, "2026-04-06", "2026-07-31")] }),
    P({ id: "si_sso", name: "SSO & audit logs (Enterprise plan)", ownerId: "s_rin", startDate: "2026-07-06", originalEndDate: "2026-10-16", currentEndDate: "2026-11-27", budgetHours: 700, budgetCost: 85_000, remainingHoursEstimate: 380, dependsOn: ["si_platform"],
      description: "Enterprise readiness: SAML SSO, SCIM and audit logs. Requested by Northbeam and Tidewater.", assignments: [as("s_ola", 20, "2026-08-03", "2026-11-27"), as("s_dev", 10, "2026-07-06", "2026-11-27"), as("s_rin", 6, "2026-07-06", "2026-11-27"), as("s_eli", 6, "2026-07-06", "2026-09-30")] }),
    P({ id: "si_billing", name: "Usage-based billing", ownerId: "s_rin", startDate: "2026-09-07", originalEndDate: "2026-12-18", budgetHours: 600, budgetCost: 70_000, remainingHoursEstimate: 540, dependsOn: ["si_platform"],
      description: "Metered pricing for the API add-on.", assignments: [as("s_ana", 8, "2026-09-07", "2026-12-18"), as("s_rin", 8, "2026-09-07", "2026-12-18"), as("s_eli", 6, "2026-10-01", "2026-12-18")] }),
    P({ id: "si_perf", name: "Dashboard performance sprint", ownerId: "s_dev", startDate: "2026-08-17", originalEndDate: "2026-10-09", status: "active", budgetHours: 260, budgetCost: 28_000, remainingHoursEstimate: 40,
      description: "Reduce p95 dashboard load time below 2 seconds after customer complaints.", assignments: [as("s_dev", 12, "2026-08-17", "2026-10-09"), as("s_ola", 8, "2026-08-17", "2026-10-09")] }),
  ];

  const M = (m: Omit<Milestone, "orgId" | "dueChanges"> & { dueChanges?: Milestone["dueChanges"] }): Milestone => ({ orgId: ORG, dueChanges: [], ...m });
  const milestones: Milestone[] = [
    M({ id: "sm_platform_cutover", projectId: "si_platform", name: "Production cutover", originalDue: "2026-08-28", dueChanges: [{ changedOn: "2026-08-20", newDue: "2026-10-23", reason: "Backfill performance issues" }], ownerId: "s_ana", blockedReason: "Backfill throughput below target" }),
    M({ id: "sm_sso_beta", projectId: "si_sso", name: "SSO beta with Northbeam", originalDue: "2026-09-25", dueChanges: [{ changedOn: "2026-08-20", newDue: "2026-11-06", reason: "Depends on platform cutover" }], ownerId: "s_ola" }),
    M({ id: "sm_sso_ga", projectId: "si_sso", name: "Enterprise plan GA", originalDue: "2026-10-16", dueChanges: [{ changedOn: "2026-08-20", newDue: "2026-11-27", reason: "Depends on platform cutover" }], ownerId: "s_rin" }),
    M({ id: "sm_perf_p95", projectId: "si_perf", name: "p95 load under 2s", originalDue: "2026-09-25", completedOn: "2026-09-29", ownerId: "s_dev" }),
    M({ id: "sm_billing_design", projectId: "si_billing", name: "Pricing design approved", originalDue: "2026-10-16", ownerId: "s_rin" }),
  ];
  const tasks: Task[] = [
    { id: "st_backfill", orgId: ORG, projectId: "si_platform", milestoneId: "sm_platform_cutover", title: "Historical backfill (18 months)", assigneeId: "s_ana", status: "in_progress", due: "2026-10-09", estimateHours: 80, dependsOn: [], blockerNote: "Throughput 40% of target", source: src("clickup", "tasks") },
    { id: "st_saml", orgId: ORG, projectId: "si_sso", milestoneId: "sm_sso_beta", title: "SAML integration", assigneeId: "s_ola", status: "in_progress", due: "2026-10-30", estimateHours: 120, dependsOn: [], source: src("clickup", "tasks") },
    { id: "st_audit", orgId: ORG, projectId: "si_sso", milestoneId: "sm_sso_ga", title: "Audit log storage", assigneeId: "s_dev", status: "blocked", due: "2026-10-23", estimateHours: 60, dependsOn: ["st_backfill"], blockerNote: "Needs new columnar store", source: src("clickup", "tasks") },
  ];

  const timeEntries = generateTimeEntries(org, projects, [], ({ projectId, week, planned }) => (projectId === "si_platform" && week >= "2026-07-01" ? planned * 1.15 : planned));

  const invoices: Invoice[] = [];
  for (const s of subscriptions) {
    for (const ym of monthsBetween(org.dataStart, org.demoDate)) {
      const issue = `${ym}-01`;
      if (issue < s.startDate.slice(0, 7) + "-01" || issue > org.demoDate) continue;
      invoices.push({ id: `inv_${s.id}_${ym}`, orgId: ORG, accountId: s.accountId, number: nextInvoiceNumber("RM"), issueDate: issue, dueDate: addDays(issue, 30), amount: s.mrr, currency: "USD", description: `${s.plan} plan, ${s.seats} seats, ${ym}`, source: src("accounting", "invoices") });
    }
  }
  const payments = generatePayments(org, invoices, { c_tidewater: 2, c_arcadia: 12 }, new Set(["inv_sub_c_tidewater_2026-08"]));

  const threads = [
    thread(ORG, "rt_northbeam_sso", { accountId: "c_northbeam", channel: "email", subject: "SSO timeline", location: "jess@relaymetrics.example" }, [
      ["2026-09-08", "Hollis Grant", "client", "Our security review requires SSO before we can roll Relay out to other teams. We're interested in the enterprise plan and about 80 more seats once SSO is available."],
      ["2026-09-08T18:00:00Z", "Jess Park", "internal", "SSO is planned for this quarter. I'll confirm dates with product."],
      ["2026-09-29", "Hollis Grant", "client", "Any update on SSO? We have budget for the rollout in Q4 and would love to talk about the enterprise plan."],
    ]),
    thread(ORG, "rt_quarry_perf", { accountId: "c_quarry", channel: "email", subject: "Dashboards are slow", location: "jess@relaymetrics.example" }, [
      ["2026-07-21", "Dana Moss", "client", "Our dashboards take 15 seconds to load. Frustrated, the team has stopped using them for morning standups."],
      ["2026-08-18", "Dana Moss", "client", "Still seeing slow dashboards. This is the third time we've raised it."],
      ["2026-09-30", "Jess Park", "internal", "Performance fix shipped Sep 29; p95 is now under 2 seconds."],
      ["2026-10-01", "Dana Moss", "client", "Noted. Honestly, we're evaluating options ahead of our renewal in November given the past few months."],
    ]),
    thread(ORG, "rt_quarry_usage", { accountId: "c_quarry", channel: "slack", subject: "#cs-quarry", location: "#cs-health" }, [
      ["2026-09-15", "Jess Park", "internal", "Quarry active seats down from 74 to 41 since April. Renewal is Nov 14. Treat as at risk."],
    ]),
    thread(ORG, "rt_tidewater_ap", { accountId: "c_tidewater", channel: "email", subject: "August invoice", location: "finance@relaymetrics.example", tags: ["billing"] }, [
      ["2026-09-20", "Luis Ortega", "internal", "Our August invoice is now overdue. Could you confirm when it will be paid?"],
      ["2026-09-24", "Leah Ford", "client", "It's stuck in our new procurement system pending approval. Should clear in October."],
    ]),
    thread(ORG, "rt_tidewater_praise", { accountId: "c_tidewater", channel: "email", subject: "Board pack", location: "kai@relaymetrics.example" }, [
      ["2026-09-10", "Leah Ford", "client", "Great work on the new board pack templates. Our CFO loved them. We're also interested in the data API to feed our warehouse."],
    ]),
    thread(ORG, "rt_arcadia_cancel", { accountId: "c_arcadia", channel: "email", subject: "Plan change", location: "kai@relaymetrics.example" }, [
      ["2026-08-25", "Gwen Tate", "client", "We're reconsidering our tooling after a reorg. Budget cuts are hitting every team."],
      ["2026-09-22", "Gwen Tate", "client", "We intend to cancel at the end of the current term and will not renew."],
    ]),
    thread(ORG, "rt_solstice_outage", { accountId: "c_solstice", channel: "email", subject: "Data not refreshing", location: "jess@relaymetrics.example" }, [
      ["2026-05-04", "Ravi Iyer", "client", "Our data hasn't refreshed in two days. This is unacceptable during quarter close."],
      ["2026-05-06", "Ana Silva", "internal", "Root cause found in the connector scheduler. Fixed now and backfilled."],
      ["2026-05-07", "Ravi Iyer", "client", "Confirmed all working. Thanks for the quick turnaround."],
      ["2026-08-30", "Ravi Iyer", "client", "Really pleased with the reliability since the fix."],
    ]),
    thread(ORG, "rt_juniper", { accountId: "c_juniper", channel: "slack", subject: "#shared-juniper", location: "#shared-juniper" }, [
      ["2026-09-18", "Ivy Park", "client", "The team loved the new alerting. Could you help us with rolling Relay out to other teams next quarter?"],
    ]),
    thread(ORG, "rt_beacon", { accountId: "c_beacon", channel: "email", subject: "Renewal signed", location: "jess@relaymetrics.example" }, [
      ["2026-08-12", "Tom Hale", "client", "Renewal signed for another year. Great work this year."],
    ]),
    thread(ORG, "rt_pinecrest", { accountId: "c_pinecrest", channel: "email", subject: "Quarterly check-in", location: "kai@relaymetrics.example" }, [
      ["2026-07-30", "Omar Reyes", "client", "All fine on our side, talk next quarter."],
    ]),
  ];

  const actions: Action[] = [
    { id: "sact_quarry", orgId: ORG, title: "Executive call with Quarry Health before renewal", description: "Walk through performance fix and usage recovery plan.", ownerId: "s_jess", dueDate: "2026-10-09", status: "open", severity: "high", impact: "$62k ARR renewal on Nov 14", accountId: "c_quarry", links: [{ type: "account", id: "c_quarry" }, { type: "thread", id: "rt_quarry_perf" }], comments: [], createdBy: "s_maya", createdAt: "2026-10-01T10:00:00Z", origin: "seed" },
    { id: "sact_sso", orgId: ORG, title: "Confirm SSO beta date for Northbeam", description: "Product to confirm realistic beta date after platform cutover.", ownerId: "s_rin", dueDate: "2026-10-07", status: "open", severity: "medium", impact: "Unlocks ~80 seat expansion", accountId: "c_northbeam", links: [{ type: "project", id: "si_sso" }], comments: [], createdBy: "s_jess", createdAt: "2026-09-30T10:00:00Z", origin: "seed" },
  ];

  const connectors: ConnectorStatus[] = [
    { id: "rcon_jira", orgId: ORG, provider: "ClickUp", kind: "project_management", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T06:00:00Z", lastAttempt: "2026-10-05T06:00:00Z", scopes: [{ scope: "Read tasks & time", granted: true }], included: ["Product space"], excluded: [], failures: [], authoritativeFor: ["Initiatives", "Tasks"] },
    { id: "rcon_gmail", orgId: ORG, provider: "Google Workspace Gmail", kind: "communications", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T05:30:00Z", scopes: [{ scope: "gmail.readonly (CS and finance mailboxes)", granted: true }], included: ["jess@", "kai@", "finance@"], excluded: [{ name: "Founders' mailboxes", reason: "Not authorized" }], failures: [], authoritativeFor: ["Customer email"] },
    { id: "rcon_slack", orgId: ORG, provider: "Slack", kind: "communications", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T05:45:00Z", scopes: [{ scope: "channels:history (added channels)", granted: true }], included: ["#cs-health", "#shared-juniper"], excluded: [{ name: "Direct messages", reason: "Out of scope" }], failures: [], authoritativeFor: ["Slack threads"] },
    { id: "rcon_billing", orgId: ORG, provider: "Billing & accounting (to be selected)", kind: "finance", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T04:00:00Z", scopes: [{ scope: "Read subscriptions, invoices, payments", granted: true }], included: ["Subscriptions", "AR"], excluded: [], failures: [], authoritativeFor: ["Subscriptions", "Invoices", "Payments"] },
    { id: "rcon_usage", orgId: ORG, provider: "Product usage warehouse", kind: "crm", mode: "simulated", state: "degraded", lastSuccessfulSync: "2026-09-02T03:00:00Z", scopes: [{ scope: "Read monthly active seats", granted: true }], included: ["active_seats_monthly"], excluded: [], failures: [{ at: "2026-10-02T03:00:00Z", message: "September export missing rows for Pinecrest Logistics (tenant id mismatch)." }], authoritativeFor: ["Product usage"] },
    { id: "rcon_sheets", orgId: ORG, provider: "Google Sheets", kind: "spreadsheet", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-01T09:00:00Z", scopes: [{ scope: "drive.file read-only", granted: true }], included: ["Headcount & compensation (restricted)", "Initiative budgets"], excluded: [], failures: [], authoritativeFor: ["Compensation", "Initiative budgets"] },
  ];

  return {
    org, businessUnits: [], people, compensation, billRates: [], timeOff: [], accounts, contracts: [], projects, milestones, tasks, timeEntries, expenses: [
      { id: "sx_platform_vendor", orgId: ORG, projectId: "si_platform", date: "2026-06-15", category: "Vendor", description: "Migration tooling licence", amount: 14_000, currency: "USD", source: src("accounting", "expenses") },
      { id: "sx_sso_pen", orgId: ORG, projectId: "si_sso", date: "2026-09-20", category: "Vendor", description: "Penetration test deposit", amount: 6_000, currency: "USD", source: src("accounting", "expenses") },
    ],
    invoices, payments, subscriptions, threads, actions, connectors, mappings: [],
    opportunitySeeds: {},
  };
}
