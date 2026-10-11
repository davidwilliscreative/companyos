# Permissions, issues and status

How OpsInstinct decides who sees what, how alerts become issues, and how status is judged. The code is the source of truth. This file explains it and must change when the code does:

- Capabilities: `src/lib/permissions.ts`
- Enforcement: `src/data/access.ts`
- Issues: `src/lib/issues.ts`
- Status: `src/lib/interpret.ts`
- Home: `src/lib/home.ts`

## 1. Capabilities

Each role is a set of separate capabilities. Business data and system administration are independent, so managing integrations grants no access to money, compensation or messages.

| Capability | Executive | Finance | Account owner | Administrator |
| --- | --- | --- | --- | --- |
| Record scope (`allAccounts`) | All accounts | All accounts | Accounts they own | All accounts, without money or messages |
| Company financial summaries and cash (`viewCompanyFinance`) | Yes | Yes | No | No |
| Account and project financial aggregates (`viewProjectCosts`) | Yes | Yes | Own accounts | No |
| Individual compensation and loaded labor cost (`viewCompensation`) | Yes | Yes | No | No |
| Contract values and invoice amounts (`viewCommercialTerms`) | Yes | Yes | Own accounts | No |
| Communications (`communications`) | All | Billing threads only | Own accounts | None |
| Review signals (`reviewSignals`) | Yes | No | Yes | No |
| Create and manage plans (`manageActions`) | Yes | Yes | Yes | No |
| Apply what-if scenarios (`applyScenarios`) | Yes | Yes | No | No |
| Manage integrations and mappings (`manageIntegrations`) | No | No | No | Yes |
| Imports (`importDatasets`) | None | All | None | Non-restricted only |
| Connector and import detail (`viewSystemDetail`) | Yes | Yes | No | Yes |
| Reset demo (`resetDemo`) | Yes | Yes | Yes | Yes |

### Enforcement

`buildWorkspace` in `src/data/access.ts` is the only boundary. Screens, the issue model and the assistant receive a workspace that has already been filtered, so a page cannot leak what it was never given.

- **Account owner.** Records for other accounts are removed. Capacity still counts their load so overloads are visible. Those projects appear as "Other work", and attention text names only permitted projects plus "N other projects".
- **Administrator.** The data layer removes the following:
  - money fields: rates, invoices, contract values, budgets and costs
  - compensation
  - message content

  System-health summaries stay. Every role sees a plain-language summary of unreliable sources and what they affect (`ws.sources`), for example "Accounting sync failed; receivables and collections may be out of date". Connector internals, failure text that names clients, and mappings need `viewSystemDetail`.
- **Assistant.** The assistant answers only from the workspace and only within its visible scope (Company-wide, Your accounts, This client or This project). It does not name accounts or projects outside that scope. A question about an account the role cannot see gets "restricted". It is read-only.
- **Preview switcher.** The role switcher in the local demo and public preview is a preview, not sign-in. With sign-in configured, the role comes from the member record. Only executives may preview another role.

### Scope labels

Every aggregate shows its scope:

- **Company-wide** for roles with `allAccounts`
- **Your accounts** for account owners
- **This client** or **This project** on detail pages

## 2. Issues

Alerts (`ws.analysis.attention`) are grouped into issues by `buildIssues`. An issue answers four questions:

- What needs attention?
- Why does it matter?
- What happens next?
- Who owns it?

### Grouping rules

1. **Group key.** Each alert gets a group key from the record it is about:

   | Alert | Group key | Issue id |
   | --- | --- | --- |
   | Person over capacity | `staff:<person>` | `iss_staff_<person>` |
   | Milestone late, blocked or awaiting approval | `ms:<project>` | `iss_ms_<project>` |
   | Margin below target (client work) | `margin:<project>` | `iss_margin_<project>` |
   | Forecast over budget (internal work, more than 5%) | `budget:<project>` | `iss_budget_<project>` |
   | Overdue invoice | `ar:<account>` | `iss_ar_<account>` |
   | Account health or renewal risk | `rel:<account>` | `iss_rel_<account>` |
   | Not enough data on an account | `data:<account>` | `iss_data_<account>` |
   | Opportunity | `opp:<account>` | `iss_opp_<account>` |

2. **Staffing absorbs schedule.** A staffing group absorbs a project's schedule group when a flagged milestone in it meets any of these conditions:
   - it is owned by that person
   - it has blocked tasks assigned to them
   - its blocked reason names them

   The overload and the work it is holding up are one situation with one plan.
3. **Separate owners stay separate.** Receivables, margin and relationship issues stay separate even for the same client, because each has a different owner and decision. They are linked as related issues instead.
4. **Ids are stable.** Ids derive from the records, never from list position, so links and plans survive reloads and re-ranking.
5. **Other issues.** Three more kinds come from outside the alert groups:
   - **System issues** (`iss_sys_<connector>`, `iss_sys_mappings`): unreliable sources and mappings awaiting review.
   - **Incomplete cost records** (`iss_data_costs`): the period's cost records are missing data.
   - **Overdue plans** (`iss_plan_<action>`): an overdue plan that matches no issue.

### Impacts

Impacts are typed and labeled: money, days, percent, points, count or text. Each is shown on its own. Different measures are never added together. For example, held milestone billing and overdue invoices stay separate.

Values the role cannot see are `null` and carry a note. Margin gaps are shown in percentage points ("−55.1 pts"), never as a percent of a percent.

### Plans

A plan is an action whose links match the issue's key records.

- **One plan per issue.** Each action is the plan for its single most specific issue and is "related" anywhere else, so one plan never appears as the plan for two issues.
- **Specificity weights.**

  | Weight | Link types |
  | --- | --- |
  | 10 | issue |
  | 3 | milestone, task, person |
  | 2 | project, invoice, signal, calculation |
  | 1 | thread, message, account |

- **Wording.** Issues say "Create plan", "View plan" or "Update plan".
- **Overdue plans.** An overdue plan makes the issue's next update "Overdue".

### Review states

Review states apply to relationship and opportunity issues inferred from messages:

| State | Meaning |
| --- | --- |
| From recorded data | Based on dates, assignments and amounts. No review needed. |
| Not yet reviewed | Inferred from messages. Someone should confirm or dismiss it. |
| Confirmed | A reviewer confirmed it. |
| Appears resolved · awaiting confirmation | Later messages suggest it is resolved. It stays visible until someone confirms. |
| Reopened | It was dismissed, then new evidence arrived. The issue says which message and when. |

On the Plans page:

- An open plan whose issue is no longer detected shows "Appears resolved · awaiting confirmation".
- A plan marked done whose issue is still detected shows "Issue still open" with the current evidence.

### Executive decisions

An issue is flagged for an executive when any of these is true:

- severity is critical
- a renewal is at risk
- one person is blocking work for two or more clients
- the plan is overdue on a high- or critical-severity issue
- client work is forecast to lose money

The reason is shown on the issue.

### Role focus (`issuesForRole`)

| Role | Ordering and filter |
| --- | --- |
| Executive | Executive decisions first. System issues only if high severity. |
| Finance | Collections, margin, budget and cost-data issues first. Then other issues with a money impact, and system issues that affect receivables, cash, cost or margin. |
| Account owner | Issues on their accounts. Issues they own rank ahead of equally urgent ones owned by colleagues. No system issues. |
| Administrator | System and data issues only. |

Home shows the top five issues (three on phones) and always states the total and urgent counts. Urgent items are never hidden without saying so.

## 3. Status by dimension

`interpretAccount` and `interpretProject` judge each dimension separately:

- Relationship
- Delivery
- Financial
- Data confidence
- Intervention

Each dimension gets a level (Good, Watch, At risk, Not enough data, Restricted, No active work) and a one-sentence reason.

Hard facts override the weighted health score within their own dimension:

| Fact | Effect |
| --- | --- |
| A blocked or late milestone | Delivery is at risk |
| A loss-making forecast | Financial is at risk |
| An invoice more than 60 days overdue | Financial is at risk |
| An unresolved high-severity signal with medium or high confidence | Relationship is at risk |

The overall status is the worst known dimension. Missing data is never treated as healthy; it shows as "Not enough data". The weighted score and its factors are behind "Why this status?".

### Counter-evidence

Opposite-tone messages are classified before they affect a signal:

- **Contradicts.** A later message in the same conversation, or a directly opposite statement (for example interest in more work against cancellation risk). Only a newer contradiction lowers confidence.
- **Context.** Praise or complaints in other conversations. These are shown but do not change confidence.

## 4. Financial figures

Every figure states its period, its scope and whether it is historical, current or a forecast. Warnings travel with the figure: "Incomplete costs", "Source out of date" and "Forecast".

Earned, invoiced, collected and forecast amounts are always shown separately.

Delivery margin and operating result are different measures:

- **Delivery margin** covers direct cost only: labor, contractors and project expenses.
- **Operating result** also subtracts non-client payroll, internal work and overhead.

The Finance page explains the gap in one sentence and keeps the reconciliation behind "Calculation".

## 5. Future work: Delivery Lead role

A Delivery Lead role (delivery health, staffing and blockers across all projects, without compensation or company finance) was considered. It was not built, because:

- it needs a fifth demo persona and seed data in all three profiles
- it would need a new record scope ("projects I lead" across accounts) that `buildWorkspace` does not yet express

The capability model supports it as `allAccounts: true`, `viewProjectCosts: false`, `viewCompensation: false`, `communications: "none"`, `manageActions: true`, with a Home focused on milestones, staffing gaps and over-allocation.
