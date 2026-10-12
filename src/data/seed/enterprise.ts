import type { Account, Action, BusinessUnit, ConnectorStatus, Dataset, Expense, Milestone, Organization, Person, Project, Task } from "@/domain/types";
import { comp, generateTimeEntries, src, thread } from "./helpers";

/**
 * Larger-organization profile: "Halden Group", a multi-unit industrial company.
 * Business units are the primary entity; initiatives carry budgets, deadlines
 * and cross-unit dependencies. No client revenue, invoices or utilization.
 */
const ORG = "org_halden";

export function buildEnterprise(): Dataset {
  const org: Organization = {
    id: ORG,
    name: "Halden Group",
    profileId: "enterprise",
    reportingCurrency: "USD",
    demoDate: "2026-10-05",
    dataStart: "2026-04-01",
    annualWorkingHours: 1760,
    hoursPerWeek: 40,
    openingCash: { date: "2026-10-05", amount: 0, currency: "USD", source: src("accounting", "bank-balance") },
    overheadMonthly: [],
    defaultTargetMargin: 0,
    serviceCatalog: [],
    demoPersonas: { executive: "h_irene", finance: "h_paolo", account_owner: "h_marta", department_head: "h_lena", admin: "h_noah" },
    departments: [{ name: "Digital & IT", headId: "h_lena" }],
  };

  const businessUnits: BusinessUnit[] = [
    { id: "bu_industrial", orgId: ORG, name: "Industrial Products", leadId: "h_marta", annualBudget: 2_400_000 },
    { id: "bu_services", orgId: ORG, name: "Services & Field Operations", leadId: "h_kofi", annualBudget: 1_900_000 },
    { id: "bu_digital", orgId: ORG, name: "Digital & IT", leadId: "h_lena", annualBudget: 3_100_000 },
    { id: "bu_corporate", orgId: ORG, name: "Corporate Finance", leadId: "h_paolo", annualBudget: 900_000 },
  ];

  // Business units are also the "accounts" the executive opens and asks about.
  const accounts: Account[] = businessUnits.map((b) => ({
    id: b.id, orgId: ORG, name: b.name, aliases: [b.name.split(" ")[0].toLowerCase()], kind: "business_unit", industry: "Internal", ownerId: b.leadId, businessUnitId: b.id,
    status: "active", since: "2018-01-01", contacts: [], services: [],
  }));

  const person = (id: string, name: string, title: string, role: string, bu: string, salary: number): [Person, number] => [
    { id, orgId: ORG, name, title, role, department: businessUnits.find((b) => b.id === bu)!.name, businessUnitId: bu, type: "employee", fte: 1, startDate: "2020-01-06", email: `${name.split(" ")[0].toLowerCase()}@halden.example` },
    salary,
  ];
  const roster = [
    person("h_irene", "Irene Vogel", "Group CEO", "Executive", "bu_corporate", 320_000),
    person("h_paolo", "Paolo Ricci", "Group Finance Director", "Finance", "bu_corporate", 210_000),
    person("h_marta", "Marta Lindqvist", "MD, Industrial Products", "Unit lead", "bu_industrial", 230_000),
    person("h_kofi", "Kofi Asante", "MD, Services & Field Ops", "Unit lead", "bu_services", 220_000),
    person("h_lena", "Lena Hoffmann", "CIO", "Unit lead", "bu_digital", 240_000),
    person("h_noah", "Noah Kim", "Platform Administrator", "Operations", "bu_digital", 125_000),
    person("h_ravi", "Ravi Menon", "ERP Programme Manager", "Program manager", "bu_digital", 165_000),
    person("h_sara", "Sara Olsen", "Data Engineer", "Engineer", "bu_digital", 150_000),
    person("h_tomas", "Tomas Weber", "Mobile Lead", "Engineer", "bu_services", 155_000),
    person("h_amy", "Amy Zhou", "Safety Analytics Lead", "Analyst", "bu_industrial", 140_000),
    person("h_finn", "Finn Murphy", "Process Automation Analyst", "Analyst", "bu_corporate", 120_000),
  ];
  const people = roster.map(([p]) => p);
  const compensation = roster.map(([p, s]) => comp(ORG, p.id, "2026-01-01", s, Math.round(s * 0.24)));

  const P = (p: Partial<Project> & Pick<Project, "id" | "name" | "ownerId" | "businessUnitId" | "startDate" | "originalEndDate" | "assignments" | "budgetHours" | "budgetCost" | "remainingHoursEstimate">): Project => ({
    orgId: ORG, kind: "internal", billing: "internal", status: "active", currentEndDate: p.originalEndDate, remainingExpenseEstimate: 0, scopeChanges: [], dependsOn: [], description: "",
    estimateUpdatedOn: "2026-10-01", estimateSource: src("clickup", "estimates"), accountId: p.businessUnitId, ...p,
  });
  const as = (personId: string, hoursPerWeek: number, from: string, to: string) => ({ personId, hoursPerWeek, from, to, billable: false });
  const projects: Project[] = [
    P({ id: "hi_erp", name: "ERP consolidation (phase 2)", ownerId: "h_ravi", businessUnitId: "bu_digital", startDate: "2026-02-02", originalEndDate: "2026-11-27", currentEndDate: "2027-01-29", budgetHours: 2400, budgetCost: 780_000, remainingHoursEstimate: 900, remainingExpenseEstimate: 210_000,
      description: "Consolidate three regional ERPs into one instance. Provides the order and asset APIs other initiatives depend on.", assignments: [as("h_ravi", 32, "2026-02-02", "2027-01-29"), as("h_sara", 20, "2026-02-02", "2027-01-29"), as("h_noah", 8, "2026-02-02", "2027-01-29")] }),
    P({ id: "hi_field", name: "Field service mobile app", ownerId: "h_tomas", businessUnitId: "bu_services", startDate: "2026-05-04", originalEndDate: "2026-12-11", currentEndDate: "2027-02-26", budgetHours: 1500, budgetCost: 420_000, remainingHoursEstimate: 700, remainingExpenseEstimate: 60_000, dependsOn: ["hi_erp"],
      description: "Technician app for 600 field engineers. Needs ERP asset API.", assignments: [as("h_tomas", 30, "2026-05-04", "2027-02-26"), as("h_sara", 6, "2026-07-01", "2027-02-26")] }),
    P({ id: "hi_safety", name: "Plant safety analytics", ownerId: "h_amy", businessUnitId: "bu_industrial", startDate: "2026-04-06", originalEndDate: "2026-10-30", budgetHours: 900, budgetCost: 190_000, remainingHoursEstimate: 120, remainingExpenseEstimate: 8_000,
      description: "Near-miss reporting and predictive maintenance dashboards for four plants.", assignments: [as("h_amy", 30, "2026-04-06", "2026-10-30"), as("h_sara", 4, "2026-04-06", "2026-10-30")] }),
    P({ id: "hi_portal", name: "Customer service portal", ownerId: "h_kofi", businessUnitId: "bu_services", startDate: "2026-03-02", originalEndDate: "2026-09-25", currentEndDate: "2026-11-13", budgetHours: 1100, budgetCost: 260_000, remainingHoursEstimate: 260, remainingExpenseEstimate: 45_000,
      description: "Self-service portal for service contracts. Vendor change orders have pushed cost over budget.", assignments: [as("h_tomas", 8, "2026-03-02", "2026-11-13"), as("h_noah", 10, "2026-03-02", "2026-11-13")] }),
    P({ id: "hi_procure", name: "Procurement automation", ownerId: "h_finn", businessUnitId: "bu_corporate", startDate: "2026-06-01", originalEndDate: "2026-12-18", budgetHours: 700, budgetCost: 140_000, remainingHoursEstimate: 420,
      description: "Automated purchase-order approvals. Waiting on works council approval for workflow changes.", assignments: [as("h_finn", 24, "2026-06-01", "2026-12-18"), as("h_noah", 4, "2026-06-01", "2026-12-18")] }),
  ];

  const M = (m: Omit<Milestone, "orgId" | "dueChanges"> & { dueChanges?: Milestone["dueChanges"] }): Milestone => ({ orgId: ORG, dueChanges: [], ...m });
  const milestones: Milestone[] = [
    M({ id: "hm_erp_api", projectId: "hi_erp", name: "Asset & order APIs available", originalDue: "2026-08-28", dueChanges: [{ changedOn: "2026-08-14", newDue: "2026-10-30", reason: "Data migration defects in Nordics region" }], ownerId: "h_ravi" }),
    M({ id: "hm_erp_cutover", projectId: "hi_erp", name: "Regional cutover", originalDue: "2026-11-27", dueChanges: [{ changedOn: "2026-09-18", newDue: "2027-01-29", reason: "Follows API slip and year-end freeze" }], ownerId: "h_ravi" }),
    M({ id: "hm_field_pilot", projectId: "hi_field", name: "Pilot with 40 engineers", originalDue: "2026-10-16", dueChanges: [{ changedOn: "2026-09-18", newDue: "2026-12-11", reason: "Blocked by ERP asset API" }], ownerId: "h_tomas", blockedReason: "Depends on ERP asset API" }),
    M({ id: "hm_safety_dash", projectId: "hi_safety", name: "Dashboards live in four plants", originalDue: "2026-10-30", ownerId: "h_amy" }),
    M({ id: "hm_safety_pilot", projectId: "hi_safety", name: "Plant 1 pilot", originalDue: "2026-07-31", completedOn: "2026-07-29", ownerId: "h_amy" }),
    M({ id: "hm_portal_launch", projectId: "hi_portal", name: "Portal launch", originalDue: "2026-09-25", dueChanges: [{ changedOn: "2026-09-01", newDue: "2026-11-13", reason: "Vendor change orders" }], ownerId: "h_kofi" }),
    M({ id: "hm_procure_approval", projectId: "hi_procure", name: "Works council approval", originalDue: "2026-09-11", ownerId: "h_finn", awaitingClientSince: "2026-08-21", blockedReason: "Awaiting works council decision" }),
  ];
  const tasks: Task[] = [
    { id: "ht_erp_defects", orgId: ORG, projectId: "hi_erp", milestoneId: "hm_erp_api", title: "Resolve Nordics migration defects (37 open)", assigneeId: "h_sara", status: "in_progress", due: "2026-10-16", estimateHours: 160, dependsOn: [], source: src("clickup", "tasks") },
    { id: "ht_field_sync", orgId: ORG, projectId: "hi_field", milestoneId: "hm_field_pilot", title: "Offline sync against asset API", assigneeId: "h_tomas", status: "blocked", due: "2026-10-09", estimateHours: 80, dependsOn: ["ht_erp_defects"], blockerNote: "ERP asset API not available", source: src("clickup", "tasks") },
  ];

  const timeEntries = generateTimeEntries(org, projects, []);
  const X = (id: string, projectId: string, date: string, description: string, amount: number): Expense => ({ id, orgId: ORG, projectId, date, category: "Vendor", description, amount, currency: "USD", source: src("accounting", "expenses") });
  const expenses: Expense[] = [
    X("hx_erp_si", "hi_erp", "2026-06-30", "Systems integrator, H1 milestone", 240_000),
    X("hx_erp_lic", "hi_erp", "2026-04-15", "ERP licences (incremental)", 95_000),
    X("hx_field_dev", "hi_field", "2026-08-31", "Mobile development partner", 120_000),
    X("hx_safety_sensors", "hi_safety", "2026-05-20", "Sensor gateways", 42_000),
    X("hx_portal_vendor1", "hi_portal", "2026-05-29", "Portal vendor, phase 1", 110_000),
    X("hx_portal_co", "hi_portal", "2026-08-28", "Portal vendor change orders", 68_000),
    X("hx_procure_lic", "hi_procure", "2026-07-15", "Workflow platform licence", 28_000),
  ];

  const threads = [
    thread(ORG, "ht_field_dep", { accountId: "bu_services", projectId: "hi_field", channel: "slack", subject: "#field-app: ERP dependency", location: "#field-app" }, [
      ["2026-09-17", "Kofi Asante", "client", "We're still waiting on the ERP asset API. The pilot is at risk and our engineers are frustrated with the delay."],
      ["2026-09-18", "Tomas Weber", "internal", "Pilot moved to Dec 11 because of the dependency on the asset API."],
    ]),
    thread(ORG, "ht_erp_status", { accountId: "bu_digital", projectId: "hi_erp", channel: "email", subject: "ERP steering committee", location: "lena@halden.example" }, [
      ["2026-09-18", "Paolo Ricci", "client", "The ERP programme is now forecast over budget. We cannot approve more spend without a revised business case."],
      ["2026-09-18T18:00:00Z", "Lena Hoffmann", "internal", "Revised plan and cost to complete will be at the October steering committee."],
    ]),
    thread(ORG, "ht_portal_budget", { accountId: "bu_services", projectId: "hi_portal", channel: "email", subject: "Portal change orders", location: "kofi@halden.example" }, [
      ["2026-08-28", "Paolo Ricci", "client", "Two more vendor change orders. This puts the portal over budget; please explain the cost overrun."],
    ]),
    thread(ORG, "ht_safety", { accountId: "bu_industrial", projectId: "hi_safety", channel: "slack", subject: "#safety-analytics", location: "#safety-analytics" }, [
      ["2026-08-04", "Marta Lindqvist", "client", "Plant 1 pilot results are fantastic. Near-miss reporting is up 40%. Great work."],
    ]),
    thread(ORG, "ht_procure", { accountId: "bu_corporate", projectId: "hi_procure", channel: "email", subject: "Works council", location: "paolo@halden.example" }, [
      ["2026-09-02", "Finn Murphy", "internal", "Still waiting on approval from the works council for the new approval workflow."],
      ["2026-09-29", "Finn Murphy", "internal", "Works council approval still pending; next session Oct 14."],
    ]),
  ];

  const actions: Action[] = [
    { id: "hact_erp", orgId: ORG, title: "Approve revised ERP business case", description: "Decide on additional funding or descoping at October steering committee.", ownerId: "h_irene", dueDate: "2026-10-14", status: "open", severity: "critical", impact: "Unblocks field app and 2 dependent initiatives", accountId: "bu_digital", links: [{ type: "project", id: "hi_erp" }, { type: "thread", id: "ht_erp_status" }], comments: [], createdBy: "h_paolo", createdAt: "2026-09-19T10:00:00Z", origin: "seed" },
  ];

  const connectors: ConnectorStatus[] = [
    { id: "hcon_pm", orgId: ORG, provider: "ClickUp", kind: "project_management", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T06:00:00Z", scopes: [{ scope: "Read portfolio & tasks", granted: true }], included: ["Transformation portfolio"], excluded: [], failures: [], authoritativeFor: ["Initiatives", "Milestones"] },
    { id: "hcon_fin", orgId: ORG, provider: "Accounting provider (to be selected)", kind: "finance", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-04T22:00:00Z", scopes: [{ scope: "Read cost-centre actuals", granted: true }], included: ["Capex & opex by cost centre"], excluded: [], failures: [], authoritativeFor: ["Vendor costs"] },
    { id: "hcon_slack", orgId: ORG, provider: "Slack", kind: "communications", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T05:00:00Z", scopes: [{ scope: "channels:history (programme channels only)", granted: true }], included: ["#field-app", "#safety-analytics"], excluded: [{ name: "#exec-private", reason: "Not authorized" }, { name: "Works council channels", reason: "Excluded by policy" }], failures: [], authoritativeFor: ["Programme channels"] },
    { id: "hcon_gmail", orgId: ORG, provider: "Google Workspace Gmail", kind: "communications", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-05T05:00:00Z", scopes: [{ scope: "gmail.readonly (programme mailboxes)", granted: true }], included: ["lena@", "kofi@", "paolo@"], excluded: [{ name: "HR & legal mailboxes", reason: "Excluded by policy" }], failures: [], authoritativeFor: ["Programme email"] },
    { id: "hcon_sheets", orgId: ORG, provider: "Google Sheets", kind: "spreadsheet", mode: "simulated", state: "healthy", lastSuccessfulSync: "2026-10-01T09:00:00Z", scopes: [{ scope: "drive.file read-only", granted: true }], included: ["Portfolio budgets FY26", "Loaded cost rates (restricted)"], excluded: [], failures: [], authoritativeFor: ["Budgets", "Cost rates"] },
  ];

  return {
    org, businessUnits, people, compensation, billRates: [], timeOff: [], accounts, contracts: [], projects, milestones, tasks, timeEntries, expenses,
    invoices: [], payments: [], subscriptions: [], mediaFlights: [], retailLaunches: [], threads, actions, connectors, mappings: [], opportunitySeeds: {},
  };
}
