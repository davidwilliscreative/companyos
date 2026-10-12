import { describe, expect, it } from "vitest";
import { applyImport, applyScenario, createAction, reviewSignal } from "@/data/mutations";
import { answerQuestion } from "@/lib/assistant/simulated";
import { serializeForModel } from "@/lib/assistant/retrieval";
import { createMemoryStore, contextFor, ws } from "./helpers";

describe("compensation is removed in the data layer", () => {
  it("executive and finance see compensation", () => {
    expect(ws("agency", "executive").compensation?.length).toBeGreaterThan(0);
    expect(ws("agency", "finance").personCosts).not.toBeNull();
  });
  it.each(["account_owner", "department_head", "admin"] as const)("%s receives no compensation records or cost rates", (role) => {
    const w = ws("agency", role);
    expect(w.compensation).toBeNull();
    expect(w.data.compensation).toHaveLength(0);
    expect(w.personCosts).toBeNull();
    expect(JSON.stringify(w.data)).not.toMatch(/annualSalary/);
  });
  it("admin sees no project costs or company finance", () => {
    const w = ws("agency", "admin");
    expect(Object.keys(w.analysis.projectFin)).toHaveLength(0);
    expect(w.finance).toBeNull();
    expect(w.data.expenses).toHaveLength(0);
  });
});

describe("record scoping", () => {
  it("account owner only loads their own accounts and related records", () => {
    const w = ws("agency", "account_owner");
    expect(w.data.accounts.length).toBeGreaterThan(0);
    expect(w.data.accounts.every((a) => a.ownerId === w.user.id)).toBe(true);
    const ids = new Set(w.data.accounts.map((a) => a.id));
    expect(w.data.invoices.every((i) => ids.has(i.accountId))).toBe(true);
    expect(w.data.threads.every((t) => t.accountId && ids.has(t.accountId))).toBe(true);
    expect(w.analysis.signals.every((s) => ids.has(s.accountId))).toBe(true);
    expect(Object.keys(w.analysis.health).every((id) => ids.has(id))).toBe(true);
    expect(w.finance?.scope).toBe("own_accounts");
    expect(Number.isNaN(w.finance!.summary.payroll)).toBe(true);
    expect(w.finance?.cash).toBeNull();
  });
  it("planning data hides other accounts' project names", () => {
    const w = ws("agency", "account_owner");
    const foreign = w.planning.projects.filter((p) => !w.data.projects.some((x) => x.id === p.id));
    expect(foreign.length).toBeGreaterThan(0);
    expect(foreign.every((p) => p.name === "Other work" && !p.accountId)).toBe(true);
  });
  it("finance sees billing threads only; admin sees none", () => {
    expect(ws("agency", "finance").data.threads.every((t) => t.tags.includes("billing"))).toBe(true);
    expect(ws("agency", "admin").data.threads).toHaveLength(0);
  });
  it("signal evidence from unreadable threads is redacted", () => {
    const w = ws("agency", "admin");
    expect(w.analysis.signals.length).toBeGreaterThan(0);
    expect(w.analysis.signals.flatMap((s) => s.evidence).every((e) => e.excerpt === "Content restricted for your role")).toBe(true);
  });
  it("organizations are isolated", () => {
    const a = ws("agency", "executive");
    const s = ws("saas", "executive");
    expect(a.org.id).not.toBe(s.org.id);
    expect(a.data.accounts.some((x) => s.data.accounts.some((y) => y.id === x.id))).toBe(false);
  });
});

describe("mutations enforce capabilities", () => {
  it("admin cannot create actions; account owner cannot apply scenarios", () => {
    const store = createMemoryStore();
    const r1 = createAction(store, contextFor("agency", "admin"), { title: "x", ownerId: "p_dana", dueDate: "2026-10-10", severity: "low", links: [], origin: "user" });
    expect(r1.ok).toBe(false);
    const owner = ws("agency", "account_owner", store);
    const proj = owner.data.projects.find((p) => p.billing === "fixed_fee" && p.status !== "completed") ?? owner.data.projects[0];
    const r2 = applyScenario(store, contextFor("agency", "account_owner"), proj.id, { contractValue: 1, priceChangePct: 0, remainingHours: 1, substituteShare: 0, substituteCostRate: 0, targetMargin: 0.4 }, "");
    expect(r2.ok).toBe(false);
  });
  it("account owner cannot act on other owners' accounts", () => {
    const store = createMemoryStore();
    const r = createAction(store, contextFor("agency", "account_owner"), { title: "x", ownerId: "p_dana", dueDate: "2026-10-10", severity: "low", accountId: "a_meridian", links: [], origin: "user" });
    expect(r.ok).toBe(false);
  });
  it("finance cannot review signals; admin cannot import compensation", () => {
    const store = createMemoryStore();
    const sig = ws("agency", "executive", store).analysis.signals[0];
    expect(reviewSignal(store, contextFor("agency", "finance"), sig.id, "dismissed").ok).toBe(false);
    expect(applyImport(store, contextFor("agency", "admin"), "compensation", {}).ok).toBe(false);
  });
});

describe("assistant respects permissions", () => {
  it("refuses compensation questions for account owners", () => {
    const a = answerQuestion(ws("agency", "account_owner"), { question: "How much does Priya Shah earn?" });
    expect(["compensation", "restricted"]).toContain(a.intent);
    expect(a.answer.join(" ")).not.toMatch(/\$\d/);
    expect(a.figures).toHaveLength(0);
  });
  it("does not reveal accounts outside the owner's scope", () => {
    const a = answerQuestion(ws("agency", "account_owner"), { question: "How is Meridian Health Partners doing?" });
    expect(a.insufficient).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/Meridian Health Partners/);
  });
  it("account-scoped assistant refuses other accounts", () => {
    const a = answerQuestion(ws("agency", "executive"), { question: "What about Verdant Foods?", scope: { accountId: "a_harbor" } });
    expect(a.intent).toBe("out_of_scope");
  });
  it("model serialization contains only scoped records and wraps messages as untrusted", () => {
    const w = ws("agency", "account_owner");
    const s = serializeForModel(w, [...w.accountIds, "a_meridian"]);
    expect(s).not.toMatch(/Meridian/);
    if (w.data.threads.length) expect(s).toMatch(/untrusted_message/);
  });
});
