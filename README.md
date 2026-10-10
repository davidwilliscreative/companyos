# CompanyOS (phase-one demo)

A company intelligence and operating platform for a CEO who is not in day-to-day execution. It answers "what needs my attention, why, and what should happen next?" across client health, delivery, profitability, cash, capacity, renewals and expansion, and lets the CEO drill into any account and ask questions about it.

> **This is a demo, not a production system.** All data is synthetic. Every connector status is simulated. The assistant is a deterministic simulation; no AI service is connected. Locally, authentication is a role switcher; the hosted version uses Google sign-in with an approved-email list.

## Setup

**Not a developer?** Install Node.js (LTS) from https://nodejs.org, then double-click `Start CompanyOS (Mac).command` or `Start CompanyOS (Windows).bat`. The first run installs dependencies; your browser then opens the demo. Close the window to stop it.

Requirements: Node.js 20 or later. No API keys, accounts or external services.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run check        # typecheck + lint + tests + production build
npm test             # vitest (106 tests)
npm run build && npm start
npm run ask -- executive agency "Which accounts need attention this week, and why?"
```

Run locally like this, there is no sign-in and demo edits are stored in `.data/demo-state.json`. Use **Settings & demo → Reset demo data**, or delete that file, to return to the seed.

### Hosted version (sign-in and shared database)

Setting the three values in `.env.example` turns on Google sign-in (only emails listed in Supabase's `members` table get in, with the role stored there) and saves edits in Supabase instead of the local file. Executives can still preview other roles; everyone else is fixed to theirs. Step-by-step hosting on Vercel with a custom domain is in [docs/deploy.md](docs/deploy.md).

## Five-minute walkthrough

The demo date is fixed at **Monday 5 October 2026**. The default reporting period is Q3 2026; change it in the header.

1. **Overview (Agency, Executive).** The priority queue leads with Brightwater Credit Union's renewal (critical, $192k at stake, three supporting conversations), then Harbor & Pine's margin problem, Verdant's 66-day overdue invoice and a milestone stuck on client approval, and Priya Shah planned at 120% across four projects. Lumen Analytics shows as *insufficient data*, not healthy. Every item links to its source.
2. **Harbor & Pine (satisfied client, unprofitable project).** The client is happy, but the fixed-fee website rebuild is forecast at about −10% against a 45% target because of absorbed scope. Open *How this forecast is calculated*, then try the what-if calculator: a $185k change order lifts the forecast to about 11%. Nothing changes until you press **Apply to forecast**; removing it restores the original.
3. **Brightwater (renewal risk).** Open the signal to see three supporting messages, contradicting evidence, the confidence explanation and the recommended action. Confirm or dismiss it, or create an action from it.
4. **Ask CompanyOS** (⌘K / Ctrl+K). Try the suggested questions or variations such as "Why did Meridian's health decline?" or "Can we take on a new project with 200 developer hours?". Answers include figures, evidence links, the period and missing-data notes.
5. **Switch role to Account owner** (Sofia Alvarez). Only her four clients load; salaries and cost rates disappear from the Team page; asking the assistant about someone's salary is refused; asking about Meridian (not hers) returns "not found".
6. **Switch role to Finance → Integrations → Google Sheets import.** Preview the compensation sheet to see validation errors (unknown person, invalid date, duplicate row), apply it, and preview again: every row is now *unchanged*. Omar Haddad's missing cost rate is filled in.
7. **Switch profile** to SaaS startup (customers, ARR, seat usage, renewals) and Larger organization (business units, budgets, dependencies). Terminology, metrics, health components and modules change; billable utilization and client margins are not forced on them.
8. **Weekly briefing** summarizes what got worse and better, upcoming milestones and renewals, actions due and data quality.

### Seeded agency scenarios

| Scenario | Where to see it |
| --- | --- |
| Satisfied client, unprofitable project | Harbor & Pine Hotels → website rebuild |
| Unhappy client with current invoices | Meridian Health Partners (health down 16, no overdue invoices) |
| Profitable account with credible expansion | Copperline Logistics → analytics dashboards opportunity |
| Delayed project awaiting client approval | Verdant Foods → launch campaign, claims approval |
| Retainer with scope creep | Atlas Fitness → hours above the included allowance |
| Renewal risk across several conversations | Brightwater Credit Union |
| Overloaded team member | Priya Shah (four projects, blocked tasks) |
| Serious issue since resolved | Kestrel Outdoor outage (kept as resolved history) |
| Stale or insufficient information | Lumen Analytics (no recent contact, Slack channel not connected, an embedded prompt-injection message that is flagged and ignored) |

Agency seed: 10 clients, 15 employees and 3 contractors, 18 projects, 28 tasks, about 1,350 weekly time entries, 62 invoices with payments and expenses, and 34 email and Slack threads over six months. SaaS: 8 customers and 4 product initiatives. Larger organization: 4 business units and 5 initiatives.

## What is implemented, simulated, or future

| Implemented | Simulated | Future work |
| --- | --- | --- |
| All calculations (labor cost, earned revenue, margins, utilization, AR aging, cash forecast, concentration, health) | Connector statuses, sync times, scopes and failures | Live ClickUp, Gmail, Slack, accounting and Sheets connectors |
| Navigation, filters, drilldowns, evidence links | Source data (synthetic seed) | Real authentication (SSO), tenant isolation |
| Persistent actions, comments, signal reviews, opportunity estimates, applied scenarios, mapping decisions, imports, currency | The assistant (deterministic, rule-based) | Server-side Claude provider |
| Role permissions in the data layer, including assistant retrieval | Sign-in locally (role switcher); hosted uses Google sign-in | Encryption at rest, retention controls |
| Sheets import with mapping, validation, idempotent re-import | Google Sheets content | Scheduled refresh, notifications |

## Calculation assumptions

All metrics are computed in application code (`src/lib/calc`). The in-app page **How numbers are calculated** lists every formula.

- **Hourly labor cost** = (annual salary + annual employer costs) ÷ (annual working hours × FTE). Agency uses 1,800 hours. The compensation record effective on the work date applies. Contractors use their hourly cost.
- **Project labor cost** = actual hours × the applicable hourly cost. Hours with no cost rate are reported as missing, never silently costed at zero.
- **Earned revenue**: T&M = billable hours × bill rate effective that week; fixed fee = fee × effort-based percent complete; retainer = monthly fee × completed months; subscriptions = MRR × completed months. Internal initiatives have no revenue.
- **Revenue basis for margins.** Actual-to-date margin compares cumulative earned revenue with cumulative cost over the same window. Forecast margin compares revenue at completion with forecast cost at completion. Partial-period revenue is never compared with whole-project cost. History before the loaded data start (1 April 2026) is excluded on both sides and flagged.
- **Forecast total cost** = actual direct cost + remaining hours × blended cost rate of the planned team + remaining direct expenses.
- **Delivery margin** = (earned revenue − direct labor − contractors − project expenses) ÷ earned revenue. It is "—" when revenue is zero.
- **Utilization** = billable hours ÷ available hours (capacity × weeks − approved time off), for delivery employees only.
- **No double counting.** The reconciliation on the Finance page goes from delivery profit to a simplified operating result: payroll = labor on client work + non-client labor. Overhead is shown separately and not allocated to projects. Delivery margin is labelled distinctly from company profit, and the operating result is a management view, not accounting profit.
- **Billable rates and labor costs are separate datasets.** Bill rates are visible to roles that can see project costs; individual costs and salaries only to Executive and Finance.
- **Cash forecast** starts from an observed opening balance and lists every assumption: collection timing (each client's observed lateness by default), invoices over 60 days overdue excluded from the base case, future billing schedules, payroll day, contractor payment lag and overhead. Assumptions can be changed on the page without saving anything. Opportunity values are never included.
- **Currency.** One reporting currency (USD, EUR or GBP) with fixed demo exchange rates. The agency has one EUR-billed contractor.
- **Health** is a transparent weighted score per profile. Missing components reduce completeness; below 70% completeness, or with three or more data gaps, the account is "insufficient data". An open critical risk caps the status at "watch".
- **Signals** use rules over thread context with a 30-day recency half-life, track resolution and contradicting messages, and avoid duplicates (one signal per account and category). Confidence describes evidence strength, not probability. No churn probabilities are produced.

## Architecture

Next.js 15 (App Router, server components and server actions), React 19, TypeScript (strict), Tailwind CSS, Recharts and Vitest. Persistent edits use a small JSON-file store behind a `StateStore` interface, so SQLite or Postgres can replace it without touching callers.

```
src/
  domain/        types.ts (industry-neutral entities), profiles.ts (terminology, modules, health weights)
  data/
    seed/        deterministic synthetic data per profile (agency, saas, enterprise)
    state.ts     overlay of demo edits; store.ts (JSON file / in-memory)
    dataset.ts   seed + validated imports + applied scenarios + mapping decisions, normalized to reporting currency
    access.ts    the permission boundary: builds a role- and org-scoped Workspace
    mutations.ts every write, with capability checks and an audit entry
    session.ts   demo role/profile/period from cookies
  lib/
    calc/        finance, company (periods, P&L, AR, cash, concentration), capacity, health, scenario
    signals/     signal engine
    analytics.ts attention queue, opportunities, renewals
    changes.ts   what changed in the last 7 days
    assistant/   provider interface, retrieval, simulated provider, Claude provider stub
    connectors/  connector contract (types.ts) and the simulated Sheets import
  app/           pages, server actions, /api/assistant and /api/import
  components/    UI kit, charts, client forms, assistant, import wizard, scenario calculator
tests/           finance, aggregation, permissions, assistant grounding, signals, imports, profiles
docs/connectors.md
```

Key boundaries:

- **Presentation, calculations, data access, signals and assistant are separate modules.** Pages only read a `Workspace`.
- **Permissions are enforced in `buildWorkspace`**, before any page or the assistant sees data. Restricted records are removed, not hidden in the UI: account owners do not receive other accounts, compensation or company cash; Finance sees billing threads only; administrators see no message content, costs or compensation. Signal evidence from unreadable threads is redacted.
- **The assistant** receives the scoped workspace, reuses the dashboard's calculations, answers from retrieved records with evidence links, and says when information is insufficient. Message content is treated as untrusted. A `ClaudeProvider` stub documents the future server-side implementation; it is disabled.
- **Connectors** implement the contract in `src/lib/connectors/types.ts`; see [docs/connectors.md](docs/connectors.md) for authorization, mapping, sync, conflicts and retention.

## Production roadmap (prioritized)

1. **Identity and tenancy:** enterprise SSO (SAML/OIDC), SCIM provisioning, role management, and tenant isolation enforced in the database (row-level security), replacing the role switcher.
2. **Data platform:** move from the JSON file to Postgres with migrations; encryption at rest and in transit; immutable audit log of reads of sensitive data as well as writes.
3. **Accounting and Google Sheets connectors** (read-only), because finance figures depend on them: incremental sync, validation, reconciliation and authoritative-source rules.
4. **ClickUp connector** for projects, tasks, milestones and time.
5. **Gmail and Slack connectors** limited to administrator-authorized mailboxes and explicitly authorized channels, with exclusions, retention windows and provider-policy compliance.
6. **Claude provider** behind the existing interface: server-side key, scoped retrieval, untrusted-content handling, answer validation against computed figures, usage logging and evaluation sets.
7. **Governance:** data retention and deletion controls, connector access reviews, permission-change handling, and admin reporting.
8. **Workflow:** notifications and scheduled briefings (opt-in), action assignment to real users, and comments with mentions.
9. **Model quality:** calibrate signal rules against reviewed outcomes, and add dated FX rates, accrual-aware revenue recognition and overhead allocation options.

## Known limitations

- Demo edits are one shared overlay (a JSON file locally, one Supabase row when hosted, with conflict detection). Connector data will need normalized tables.
- The simulated assistant is rule-based. It handles the listed question types and common variations, not open-ended conversation.
- Signal detection is keyword- and rule-based over synthetic messages. It is explainable but not a validated model.
- Cash forecast and revenue recognition are simplified management views, not accounting.
- Health trend compares now with 30 days earlier rather than a full time series.
- Locally, the role switcher is not security. Hosted, roles come from the members table, but permissions are enforced in application code over the demo data rather than by per-record database policies.
