import type { Action, CurrencyCode, ID, ISODate, ISODateTime, Opportunity, ReviewStatus } from "@/domain/types";

/**
 * Persistent demo edits are stored as an overlay on top of the deterministic
 * seed. Resetting the demo simply discards the overlay.
 */
export interface SignalReviewRecord {
  status: ReviewStatus;
  by: ID;
  at: ISODateTime;
  note?: string;
  /** Last evidence date at the time of review; newer evidence re-surfaces a dismissed signal. */
  lastEvidenceAtReview: ISODate;
}

export interface ProjectAdjustment {
  remainingHoursEstimate?: number;
  contractValue?: number;
  futureBillRateFactor?: number;
  remainingCostRate?: number;
  targetMargin?: number;
  appliedAt: ISODateTime;
  appliedBy: ID;
  note: string;
}

export interface ImportBatch {
  id: ID;
  dataset: string;
  at: ISODateTime;
  by: ID;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  duplicates: number;
  spreadsheet: string;
}

export interface AuditEntry {
  at: ISODateTime;
  orgId: ID;
  actor: ID;
  action: string;
  detail: string;
}

export interface OrgOverlay {
  actions: Record<ID, Action>;
  signalReviews: Record<ID, SignalReviewRecord>;
  opportunityEdits: Record<ID, { estimatedValue?: number | null; estimatedBy?: ID; nextStep?: string; status?: Opportunity["status"] }>;
  projectAdjustments: Record<ID, ProjectAdjustment>;
  mappingDecisions: Record<ID, "confirmed" | "rejected">;
  imports: { batches: ImportBatch[]; records: Record<string, Record<string, unknown>> };
  settings: { reportingCurrency?: CurrencyCode };
}

export interface DemoState {
  version: 1;
  orgs: Record<ID, OrgOverlay>;
  audit: AuditEntry[];
}

export function emptyOverlay(): OrgOverlay {
  return { actions: {}, signalReviews: {}, opportunityEdits: {}, projectAdjustments: {}, mappingDecisions: {}, imports: { batches: [], records: {} }, settings: {} };
}

export function emptyState(): DemoState {
  return { version: 1, orgs: {}, audit: [] };
}

export function overlayFor(state: DemoState, orgId: ID): OrgOverlay {
  return { ...emptyOverlay(), ...(state.orgs[orgId] ?? {}) };
}

/** Wall-clock timestamp for edits, pinned to the demo date so the story stays coherent. */
export function demoTimestamp(demoDate: ISODate): ISODateTime {
  const now = new Date();
  return `${demoDate}T${now.toISOString().slice(11, 19)}Z`;
}
