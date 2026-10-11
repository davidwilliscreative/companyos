import type { Workspace } from "@/data/access";
import type { EvidenceLink, ID } from "@/domain/types";
import { fmtMoney } from "@/lib/money";
import { hrefFor } from "@/lib/links";

/** Small presentation helpers bound to a workspace. Server-side only by convention. */
export function viewHelpers(ws: Workspace) {
  const cur = ws.org.reportingCurrency;
  const people = new Map(ws.data.people.map((p) => [p.id, p]));
  const accounts = new Map(ws.data.accounts.map((a) => [a.id, a]));
  const projects = new Map(ws.data.projects.map((p) => [p.id, p]));
  return {
    cur,
    money: (n: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }) => fmtMoney(n, cur, opts),
    person: (id: ID | undefined) => (id ? people.get(id)?.name ?? "Unknown person" : "Unassigned"),
    account: (id: ID | undefined) => (id ? accounts.get(id)?.name ?? "Other" : "—"),
    project: (id: ID | undefined) => (id ? projects.get(id)?.name ?? "Other work" : "—"),
    href: (l: EvidenceLink) => hrefFor(l, ws.data),
    linkLabel: (l: EvidenceLink) => {
      if (l.label) return l.label;
      switch (l.type) {
        case "account":
          return accounts.get(l.id)?.name ?? "Account";
        case "project":
          return projects.get(l.id)?.name ?? "Project";
        case "milestone":
          return ws.data.milestones.find((m) => m.id === l.id)?.name ?? "Milestone";
        case "task":
          return ws.data.tasks.find((t) => t.id === l.id)?.title ?? "Task";
        case "invoice":
          return `Invoice ${ws.data.invoices.find((i) => i.id === l.id)?.number ?? l.id}`;
        case "thread":
          return ws.data.threads.find((t) => t.id === l.id)?.subject ?? "Thread";
        case "message":
          return "Message";
        case "signal":
          return ws.analysis.signals.find((s) => s.id === l.id)?.summary ?? "Signal";
        case "person":
          return people.get(l.id)?.name ?? "Person";
        case "calculation":
          return "Calculation";
        case "opportunity": {
          const o = ws.analysis.opportunities.find((x) => x.id === l.id);
          return o ? `${accounts.get(o.accountId)?.name ?? ""}: ${o.offering}` : "Opportunity";
        }
        case "issue":
          return "Issue";
      }
    },
  };
}
