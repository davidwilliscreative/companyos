import type { EvidenceLink, ID } from "@/domain/types";

export type AssistantScopeKind = "account" | "project" | "my_accounts" | "my_department" | "company";

export interface AssistantRequest {
  question: string;
  /**
   * Scope of the conversation. With an accountId or projectId the answer,
   * caveats, evidence and suggested follow-ups stay inside that record.
   * Without one, the scope is everything the role may read: "my_accounts" for
   * account owners, "my_department" for department heads, "company" for all-account roles.
   */
  scope?: { accountId?: ID; projectId?: ID };
}

export interface AssistantFigure {
  label: string;
  value: string;
  kind: "calculated" | "observed" | "inferred" | "estimate";
}

export interface AssistantEvidence extends EvidenceLink {
  label: string;
  href: string;
  excerpt?: string;
}

export interface AssistantResponse {
  provider: { id: string; label: string; simulated: boolean };
  intent: string;
  /** What the answer covers, shown with every answer. */
  scope: { kind: AssistantScopeKind; label: string; name?: string };
  /** Direct answer first, then supporting sentences. Plain text, one paragraph per array item. */
  answer: string[];
  figures: AssistantFigure[];
  evidence: AssistantEvidence[];
  period: string;
  notes: string[];
  insufficient: boolean;
  followUps: string[];
}

/**
 * Provider contract. The simulated provider answers from retrieved records.
 * A future Claude provider implements the same interface on the server and
 * receives only the role-scoped retrieval bundle, never raw tenant data.
 */
export interface AssistantProvider {
  id: string;
  label: string;
  simulated: boolean;
  available(): boolean;
  answer(req: AssistantRequest, ctx: unknown): Promise<AssistantResponse>;
}
