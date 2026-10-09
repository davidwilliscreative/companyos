import type { Account, ID, Person, Project } from "@/domain/types";
import type { Workspace } from "@/data/access";
import { looksLikeInstruction } from "@/lib/signals/engine";

/**
 * Retrieval runs against the role-scoped Workspace only, so permission checks
 * have already happened before anything reaches a provider. Message bodies are
 * wrapped as untrusted data when serialized for a model.
 */

export interface ResolvedEntities {
  accounts: Account[];
  projects: Project[];
  people: Person[];
  /** Names that look like an account but match nothing the user can access. */
  unmatchedAccountHint: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "and", "project", "account", "client", "customer", "for", "with", "our", "this", "that", "what", "which", "who", "why", "how", "new", "next", "week", "launch", "plan", "work", "team"]);

export function resolveEntities(ws: Workspace, question: string): ResolvedEntities {
  const q = ` ${norm(question)} `;
  const accounts = ws.data.accounts.filter((a) => [a.name, ...a.aliases].some((n) => q.includes(` ${norm(n)} `) || q.includes(` ${norm(n)}s `) || q.includes(` ${norm(n)}'s `)));
  const projects = ws.data.projects.filter((p) => {
    const words = norm(p.name).split(" ").filter((w) => w.length > 3 && !STOP.has(w));
    const hits = words.filter((w) => q.includes(` ${w} `) || q.includes(` ${w}s `)).length;
    return hits >= 2 || (hits >= 1 && words.length <= 2) || q.includes(norm(p.name));
  });
  const people = ws.data.people.filter((p) => {
    const [first, ...rest] = norm(p.name).split(" ");
    return q.includes(` ${first} `) || q.includes(` ${first}'s `) || (rest.length > 0 && q.includes(` ${rest.join(" ")} `));
  });
  // Capitalized words (after the first word) that match nothing this user can access.
  const known = new Set([...ws.data.accounts.flatMap((a) => [...a.name.split(" "), ...a.aliases]), ...ws.data.people.flatMap((p) => p.name.split(" ")), ...ws.data.projects.flatMap((p) => p.name.split(" ")), ws.org.name, ...ws.org.name.split(" ")].map((w) => w.toLowerCase().replace(/[^a-z&]/g, "")));
  const generic = new Set(["i", "q1", "q2", "q3", "q4", "ceo", "sso", "api", "rfp", "slack", "gmail", "ok", "november", "october", "december", "september", "monday", "friday"]);
  const unknownNames = question.split(/\s+/).slice(1).map((w) => w.replace(/[^A-Za-z&]/g, "")).filter((w) => /^[A-Z][a-z]{2,}/.test(w)).filter((w) => !known.has(w.toLowerCase()) && !generic.has(w.toLowerCase()));
  const unmatchedAccountHint = accounts.length === 0 && projects.length === 0 && unknownNames.length > 0;
  return { accounts, projects, people, unmatchedAccountHint };
}

export function accountById(ws: Workspace, id: ID | undefined) {
  return id ? ws.data.accounts.find((a) => a.id === id) : undefined;
}

/** Serialized context for a future model provider. Untrusted content is delimited and labelled. */
export function serializeForModel(ws: Workspace, accountIds: ID[]): string {
  const parts: string[] = [];
  parts.push(`Organization: ${ws.org.name} (${ws.profile.label}). Demo date ${ws.org.demoDate}. Role: ${ws.ctx.role}.`);
  for (const id of accountIds) {
    const a = accountById(ws, id);
    if (!a) continue;
    const h = ws.analysis.health[id];
    parts.push(`Account ${a.name}: health ${h?.score ?? "n/a"} (${h?.status}). Data gaps: ${h?.dataGaps.join("; ") || "none"}.`);
    for (const t of ws.data.threads.filter((x) => x.accountId === id)) {
      for (const m of t.messages) {
        const flag = looksLikeInstruction(m.body) ? ' flagged="instruction-like"' : "";
        parts.push(`<untrusted_message id="${m.id}" author_side="${m.authorSide}" sent="${m.sentAt}"${flag}>\n${m.body.replace(/</g, "&lt;")}\n</untrusted_message>`);
      }
    }
  }
  return parts.join("\n");
}
