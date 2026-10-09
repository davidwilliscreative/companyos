import type { EvidenceLink, ID } from "@/domain/types";

export interface AssistantRequest {
  question: string;
  /** Account-specific assistant: answers are restricted to this account. */
  scope?: { accountId?: ID };
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
