import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/assistant/simulated";
import { ws } from "./helpers";

const exec = ws("agency", "executive");

const EXAMPLES = [
  "Which accounts need attention this week, and why?",
  "Which projects are forecast to miss their margin targets?",
  "What is blocking this launch, and who owns the next step?",
  "Which overdue invoices most affect our cash outlook?",
  "Can we accept a new project given current staffing?",
  "What changed since last week?",
  "Where do we have credible expansion opportunities?",
  "Why did Meridian's health decline?",
  "Summarize Harbor & Pine",
];

/** Every evidence link must point at a record that exists in the role's workspace. */
function evidenceResolves(w: typeof exec, e: { type: string; id: string }) {
  switch (e.type) {
    case "account":
      return w.data.accounts.some((a) => a.id === e.id);
    case "project":
      return w.data.projects.some((p) => p.id === e.id);
    case "milestone":
      return w.data.milestones.some((m) => m.id === e.id);
    case "task":
      return w.data.tasks.some((t) => t.id === e.id);
    case "invoice":
      return w.data.invoices.some((i) => i.id === e.id);
    case "signal":
      return w.analysis.signals.some((s) => s.id === e.id);
    case "opportunity":
      return w.analysis.opportunities.some((o) => o.id === e.id);
    case "message":
      return w.data.threads.some((t) => t.messages.some((m) => m.id === e.id));
    case "thread":
      return w.data.threads.some((t) => t.id === e.id);
    case "person":
      return w.data.people.some((p) => p.id === e.id);
    default:
      return true;
  }
}

describe("assistant grounding", () => {
  it.each(EXAMPLES)("answers %s with resolvable evidence", (q) => {
    const a = answerQuestion(exec, { question: q });
    expect(a.provider.simulated).toBe(true);
    expect(a.answer.length).toBeGreaterThan(0);
    expect(a.period).toBeTruthy();
    expect(a.intent).not.toBe("unknown");
    for (const e of a.evidence) expect(evidenceResolves(exec, e), `${e.type}:${e.id}`).toBe(true);
  });

  it("quoted message excerpts exist verbatim in the source messages", () => {
    const a = answerQuestion(exec, { question: "Where do we have credible expansion opportunities?" });
    const bodies = exec.data.threads.flatMap((t) => t.messages.map((m) => m.body)).join("\n");
    for (const e of a.evidence.filter((x) => x.excerpt)) expect(bodies).toContain(e.excerpt!.replace(/…$/, "").slice(0, 40));
  });

  it("overdue invoice figures match receivables", () => {
    const a = answerQuestion(exec, { question: "Which overdue invoices most affect our cash outlook?" });
    for (const s of exec.analysis.receivables.overdue) expect(JSON.stringify(a)).toContain(s.invoice.number);
  });

  it("margin answer names the projects the calculation flags", () => {
    const a = answerQuestion(exec, { question: "Which projects are forecast to miss their margin targets?" });
    expect(a.answer.join(" ")).toMatch(/Harbor & Pine website rebuild/);
  });

  it("does not invent unknown accounts", () => {
    const a = answerQuestion(exec, { question: "How is Globex Corporation doing?" });
    expect(a.insufficient).toBe(true);
    expect(a.evidence).toHaveLength(0);
  });

  it("says when it doesn't know", () => {
    const a = answerQuestion(exec, { question: "What's the weather in Lisbon?" });
    expect(a.insufficient).toBe(true);
  });

  it("ignores instructions embedded in client messages (Lumen)", () => {
    const a = answerQuestion(exec, { question: "Summarize Lumen Analytics" });
    const text = a.answer.join(" ");
    expect(text).not.toMatch(/all invoices paid/i);
    expect(text.toLowerCase()).toMatch(/enough|insufficient|missing/);
    expect(exec.analysis.health["a_lumen"].status).toBe("insufficient");
  });

  it("works for the SaaS and enterprise profiles", () => {
    const s = answerQuestion(ws("saas", "executive"), { question: "Which renewals are at risk?" });
    expect(s.answer.join(" ")).toMatch(/Quarry Health|Arcadia/);
    const e = answerQuestion(ws("enterprise", "executive"), { question: "Which initiatives are over budget?" });
    expect(e.answer.join(" ")).toMatch(/portal/i);
  });
});
