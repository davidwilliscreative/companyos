import type { Confidence, Dataset, Evidence, ID, ISODate, Message, Severity, Signal, SignalCategory, Thread } from "@/domain/types";
import { daysBetween } from "@/lib/dates";

/**
 * Deterministic signal engine.
 *
 * Reads authorized communication threads and produces risk, opportunity and
 * positive signals. It deliberately avoids isolated sentiment words:
 *  - phrases are weighted by who said them (client vs internal),
 *  - recency decays the weight (30-day half-life),
 *  - later messages in the same thread can resolve earlier issues,
 *  - repeated complaints inside one thread raise an "unresolved issue",
 *  - contradicting messages are kept as counter-evidence and lower confidence,
 *  - one signal per account and category (stable id) avoids duplicates.
 *
 * Message text is untrusted data. It is only pattern-matched, never executed
 * or followed as instructions.
 */

interface Rule {
  category: SignalCategory;
  phrases: string[];
  weight: number;
  sides: ("client" | "internal")[];
}

const RULES: Rule[] = [
  { category: "dissatisfaction", weight: 1.2, sides: ["client"], phrases: ["disappointed", "frustrated", "frustrating", "not happy", "unacceptable", "losing confidence", "falling short", "not what we expected", "hard to get a response", "need more reliable", "very frustrated", "concerned about the quality"] },
  { category: "unresolved_issue", weight: 1.3, sides: ["client"], phrases: ["still not fixed", "still seeing", "as i mentioned", "second time", "third time", "raised this before", "hasn't been fixed", "slipped again", "same issues"] },
  { category: "missed_commitment", weight: 1.0, sides: ["client", "internal"], phrases: ["missed the deadline", "was supposed to", "you promised", "slipped", "has been moved", "rescheduled", "will need to move", "pilot moved"] },
  { category: "scope_creep", weight: 1.0, sides: ["client", "internal"], phrases: ["could you also", "quick addition", "one more thing", "while you're at it", "can we add", "outside the retainer", "outside the original scope", "beyond the retainer", "haven't billed any overage", "absorbing about"] },
  { category: "approval_delay", weight: 1.1, sides: ["client", "internal"], phrases: ["legal review", "waiting on approval", "awaiting sign-off", "pending approval", "still with legal", "for sign-off", "approval still pending", "waiting on approval from"] },
  { category: "budget_concern", weight: 1.1, sides: ["client", "internal"], phrases: ["over budget", "budget is tight", "budget cuts", "reduce spend", "cost overrun", "cannot approve more spend", "can't approve more spend", "forecast over budget"] },
  { category: "renewal_risk", weight: 2.0, sides: ["client"], phrases: ["rfp", "evaluating other agencies", "evaluating options", "reconsidering", "will not renew", "not renew", "cancel at the end", "intend to cancel", "bring some of this in-house", "notice period", "whether we renew", "procurement review"] },
  { category: "dependency_risk", weight: 1.0, sides: ["client", "internal"], phrases: ["is at risk", "waiting on priya", "dependency on", "still waiting on the erp", "blocked by", "at risk:"] },
  { category: "expansion_interest", weight: 1.5, sides: ["client"], phrases: ["would love to talk about", "we'd love to talk about", "interested in", "could you help us with", "next phase", "after this phase", "have budget", "more seats", "rolling relay out", "roll relay out", "enterprise plan"] },
  { category: "positive_feedback", weight: 1.0, sides: ["client"], phrases: ["great work", "really pleased", "thank you so much", "fantastic", "loved", "impressed", "appreciate the transparency", "tested really well", "helpful, thank you", "exactly what we needed", "nice work", "happy with the plan", "went smoothly"] },
];

const RESOLUTION_PHRASES = ["fixed now", "confirmed all working", "all working", "issue is closed", "root cause", "resolved", "shipped", "back up"];
const NEGATORS = ["not", "no", "never", "isn't", "wasn't", "aren't", "don't", "didn't", "no longer"];

const RESOLVABLE: SignalCategory[] = ["dissatisfaction", "unresolved_issue", "missed_commitment", "dependency_risk"];

export const CATEGORY_LABEL: Record<SignalCategory, string> = {
  dissatisfaction: "Client dissatisfaction",
  unresolved_issue: "Repeated unresolved issue",
  missed_commitment: "Missed commitment",
  scope_creep: "Scope creep",
  approval_delay: "Approval delay",
  budget_concern: "Budget concern",
  renewal_risk: "Renewal or cancellation risk",
  dependency_risk: "Dependency or capacity risk",
  expansion_interest: "Expansion interest",
  positive_feedback: "Positive feedback",
};

export const CONFIDENCE_EXPLAINER =
  "Confidence describes how strong the textual evidence is, not a statistical probability. High: three or more relevant messages across at least two threads, recent (within 30 days), with no newer contradicting message. Medium: two or more messages, or one explicit recent statement. Low: a single or older mention, or evidence contradicted by newer messages.";

export function looksLikeInstruction(text: string): boolean {
  return /ignore (all )?(previous|prior) instructions|note to any ai|system prompt|you are now|disregard (the )?above/i.test(text);
}

function sentences(body: string): string[] {
  return body.replace(/\[.*?\]/gs, (m) => m).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function excerptFor(body: string, phrase: string): string {
  const s = sentences(body).find((x) => x.toLowerCase().includes(phrase)) ?? body;
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}

function negated(lower: string, idx: number): boolean {
  const before = lower.slice(Math.max(0, idx - 24), idx).split(/\s+/).filter(Boolean).slice(-3);
  return before.some((w) => NEGATORS.includes(w.replace(/[^a-z']/g, "")));
}

interface Hit {
  category: SignalCategory;
  phrases: string[];
  weight: number;
  message: Message;
  thread: Thread;
  excerpt: string;
}

function matchMessage(thread: Thread, m: Message): Hit[] {
  const lower = m.body.toLowerCase();
  const out: Hit[] = [];
  for (const rule of RULES) {
    if (!rule.sides.includes(m.authorSide)) continue;
    const matched: string[] = [];
    for (const ph of rule.phrases) {
      const idx = lower.indexOf(ph);
      if (idx < 0) continue;
      if (rule.category === "positive_feedback" && negated(lower, idx)) continue;
      matched.push(ph);
    }
    if (!matched.length) continue;
    const sideFactor = m.authorSide === "client" ? 1 : 0.7;
    out.push({ category: rule.category, phrases: matched, weight: rule.weight * sideFactor * Math.min(1.5, 1 + (matched.length - 1) * 0.25), message: m, thread, excerpt: excerptFor(m.body, matched[0]) });
  }
  return out;
}

function hasResolution(m: Message): boolean {
  const lower = m.body.toLowerCase();
  return RESOLUTION_PHRASES.some((p) => lower.includes(p));
}

const toEvidence = (h: Hit): Evidence => ({
  messageId: h.message.id,
  threadId: h.thread.id,
  excerpt: h.excerpt,
  sentAt: h.message.sentAt,
  author: h.message.author,
  authorSide: h.message.authorSide,
  matched: h.phrases,
});

const SEV: Severity[] = ["low", "medium", "high", "critical"];
const bump = (s: Severity, n: number): Severity => SEV[Math.max(0, Math.min(3, SEV.indexOf(s) + n))];
const BASE_SEVERITY: Record<SignalCategory, Severity> = {
  dissatisfaction: "medium",
  unresolved_issue: "medium",
  missed_commitment: "medium",
  scope_creep: "medium",
  approval_delay: "medium",
  budget_concern: "medium",
  renewal_risk: "high",
  dependency_risk: "medium",
  expansion_interest: "medium",
  positive_feedback: "low",
};

const COUNTER: Partial<Record<SignalCategory, SignalCategory[]>> = {
  dissatisfaction: ["positive_feedback"],
  unresolved_issue: ["positive_feedback"],
  renewal_risk: ["positive_feedback", "expansion_interest"],
  missed_commitment: ["positive_feedback"],
  positive_feedback: ["dissatisfaction", "unresolved_issue"],
  expansion_interest: ["renewal_risk", "budget_concern"],
};

const ACTION_TEMPLATES: Record<SignalCategory, string> = {
  dissatisfaction: "Owner to call the client sponsor this week, acknowledge the issues and agree a written recovery plan.",
  unresolved_issue: "Assign a named owner and date for the repeated issue; confirm the fix in writing with the client.",
  missed_commitment: "Re-baseline the affected milestone with the client and confirm what is needed to hold the new date.",
  scope_creep: "Review requests against the contract; agree a change order or reprioritize within the included scope.",
  approval_delay: "Escalate to the client decision-maker with a decision date and the impact of further delay.",
  budget_concern: "Review forecast cost to complete and options (descoping, phasing, re-pricing) before the next client conversation.",
  renewal_risk: "Prepare a renewal plan: executive sponsor meeting, value summary and a competitive proposal before the notice date.",
  dependency_risk: "Resolve the dependency owner and date; rebalance capacity or re-sequence dependent work.",
  expansion_interest: "Qualify the need: confirm budget, timing and decision-maker, then propose a scoping session.",
  positive_feedback: "Capture as a reference or case study and share with the delivery team.",
};

export interface EngineOptions {
  asOf: ISODate;
  /** Ignore evidence older than this many days (resolved issues are kept a little longer as history). */
  windowDays?: number;
}

/** Run the engine over a dataset. Review status is merged by the caller. */
export function detectSignals(ds: Dataset, opts: EngineOptions): Omit<Signal, "review" | "newEvidenceSinceReview">[] {
  const asOf = opts.asOf;
  const windowDays = opts.windowDays ?? 120;
  const active: Hit[] = [];
  const resolved: Hit[] = [];
  const resolutions = new Map<ID, Hit[]>(); // key: accountId|category

  for (const thread of ds.threads) {
    if (!thread.accountId) continue;
    const msgs = thread.messages.filter((m) => m.sentAt.slice(0, 10) <= asOf).sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));
    if (!msgs.length) continue;
    const hits = msgs.map((m) => matchMessage(thread, m));

    // Structural rule: repeated client complaints in one thread with no fix in between.
    const complaintIdx = hits.map((h, i) => (h.some((x) => x.category === "dissatisfaction" || x.category === "unresolved_issue") && msgs[i].authorSide === "client" ? i : -1)).filter((i) => i >= 0);
    if (complaintIdx.length >= 2) {
      const first = msgs[complaintIdx[0]];
      const last = msgs[complaintIdx[complaintIdx.length - 1]];
      const fixedBetween = msgs.slice(complaintIdx[0] + 1, complaintIdx[complaintIdx.length - 1]).some(hasResolution);
      if (!fixedBetween && daysBetween(first.sentAt.slice(0, 10), last.sentAt.slice(0, 10)) >= 3 && !hits[complaintIdx[complaintIdx.length - 1]].some((x) => x.category === "unresolved_issue")) {
        hits[complaintIdx[complaintIdx.length - 1]].push({ category: "unresolved_issue", phrases: ["raised repeatedly in thread"], weight: 1.3, message: last, thread, excerpt: excerptFor(last.body, "") });
      }
    }

    // Resolution: the last message that reports a fix, confirmed by the client or followed by no further complaint.
    let resolvedThrough = -1;
    msgs.forEach((m, i) => {
      if (!hasResolution(m)) return;
      const laterComplaint = hits.slice(i + 1).some((h) => h.some((x) => RESOLVABLE.includes(x.category)));
      if (!laterComplaint) resolvedThrough = i;
    });

    hits.forEach((hs, i) => {
      for (const h of hs) {
        const age = daysBetween(h.message.sentAt.slice(0, 10), asOf);
        if (RESOLVABLE.includes(h.category) && i < resolvedThrough) {
          if (age <= windowDays + 60) {
            resolved.push(h);
            const key = `${thread.accountId}|${h.category}`;
            const res = msgs[resolvedThrough];
            const list = resolutions.get(key) ?? [];
            if (!list.some((x) => x.message.id === res.id)) list.push({ category: h.category, phrases: ["resolution"], weight: 0, message: res, thread, excerpt: excerptFor(res.body, RESOLUTION_PHRASES.find((p) => res.body.toLowerCase().includes(p)) ?? "") });
            resolutions.set(key, list);
          }
          continue;
        }
        if (age <= windowDays) active.push(h);
      }
    });
  }

  const accountIds = new Set([...active, ...resolved].map((h) => h.thread.accountId!));
  const out: Omit<Signal, "review" | "newEvidenceSinceReview">[] = [];
  const accountName = (id: ID) => ds.accounts.find((a) => a.id === id)?.name ?? id;

  for (const accountId of accountIds) {
    const account = ds.accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const categories = new Set([...active, ...resolved].filter((h) => h.thread.accountId === accountId).map((h) => h.category));
    for (const category of categories) {
      const ev = active.filter((h) => h.thread.accountId === accountId && h.category === category).sort((a, b) => (a.message.sentAt < b.message.sentAt ? -1 : 1));
      const res = resolved.filter((h) => h.thread.accountId === accountId && h.category === category);
      const score = ev.reduce((s, h) => s + h.weight * Math.pow(0.5, daysBetween(h.message.sentAt.slice(0, 10), asOf) / 30), 0);
      const autoResolved = ev.length === 0 && res.length > 0;
      if (!autoResolved && score < 0.35) continue;

      const evidenceHits = autoResolved ? res : ev;
      const last = evidenceHits[evidenceHits.length - 1];
      const lastDate = last.message.sentAt.slice(0, 10);
      const threads = new Set(evidenceHits.map((h) => h.thread.id));
      const clientMsgs = evidenceHits.filter((h) => h.message.authorSide === "client").length;
      const recentAge = daysBetween(lastDate, asOf);

      // Counter-evidence: opposite-polarity messages from the same account.
      const counterCats = COUNTER[category] ?? [];
      const counter = active.filter((h) => h.thread.accountId === accountId && counterCats.includes(h.category));
      const newerCounter = counter.filter((h) => h.message.sentAt > last.message.sentAt);

      // Detection date: when cumulative (undecayed) evidence first crossed the threshold.
      let cum = 0;
      let detectedOn = lastDate;
      for (const h of evidenceHits) {
        cum += h.weight;
        if (cum >= 1) {
          detectedOn = h.message.sentAt.slice(0, 10);
          break;
        }
      }

      // Confidence (explained, not a probability)
      const internalObserved = ["scope_creep", "budget_concern", "approval_delay", "dependency_risk", "missed_commitment"].includes(category);
      const sourceCount = internalObserved ? evidenceHits.length : clientMsgs;
      let confidence: Confidence = "low";
      if (evidenceHits.length >= 3 && threads.size >= 2 && sourceCount >= 2 && recentAge <= 30) confidence = "high";
      else if (evidenceHits.length >= 2 || (evidenceHits.some((h) => h.weight >= 1.5) && recentAge <= 30)) confidence = "medium";
      const reasons: string[] = [];
      reasons.push(`${evidenceHits.length} relevant message${evidenceHits.length === 1 ? "" : "s"} across ${threads.size} thread${threads.size === 1 ? "" : "s"}`);
      if (!internalObserved) reasons.push(`${clientMsgs} from the client`);
      reasons.push(`most recent ${recentAge} day${recentAge === 1 ? "" : "s"} ago`);
      if (newerCounter.length && !autoResolved) {
        confidence = confidence === "high" ? "medium" : "low";
        reasons.push(`lowered because ${newerCounter.length} newer message${newerCounter.length === 1 ? "" : "s"} point the other way`);
      } else if (counter.length) reasons.push(`${counter.length} contradicting message${counter.length === 1 ? "" : "s"} noted`);
      else reasons.push("no contradicting messages");

      // Severity
      let severity = BASE_SEVERITY[category];
      if (score >= 3.5) severity = bump(severity, 1);
      if (clientMsgs >= 3 && ["dissatisfaction", "unresolved_issue", "renewal_risk"].includes(category)) severity = bump(severity, 1);
      if (recentAge > 45) severity = bump(severity, -1);
      if (autoResolved) severity = "low";

      const polarity = category === "expansion_interest" ? "opportunity" : category === "positive_feedback" ? "positive" : "risk";
      const projectIds = [...new Set(evidenceHits.map((h) => h.thread.projectId).filter(Boolean))] as ID[];
      const projectId = projectIds.length === 1 ? projectIds[0] : undefined;
      const project = projectId ? ds.projects.find((p) => p.id === projectId) : undefined;
      const deliveryCategory = ["missed_commitment", "approval_delay", "dependency_risk", "unresolved_issue"].includes(category);
      const ownerId = deliveryCategory && project ? project.ownerId : account.ownerId;

      const quote = (h: Hit) => `${h.message.author} (${h.message.authorSide === "client" ? "client" : "internal"}, ${h.message.sentAt.slice(0, 10)}): “${h.excerpt}”`;
      const explanationParts = [
        autoResolved
          ? `Raised ${res.length} time${res.length === 1 ? "" : "s"} and later resolved in the same thread.`
          : `${evidenceHits.length} message${evidenceHits.length === 1 ? "" : "s"} between ${evidenceHits[0].message.sentAt.slice(0, 10)} and ${lastDate}, weighted toward recent client statements.`,
        `Latest: ${quote(last)}`,
      ];
      if (res.length && !autoResolved) explanationParts.push(`An earlier instance was resolved; current evidence is newer than that resolution.`);

      const name = accountName(accountId);
      const summaryByCat: Record<SignalCategory, string> = {
        dissatisfaction: `${name} is expressing dissatisfaction`,
        unresolved_issue: `${name} has raised the same issue more than once`,
        missed_commitment: `Commitments to ${name} have slipped`,
        scope_creep: `Unplanned requests are expanding ${name}'s scope`,
        approval_delay: `Work for ${name} is waiting on approval`,
        budget_concern: `Budget pressure mentioned for ${name}`,
        renewal_risk: `${name} is signalling renewal or cancellation risk`,
        dependency_risk: `Delivery for ${name} is at risk from a dependency or capacity constraint`,
        expansion_interest: `${name} has expressed interest in additional work`,
        positive_feedback: `${name} has given positive feedback`,
      };

      out.push({
        id: `sig_${accountId}_${category}`,
        orgId: ds.org.id,
        accountId,
        projectId,
        category,
        polarity,
        severity,
        confidence,
        confidenceReason: reasons.join("; ") + ".",
        detectedOn,
        lastEvidenceOn: lastDate,
        summary: autoResolved ? `Resolved: ${summaryByCat[category].replace(/^(\S)/, (c) => c)}` : summaryByCat[category],
        explanation: explanationParts.join(" "),
        evidence: evidenceHits.map(toEvidence).reverse(),
        counterEvidence: counter.map(toEvidence).reverse(),
        resolutionEvidence: (resolutions.get(`${accountId}|${category}`) ?? []).map(toEvidence),
        autoResolved,
        recommendedAction: autoResolved ? "No action needed. Keep monitoring; reference the resolution if the topic returns." : ACTION_TEMPLATES[category],
        ownerId,
      });
    }
  }

  const sevRank = (s: Severity) => SEV.indexOf(s);
  return out.sort((a, b) => Number(a.autoResolved) - Number(b.autoResolved) || sevRank(b.severity) - sevRank(a.severity) || (a.lastEvidenceOn < b.lastEvidenceOn ? 1 : -1));
}
