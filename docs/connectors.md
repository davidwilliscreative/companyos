# Future connectors

Phase one has **no live connectors**. Every connector status in the app is simulated, and the synthetic records in `src/data/seed` stand in for each connector's output. This document describes how real connectors will be added without rebuilding the product. The contract lives in `src/lib/connectors/types.ts`.

Initial targets: ClickUp (project management), Google Workspace Gmail and Slack (communications), a selected accounting provider (finance), Google Sheets (financial and operational spreadsheets). Later: a CRM and an HRIS.

## Principles

- **Server-only and read-only.** Connectors run on the server. Credentials live in a server-side secret store, are scoped per organization and never reach the browser. No connector sends email, posts messages or writes back to the source.
- **Explicit authorization.** Only sources an administrator explicitly authorizes are read: named mailboxes, specific Slack channels, chosen ClickUp spaces, specific spreadsheets. Everything else is excluded and shown on the Integrations page with a reason.
- **Least privilege.** Request the narrowest read-only scopes. Show granted and missing scopes per connector, as the demo already does.
- **Untrusted content.** Message and document content is data, never instructions. It is wrapped as untrusted when passed to any model, and never changes system behavior.
- **Provenance on every record.** System, dataset, row or object reference, batch id and import time are stored with each record (`Provenance` in `src/domain/types.ts`).

## Authorization and provider limits

| Provider | Authorization | Limits to respect |
| --- | --- | --- |
| ClickUp | OAuth app per workspace, read scopes | Per-token rate limits; webhooks for change notifications where available |
| Gmail | Google Workspace admin-approved OAuth or domain-wide delegation limited to listed mailboxes; `gmail.readonly` | Per-user quota units; history API for incremental sync; honor mailbox exclusions |
| Slack | Bot token added to specific channels by their members; `channels:history`, `groups:history` only for channels the bot was invited to | Tiered method rate limits. Slack admin status does **not** grant access to private channels or DMs, and compliance exports and Discovery APIs are not used for business intelligence |
| Accounting | Provider OAuth, read-only scopes for invoices, payments, contacts | Provider rate limits and pagination; respect multi-currency fields |
| Google Sheets | Read-only access to specific spreadsheet ids (`spreadsheets.readonly`, or Drive file picker grants) | Per-minute read quotas; header row required |

Permission changes (scope revoked, bot removed from a channel, mailbox removed from the allow-list) are detected on each sync. The connector marks itself degraded, stops reading the affected source and, where policy requires, deletes cached content from that source.

## Mapping accounts and projects across systems

Each connector proposes `EntityMapping` records that link an external name or id (a ClickUp folder, an accounting contact, a Slack channel, an email domain) to a Opsight account or project, with a confidence and a reason.

- **High confidence** (exact id or unique domain match) can be auto-confirmed if the administrator allows it.
- **Medium or low confidence** waits in the mapping review table on the Integrations page. An administrator confirms or rejects; until then the data is shown as an unconfirmed source and counts as a data gap in account health. The demo includes these cases (for example a ClickUp folder named "NW Cycles" that could also match an archived prospect).
- Decisions are stored and audited, and are not re-asked unless the external object changes.

## Incremental sync, pagination, rate limits, retries and deduplication

- Each connector keeps a `SyncCursor` (history id, `updated_since` timestamp, or change token) per authorized source and requests only changes since the cursor.
- Pagination follows provider cursors to completion before the cursor advances, so a failed page is retried rather than skipped.
- Rate limits are handled with exponential backoff and jitter, honoring `Retry-After`. Long backfills are chunked and resumable.
- Every record has a stable external id. Upserts use it as the key, so re-syncs and re-imports update or skip instead of duplicating. The Sheets import in the demo shows this behavior (repeat imports report "unchanged").
- Failures are recorded per record (`ConnectorStatus.failures`) and do not fail the whole sync. Partial syncs are labelled partial, and the affected figures carry a missing-data note.

## Timestamps, deletions and freshness

- Store both the source timestamp (created or modified in the provider) and the ingestion timestamp.
- Deletions and archival in the source are propagated as soft deletes with the deletion time, so history and audit remain explainable.
- The last successful sync per connector drives the freshness indicator. Stale connectors are flagged on the overview and in affected calculations; stale data is never presented as current.

## Conflicts and authoritative sources

Each connector declares what it is authoritative for (`authoritativeFor`). Defaults:

| Data | Authoritative source |
| --- | --- |
| Invoices, payments | Accounting provider |
| Projects, tasks, milestones, time entries | ClickUp (or the selected PM tool) |
| Compensation, employer costs | HRIS, or a restricted Google Sheet until an HRIS exists |
| Bill rates, budgets, contracts | Google Sheets until a CRM or PSA exists |
| Communications | Gmail and Slack |

When two sources disagree, the authoritative value wins and the conflict is shown for review (the demo flags an invoice amount that differs between a spreadsheet and the accounting system). Manual edits in Opsight are kept as overrides with provenance, never silently overwritten.

## Retention and caching

- Cache only what calculations and evidence links need. For communications, store message metadata plus the excerpts used as signal evidence; fetch full bodies on demand where the provider allows.
- Apply per-provider and per-customer retention windows, and purge content when a source is de-authorized.
- Encrypt cached content at rest, scope it by organization, and log access.

## Google Sheets (read-only)

1. The administrator selects a spreadsheet and sheet per dataset (compensation, bill rates, contracts, time entries, budgets, invoices, payments, expenses).
2. Opsight suggests a column mapping from header names; the administrator adjusts it.
3. A preview validates every row: required fields, types, dates, currencies, unknown people, projects or clients, duplicates within the sheet, and conflicts with authoritative systems.
4. Applying writes only valid rows, keyed by stable ids (for example `person + effective date` for compensation and rates). Effective dates mean a raise applies from its date only.
5. The compensation dataset is permissioned separately: only the Finance role can preview or import it, and its rows are never sent to the browser for other roles. Assistant retrieval sees compensation only for authorized roles.
6. A scheduled read-only refresh re-runs the same validation and reports last successful refresh and any new errors.

## Claude provider (future)

`src/lib/assistant/claude-provider.ts` documents the server-side implementation. It receives the role-scoped workspace, uses the computed answer as grounding, wraps messages as untrusted, exposes no write tools, and validates that every number and evidence id in the response exists in the grounding. The API key is a server environment variable. It is disabled in phase one.
