import type { ConnectorStatus, Dataset, ISODate } from "@/domain/types";
import { daysBetween, fmtDate } from "@/lib/dates";

/**
 * Plain-language source status. Everyone may know that a source is unreliable
 * and which reports it affects, even when they cannot see the business detail
 * behind it (for example "Accounting sync failed; receivables reporting may be
 * outdated"). Connector internals (scopes, mailbox names, failure text that
 * names clients) are only in the detailed view for roles with viewSystemDetail.
 */

export interface SourceStatus {
  connectorId: string;
  provider: string;
  state: ConnectorStatus["state"];
  /** One permitted sentence: what is wrong and what it affects. */
  summary: string;
  /** Reports and decisions that depend on this source. */
  affects: string[];
  lastSuccessfulSync: ISODate | null;
  severity: "high" | "medium" | "low";
}

/** Which product areas each kind of authoritative data feeds. */
const AFFECTS: [RegExp, string][] = [
  [/invoice|payment|receivable|\bar\b/i, "Receivables and collections"],
  [/bank/i, "Cash forecast"],
  [/compensation|cost rate|employer/i, "Labor cost, delivery margins and operating result"],
  [/billable rate/i, "Earned revenue on time-and-materials work"],
  [/budget/i, "Budget tracking"],
  [/contract/i, "Renewals and fixed-fee revenue"],
  [/expense|vendor cost/i, "Project costs"],
  [/project|milestone|task|initiative/i, "Delivery status and milestones"],
  [/time entr/i, "Hours, utilization and labor cost"],
  [/slack|email|thread|programme/i, "Relationship signals and health"],
  [/usage/i, "Product usage health"],
  [/media spend|conversions/i, "Media pacing and KPI results"],
  [/subscription/i, "Recurring revenue and renewals"],
];

function affectsFor(c: ConnectorStatus): string[] {
  const out = new Set<string>();
  for (const what of c.authoritativeFor) for (const [re, label] of AFFECTS) if (re.test(what)) out.add(label);
  return [...out];
}

const KIND_NOUN: Record<ConnectorStatus["kind"], string> = {
  finance: "Accounting sync",
  advertising: "Ad platform reporting",
  communications: "Message sync",
  project_management: "Project sync",
  spreadsheet: "Spreadsheet import",
  crm: "Data sync",
  people: "People sync",
};

export function sourceStatuses(ds: Pick<Dataset, "connectors" | "org">): SourceStatus[] {
  const out: SourceStatus[] = [];
  for (const c of ds.connectors) {
    if (c.state === "healthy" || c.state === "not_configured") continue;
    const affects = affectsFor(c);
    const last = c.lastSuccessfulSync?.slice(0, 10) ?? null;
    const age = last ? daysBetween(last, ds.org.demoDate) : null;
    const noun = c.kind === "communications" ? `${c.provider} sync` : KIND_NOUN[c.kind];
    const what = c.state === "failed" ? "failed" : c.state === "stale" ? (c.failures.length ? "failed on its latest attempt" : `has not refreshed${age !== null ? ` for ${age} days` : ""}`) : "is only partly working";
    const consequence = affects.length ? `${affects[0].toLowerCase()}${affects.length > 1 ? ` and ${affects.length - 1} other report${affects.length > 2 ? "s" : ""}` : ""} may be outdated or incomplete` : "some figures may be outdated";
    out.push({
      connectorId: c.id,
      provider: c.provider,
      state: c.state,
      summary: `${noun} ${what}${last && c.state !== "degraded" ? ` (last good data ${fmtDate(last)})` : ""}; ${consequence}.`,
      affects,
      lastSuccessfulSync: last,
      severity: c.state === "failed" || (c.kind === "finance" && c.failures.length > 0) ? "high" : "medium",
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
