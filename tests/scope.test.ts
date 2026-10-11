import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/assistant/simulated";
import { ws } from "./helpers";

const admin = ws("agency", "admin");

/** Everything the admin role receives, serialized, as a browser or the assistant would see it. */
const adminPayload = JSON.stringify({ data: admin.data, analysis: admin.analysis, changes: admin.changes, sources: admin.sources });

describe("administrator data boundary", () => {
  it("receives no invoices, payments, contract values or compensation", () => {
    expect(admin.data.invoices).toHaveLength(0);
    expect(admin.data.payments).toHaveLength(0);
    expect(admin.data.compensation ?? []).toHaveLength(0);
    expect(admin.finance).toBeNull();
    for (const c of admin.data.contracts ?? []) expect((c as { value?: number }).value ?? null).toBeNull();
    for (const r of admin.analysis.renewals) expect(r.annualValue).toBeNull();
    for (const m of admin.data.milestones) expect((m as { billingAmount?: number | null }).billingAmount ?? null).toBeNull();
  });

  it("gets no money in attention impacts, action text or changes", () => {
    for (const a of admin.analysis.attention) if (a.impact) expect(a.impact.value ?? null).toBeNull();
    expect(adminPayload).not.toMatch(/\$\d/);
  });

  it("gets no message content", () => {
    for (const t of admin.data.threads) expect(t.messages).toHaveLength(0);
  });

  it("still sees which reports are affected by failed sources", () => {
    const acct = admin.sources.find((s) => s.connectorId === "con_accounting");
    expect(acct?.summary).toMatch(/Accounting sync/);
    expect(acct?.affects).toContain("Receivables and collections");
  });

  it("the assistant refuses money questions for the administrator", () => {
    for (const q of ["Which overdue invoices most affect our cash outlook?", "Which projects are forecast to miss their margin targets?", "What is Priya paid?"]) {
      const r = answerQuestion(admin, { question: q });
      expect(JSON.stringify(r)).not.toMatch(/\$\d/);
    }
  });
});

describe("account owner boundary", () => {
  const sofia = ws("agency", "account_owner");
  const own = new Set(sofia.data.accounts.map((a) => a.id));
  it("only receives records for their own accounts", () => {
    expect(sofia.data.accounts.every((a) => a.ownerId === sofia.user.id)).toBe(true);
    for (const i of sofia.data.invoices) expect(own.has(i.accountId)).toBe(true);
    for (const s of sofia.analysis.signals) expect(own.has(s.accountId)).toBe(true);
    expect(sofia.finance?.company ?? null).toBeNull();
  });
});

describe("scoped assistant answers stay in scope", () => {
  const exec = ws("agency", "executive");
  const others = (keep: string) => exec.data.accounts.filter((a) => a.id !== keep).map((a) => a.name);
  const QUESTIONS = ["What are the main risks right now?", "What is blocking delivery, and who owns the next step?", "Are there overdue invoices?", "Who is overloaded right now?", "What changed since last week?", "Is there an expansion opportunity?", "Which renewals are coming up?", "Hello"];

  for (const accountId of ["a_brightwater", "a_harbor", "a_verdant"]) {
    it(`client scope ${accountId} never mentions another client`, () => {
      for (const question of QUESTIONS) {
        const r = answerQuestion(exec, { question, scope: { accountId } });
        expect(r.scope.kind).toBe("account");
        const text = JSON.stringify({ a: r.answer, f: r.figures, e: r.evidence, n: r.notes, u: r.followUps });
        for (const name of others(accountId)) expect(text, `${question} → ${name}`).not.toContain(name);
      }
    });
  }

  it("Brightwater risks do not mention Lumen or suggest Meridian", () => {
    const r = answerQuestion(exec, { question: "What are the main risks right now?", scope: { accountId: "a_brightwater" } });
    const text = JSON.stringify(r);
    expect(text).not.toContain("Lumen");
    expect(text).not.toContain("Meridian");
    expect(r.answer.length).toBeGreaterThan(0);
  });

  it("project scope answers about the project and labels it", () => {
    const r = answerQuestion(exec, { question: "What is blocking this?", scope: { projectId: "pr_harbor_web" } });
    expect(r.scope).toMatchObject({ kind: "project", label: "This project" });
    expect(r.evidence.some((e) => e.type === "project" && e.id === "pr_harbor_web")).toBe(true);
  });

  it("asking about another client inside a client scope is declined", () => {
    const r = answerQuestion(exec, { question: "Why did Meridian's health decline?", scope: { accountId: "a_brightwater" } });
    expect(r.intent).toBe("out_of_scope");
  });

  it("unscoped answers are labeled with the role's broad scope", () => {
    expect(answerQuestion(exec, { question: "What changed since last week?" }).scope.label).toBe("Company-wide");
    expect(answerQuestion(ws("agency", "account_owner"), { question: "What changed since last week?" }).scope.label).toBe("My accounts");
  });

  it("an account owner cannot scope to someone else's account or project", () => {
    const sofia = ws("agency", "account_owner");
    const notMine = exec.data.accounts.find((a) => !sofia.data.accounts.some((x) => x.id === a.id))!;
    expect(answerQuestion(sofia, { question: "Summarize", scope: { accountId: notMine.id } }).intent).toBe("restricted");
    const notMineProject = exec.data.projects.find((p) => !sofia.data.projects.some((x) => x.id === p.id))!;
    expect(answerQuestion(sofia, { question: "Summarize", scope: { projectId: notMineProject.id } }).intent).toBe("restricted");
  });
});
