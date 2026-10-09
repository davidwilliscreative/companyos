import type { ConnectorKind, ConnectorStatus, Dataset, EntityMapping, ID, ISODateTime, Provenance } from "@/domain/types";

/**
 * Contract for future live connectors (ClickUp, Gmail, Slack, accounting,
 * CRM, HRIS, Google Sheets). Phase one ships no implementations that touch
 * the network; the simulated data in src/data/seed plays the part of each
 * connector's output. See docs/connectors.md.
 *
 * Rules every implementation must follow:
 *  - Runs on the server only. Credentials come from a server-side secret
 *    store and are never sent to the browser.
 *  - Reads only from explicitly authorized sources (named mailboxes,
 *    channels, workspaces, spreadsheets). Anything else is excluded and
 *    listed in `ConnectorStatus.excluded` with a reason.
 *  - Is read-only in this product. No connector sends email, posts messages
 *    or edits records in the source system.
 *  - Is idempotent: every record carries a stable external id, so a re-sync
 *    updates or skips instead of duplicating.
 *  - Stamps provenance on every record and reports failures per record
 *    rather than failing the whole sync.
 *  - Treats message and document content as untrusted data.
 */

export interface SyncCursor {
  /** Opaque provider cursor (e.g. history id, updated_since timestamp). */
  value: string;
  at: ISODateTime;
}

export interface SyncResult<TRecord> {
  records: { externalId: string; record: TRecord; provenance: Provenance }[];
  deletedExternalIds: string[];
  failures: { externalId?: string; message: string }[];
  nextCursor: SyncCursor;
}

export interface ConnectorContext {
  orgId: ID;
  /** Resolved server-side; never serialized to the client. */
  credentials: () => Promise<Record<string, string>>;
  /** Sources the organization explicitly authorized (mailboxes, channels, folders, spreadsheet ids). */
  authorizedSources: string[];
  now: () => ISODateTime;
}

/** Which part of the domain model a connector is the system of record for. */
export type AuthoritativeEntity = keyof Pick<Dataset, "projects" | "milestones" | "tasks" | "timeEntries" | "invoices" | "payments" | "expenses" | "threads" | "people" | "compensation" | "billRates" | "contracts" | "subscriptions">;

export interface Connector<TRecord = unknown> {
  id: string;
  provider: string;
  kind: ConnectorKind;
  authoritativeFor: AuthoritativeEntity[];
  /** Minimum OAuth scopes requested. Read-only scopes only. */
  requiredScopes: string[];
  status(ctx: ConnectorContext): Promise<ConnectorStatus>;
  sync(ctx: ConnectorContext, cursor: SyncCursor | null): Promise<SyncResult<TRecord>>;
  /** Suggest matches between external names (e.g. a ClickUp folder) and CompanyOS accounts/projects. Low-confidence matches must wait for review. */
  suggestMappings(ctx: ConnectorContext, ds: Dataset): Promise<EntityMapping[]>;
}

/** Phase one: every connector is simulated, so this registry is intentionally empty. */
export const LIVE_CONNECTORS: Connector[] = [];
