/**
 * Core domain model for OpsInstinct.
 *
 * The model is deliberately industry-neutral: an agency "client project", a SaaS
 * "product initiative" and an enterprise "business-unit initiative" are all
 * `Project` records with different billing types and terminology. Profile
 * configuration (see ./profiles.ts) decides which modules and metrics apply.
 */

export type ID = string;
/** Calendar date, YYYY-MM-DD. */
export type ISODate = string;
/** Date-time, YYYY-MM-DDTHH:mm:ssZ. */
export type ISODateTime = string;
export type CurrencyCode = "USD" | "EUR" | "GBP";
export type ProfileId = "agency" | "cpg_branding" | "media" | "saas" | "enterprise";
export type RoleId = "executive" | "finance" | "account_owner" | "department_head" | "admin";

/** Where a record came from. Every record carries provenance. */
export interface Provenance {
  system: "seed" | "sheets" | "clickup" | "gmail" | "slack" | "accounting" | "manual";
  dataset?: string;
  rowRef?: string;
  batchId?: string;
  importedAt?: ISODateTime;
}

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface Organization {
  id: ID;
  name: string;
  profileId: ProfileId;
  reportingCurrency: CurrencyCode;
  /** Controlled "today" for the demo. All periods and ages derive from this. */
  demoDate: ISODate;
  /** First date for which history is loaded. Figures before this are unknown, not zero. */
  dataStart: ISODate;
  annualWorkingHours: number;
  hoursPerWeek: number;
  /** Observed bank balance used as the opening point of the cash forecast. */
  openingCash: { date: ISODate; amount: number; currency: CurrencyCode; source: Provenance };
  /** Monthly overhead that is NOT part of delivery cost (rent, software, admin). */
  overheadMonthly: { label: string; amount: number }[];
  defaultTargetMargin: number;
  billableUtilizationTarget?: number;
  serviceCatalog: ServiceOffering[];
  /** People the demo role switcher impersonates. */
  demoPersonas: Record<RoleId, ID>;
  /** Departments with a named head. A head's record scope is the work their department's people are assigned to. */
  departments: { name: string; headId: ID }[];
}

export interface ServiceOffering {
  id: ID;
  name: string;
  keywords: string[];
  typicalValue?: string;
}

export interface BusinessUnit {
  id: ID;
  orgId: ID;
  name: string;
  leadId: ID;
  annualBudget?: number;
}

export interface Person {
  id: ID;
  orgId: ID;
  name: string;
  title: string;
  /** Job role used for rates and capacity planning (e.g. "Developer"). */
  role: string;
  department: string;
  businessUnitId?: ID;
  type: "employee" | "contractor";
  fte: number;
  startDate: ISODate;
  endDate?: ISODate;
  email: string;
}

/** Restricted dataset: only roles with `viewCompensation` may read these. */
export interface CompensationRecord {
  id: ID;
  orgId: ID;
  personId: ID;
  effectiveFrom: ISODate;
  annualSalary?: number;
  annualEmployerCosts?: number;
  /** Contractors: hourly cost charged to us. */
  hourlyCost?: number;
  currency: CurrencyCode;
  source: Provenance;
}

export interface BillRate {
  id: ID;
  orgId: ID;
  personId: ID;
  effectiveFrom: ISODate;
  hourlyRate: number;
  currency: CurrencyCode;
  source: Provenance;
}

export interface TimeOff {
  id: ID;
  personId: ID;
  start: ISODate;
  end: ISODate;
  hours: number;
}

export interface Contact {
  name: string;
  title: string;
  email: string;
  primary?: boolean;
}

export interface Account {
  id: ID;
  orgId: ID;
  name: string;
  aliases: string[];
  kind: "client" | "customer" | "business_unit";
  industry: string;
  ownerId: ID;
  businessUnitId?: ID;
  status: "active" | "onboarding" | "inactive";
  since: ISODate;
  contacts: Contact[];
  services: string[];
  segment?: string;
}

export type ContractType = "fixed_fee" | "retainer" | "time_materials" | "subscription" | "internal_budget";

export interface Contract {
  id: ID;
  orgId: ID;
  accountId?: ID;
  name: string;
  type: ContractType;
  startDate: ISODate;
  endDate: ISODate;
  renewalDate?: ISODate;
  noticeDays?: number;
  autoRenew?: boolean;
  fixedFee?: number;
  monthlyFee?: number;
  includedHoursPerMonth?: number;
  annualValue?: number;
  currency: CurrencyCode;
  source: Provenance;
}

export type BillingType = "fixed_fee" | "retainer" | "time_materials" | "internal";

export interface ScopeChange {
  id: ID;
  date: ISODate;
  description: string;
  hours: number;
  /** Billable change orders add to revenue; non-billable changes are absorbed cost. */
  billable: boolean;
  approved: boolean;
  amount?: number;
}

export interface Assignment {
  personId: ID;
  hoursPerWeek: number;
  from: ISODate;
  to: ISODate;
  billable: boolean;
}

export interface Project {
  id: ID;
  orgId: ID;
  accountId?: ID;
  businessUnitId?: ID;
  department?: string;
  contractId?: ID;
  name: string;
  kind: "client" | "internal";
  billing: BillingType;
  ownerId: ID;
  status: "planning" | "active" | "on_hold" | "completed";
  startDate: ISODate;
  originalEndDate: ISODate;
  currentEndDate: ISODate;
  completedOn?: ISODate;
  budgetHours: number;
  /** Internal initiatives: approved cost budget. */
  budgetCost?: number;
  targetMargin?: number;
  remainingHoursEstimate: number;
  remainingExpenseEstimate: number;
  scopeChanges: ScopeChange[];
  dependsOn: ID[];
  assignments: Assignment[];
  description: string;
  /** Estimates last revised (used for freshness and audit). */
  estimateUpdatedOn: ISODate;
  estimateSource: Provenance;
  /** Set only when a what-if scenario has been explicitly applied. */
  remainingCostRateOverride?: number;
  /** Multiplier on future bill rates / retainer fees from an applied scenario. */
  futureBillRateFactor?: number;
  scenarioNote?: string;
}

export interface Milestone {
  id: ID;
  orgId: ID;
  projectId: ID;
  name: string;
  originalDue: ISODate;
  dueChanges: { changedOn: ISODate; newDue: ISODate; reason: string }[];
  completedOn?: ISODate;
  ownerId: ID;
  blockedReason?: string;
  awaitingClientSince?: ISODate;
  billingAmount?: number;
}

export interface Task {
  id: ID;
  orgId: ID;
  projectId: ID;
  milestoneId?: ID;
  title: string;
  assigneeId?: ID;
  status: "todo" | "in_progress" | "blocked" | "done";
  due: ISODate;
  completedOn?: ISODate;
  estimateHours: number;
  dependsOn: ID[];
  blockerNote?: string;
  /** Client review rounds so far (creative deliverables). */
  revisionRounds?: number;
  source: Provenance;
}

export interface TimeEntry {
  id: ID;
  orgId: ID;
  personId: ID;
  projectId: ID;
  /** Time is recorded weekly and dated to the Monday of the week. */
  date: ISODate;
  hours: number;
  billable: boolean;
  source: Provenance;
}

export interface Expense {
  id: ID;
  orgId: ID;
  projectId?: ID;
  date: ISODate;
  category: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  originalAmount?: number;
  originalCurrency?: CurrencyCode;
  source: Provenance;
}

export interface Invoice {
  id: ID;
  orgId: ID;
  accountId: ID;
  projectId?: ID;
  number: string;
  issueDate: ISODate;
  dueDate: ISODate;
  amount: number;
  currency: CurrencyCode;
  description: string;
  source: Provenance;
}

export interface Payment {
  id: ID;
  orgId: ID;
  invoiceId: ID;
  date: ISODate;
  amount: number;
  currency: CurrencyCode;
  source: Provenance;
}

export interface Subscription {
  id: ID;
  orgId: ID;
  accountId: ID;
  plan: string;
  seats: number;
  mrr: number;
  startDate: ISODate;
  renewalDate: ISODate;
  /** Monthly active seats, oldest first, one value per month from dataStart. */
  activeSeatsByMonth: (number | null)[];
  currency: CurrencyCode;
  source: Provenance;
}

export interface Message {
  id: ID;
  threadId: ID;
  author: string;
  authorSide: "client" | "internal";
  sentAt: ISODateTime;
  body: string;
}

export interface Thread {
  id: ID;
  orgId: ID;
  accountId?: ID;
  projectId?: ID;
  channel: "email" | "slack";
  subject: string;
  /** Mailbox or channel the thread came from (must be explicitly authorized). */
  location: string;
  tags: string[];
  messages: Message[];
  source: Provenance;
}

export type SignalCategory =
  | "dissatisfaction"
  | "unresolved_issue"
  | "missed_commitment"
  | "scope_creep"
  | "approval_delay"
  | "budget_concern"
  | "renewal_risk"
  | "dependency_risk"
  | "expansion_interest"
  | "positive_feedback";

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";
export type ReviewStatus = "unreviewed" | "confirmed" | "dismissed" | "resolved";

export interface Evidence {
  messageId: ID;
  threadId: ID;
  excerpt: string;
  sentAt: ISODateTime;
  author: string;
  authorSide: "client" | "internal";
  matched: string[];
  /**
   * Only on counter-evidence. "contradicts": a later message in the same conversation, or a
   * directly opposite statement (interest in more work against cancellation risk); it lowers
   * confidence. "context": opposite-tone remarks elsewhere, such as praise for one deliverable
   * while a renewal is in doubt; shown for balance, does not lower confidence.
   */
  relation?: "contradicts" | "context";
}

export interface Signal {
  id: ID;
  orgId: ID;
  accountId: ID;
  projectId?: ID;
  category: SignalCategory;
  polarity: "risk" | "opportunity" | "positive";
  severity: Severity;
  confidence: Confidence;
  confidenceReason: string;
  detectedOn: ISODate;
  lastEvidenceOn: ISODate;
  summary: string;
  explanation: string;
  evidence: Evidence[];
  counterEvidence: Evidence[];
  resolutionEvidence: Evidence[];
  /** True when the engine observed the issue being resolved later in the same thread(s). */
  autoResolved: boolean;
  recommendedAction: string;
  ownerId: ID;
  review: SignalReview;
  /** Dismissed signal that has received new evidence since the review. */
  newEvidenceSinceReview: boolean;
}

export interface SignalReview {
  status: ReviewStatus;
  by?: ID;
  at?: ISODateTime;
  note?: string;
}

export interface Opportunity {
  id: ID;
  orgId: ID;
  accountId: ID;
  signalId: ID;
  need: string;
  offering: string;
  offeringId?: ID;
  evidence: Evidence[];
  readiness: "ready" | "developing" | "early";
  readinessReason: string;
  nextStep: string;
  ownerId: ID;
  /** Manually entered by a person. Never counted as committed revenue. */
  estimatedValue: number | null;
  estimatedBy?: ID;
  status: "open" | "qualified" | "dismissed" | "won";
}

export interface EvidenceLink {
  type: "account" | "project" | "milestone" | "task" | "invoice" | "message" | "thread" | "signal" | "calculation" | "person" | "opportunity" | "issue";
  id: ID;
  label?: string;
}

export interface ActionComment {
  id: ID;
  authorId: ID;
  at: ISODateTime;
  body: string;
}

export interface Action {
  id: ID;
  orgId: ID;
  title: string;
  description: string;
  ownerId: ID;
  dueDate: ISODate;
  status: "open" | "in_progress" | "done" | "cancelled";
  severity: Severity;
  impact: string;
  accountId?: ID;
  links: EvidenceLink[];
  comments: ActionComment[];
  createdBy: ID;
  createdAt: ISODateTime;
  origin: "seed" | "user" | "signal" | "alert" | "opportunity";
}

export type ConnectorKind = "project_management" | "communications" | "finance" | "advertising" | "crm" | "people" | "spreadsheet";

export interface ConnectorStatus {
  id: ID;
  orgId: ID;
  provider: string;
  kind: ConnectorKind;
  /** Phase one: every connector is simulated. */
  mode: "simulated";
  state: "healthy" | "degraded" | "failed" | "not_configured" | "stale";
  lastSuccessfulSync?: ISODateTime;
  lastAttempt?: ISODateTime;
  scopes: { scope: string; granted: boolean; note?: string }[];
  included: string[];
  excluded: { name: string; reason: string }[];
  failures: { at: ISODateTime; message: string; recordRef?: string }[];
  recordsSynced?: number;
  authoritativeFor: string[];
}

export interface EntityMapping {
  id: ID;
  orgId: ID;
  connectorId: ID;
  externalName: string;
  externalId: string;
  suggestedAccountId?: ID;
  suggestedProjectId?: ID;
  confidence: Confidence;
  status: "confirmed" | "needs_review" | "rejected";
  reason: string;
}

/**
 * Media profile: one channel line of a client's media plan, with the spend and results the ad
 * platform reported each week. Media budgets are the client's money (billed at cost, outside agency
 * revenue); the agency is paid its management fee and studio work through ordinary contracts.
 */
export interface MediaFlight {
  id: ID;
  orgId: ID;
  accountId: ID;
  /** The engagement that runs this flight (usually the media management retainer). */
  projectId: ID;
  channel: string;
  platform: string;
  objective: string;
  start: ISODate;
  end: ISODate;
  /** Planned client media budget for the whole flight. */
  budget: number;
  currency: CurrencyCode;
  kpi: { metric: "CPA" | "ROAS"; target: number };
  /** Platform-reported delivery, one row per completed week (dated to the Monday). */
  weeks: { week: ISODate; spend: number; conversions: number; revenue: number }[];
  ownerId: ID;
  note?: string;
  source: Provenance;
}

/**
 * CPG branding profile: a packaging launch that has to be on shelf at a retailer by a set date.
 * Final files must reach the printer `printLeadWeeks` before the shelf date; the release
 * milestone is the agency's "final artwork released to print" step.
 */
export interface RetailLaunch {
  id: ID;
  orgId: ID;
  accountId: ID;
  projectId: ID;
  name: string;
  retailers: string[];
  skus: number;
  shelfDate: ISODate;
  printLeadWeeks: number;
  releaseMilestoneId: ID;
  printer: string;
  source: Provenance;
}

export interface Dataset {
  org: Organization;
  businessUnits: BusinessUnit[];
  people: Person[];
  compensation: CompensationRecord[];
  billRates: BillRate[];
  timeOff: TimeOff[];
  accounts: Account[];
  contracts: Contract[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  invoices: Invoice[];
  payments: Payment[];
  subscriptions: Subscription[];
  mediaFlights: MediaFlight[];
  retailLaunches: RetailLaunch[];
  threads: Thread[];
  actions: Action[];
  connectors: ConnectorStatus[];
  mappings: EntityMapping[];
  /** Seeded manual estimates for opportunities, keyed by signal id. */
  opportunitySeeds: Record<ID, { estimatedValue: number | null; estimatedBy?: ID; nextStep?: string }>;
}
