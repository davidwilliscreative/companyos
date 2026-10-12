import { describe, expect, it } from "vitest";
import type { ProfileId } from "@/domain/types";
import { answerQuestion } from "@/lib/assistant/simulated";
import { homeFor } from "@/lib/home";
import { buildIssues, issuesForRole } from "@/lib/issues";
import { ROLES } from "@/lib/permissions";
import { ws } from "./helpers";

const CREATIVE = ["p_rosa", "p_aisha", "p_leo", "p_nina", "c_ivy", "c_kite"];

describe("department head scope", () => {
  const rosa = ws("agency", "department_head");

  it("is Rosa Delgado, Head of Creative, scoped to Creative", () => {
    expect(rosa.user.id).toBe("p_rosa");
    expect(rosa.departmentName).toBe("Creative");
    expect(rosa.caps.recordScope).toBe("department");
    expect(rosa.scopeNote).toMatch(/Creative: 6 people/);
  });

  it("loads only projects Creative people work on", () => {
    const ids = rosa.data.projects.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["pr_harbor_web", "pr_atlas_ret", "pr_meridian_content", "pr_verdant_launch"]));
    // Engineering-only and operations work is out of scope.
    expect(ids).not.toContain("pr_kestrel_support");
    expect(ids).not.toContain("pr_int_toolkit");
    for (const t of rosa.data.timeEntries) expect(ids).toContain(t.projectId);
  });

  it("lists only Creative people in capacity and bill rates, with no individual cost", () => {
    expect(rosa.analysis.capacity.people.map((p) => p.person.id).sort()).toEqual([...CREATIVE].sort());
    expect(rosa.analysis.capacity.overallocated.map((p) => p.person.id)).not.toContain("p_priya");
    for (const r of rosa.data.billRates) expect(CREATIVE).toContain(r.personId);
    expect(rosa.personCosts).toBeNull();
    expect(JSON.stringify(rosa.department())).not.toMatch(/annualSalary|hourlyCost|costRate/);
  });

  it("reads only conversations about its projects: no account-level or billing threads", () => {
    const threads = rosa.data.threads.map((t) => t.id);
    expect(threads).toContain("th_meridian_articles");
    expect(threads).not.toContain("th_bw_rfp");
    expect(threads).not.toContain("th_verdant_ap");
    expect(threads).not.toContain("th_copper_analytics");
    for (const t of rosa.data.threads) expect(t.projectId && rosa.data.projects.some((p) => p.id === t.projectId)).toBeTruthy();
  });

  it("sees no company finance, cash, opportunities or account-level alerts", () => {
    expect(rosa.finance?.scope).toBe("department");
    expect(rosa.finance?.cash).toBeNull();
    expect(rosa.analysis.opportunities).toHaveLength(0);
    expect(rosa.data.subscriptions).toHaveLength(0);
    for (const i of rosa.analysis.attention) expect(["account", "renewal", "invoice", "opportunity"]).not.toContain(i.kind);
    for (const i of rosa.data.invoices) expect(rosa.data.projects.some((p) => p.id === i.projectId)).toBe(true);
  });

  it("ranks staffing and delivery first and hides collections and system issues", () => {
    const ranked = issuesForRole(buildIssues(rosa), "department_head", rosa.user.id);
    expect(ranked.length).toBeGreaterThan(0);
    for (const i of ranked) expect(["system", "collections", "opportunity", "relationship"]).not.toContain(i.kind);
  });

  it("gets a department scope in the assistant", () => {
    expect(answerQuestion(rosa, { question: "What changed since last week?" }).scope.label).toBe("My department");
    const a = answerQuestion(rosa, { question: "How much does Aisha Rahman earn?" });
    expect(a.answer.join(" ")).toMatch(/can't answer/);
  });
});

describe("department view", () => {
  const d = ws("agency", "department_head").department()!;

  it("reconciles the P&L", () => {
    const p = d.pnl;
    expect(p.contribution).toBeCloseTo(p.revenue - p.directLabor - p.contractors, 6);
    expect(p.result).toBeCloseTo(p.revenue - p.teamPayroll - p.contractors - p.internalContractors, 6);
    expect(p.unabsorbedPayroll).toBeGreaterThan(0);
    expect(p.revenue).toBeGreaterThan(0);
    expect(p.monthly.length).toBe(6);
  });

  it("attributes project revenue by the department's share of hours", () => {
    for (const r of d.projects) {
      if (r.deptShare !== null) expect(r.deptShare).toBeGreaterThanOrEqual(0);
      if (r.deptShare !== null) expect(r.deptShare).toBeLessThanOrEqual(1);
    }
    const content = d.projects.find((r) => r.projectId === "pr_meridian_content")!;
    expect(content.deptShare).toBe(1);
  });

  it("shows retainer hours against the allowance, with Atlas over", () => {
    const atlas = d.retainers.find((r) => r.projectId === "pr_atlas_ret")!;
    expect(atlas.status).toBe("over");
    expect(atlas.last!.hours).toBeGreaterThan(atlas.includedPerMonth);
    expect(atlas.history).toHaveLength(3);
    expect(d.retainers.map((r) => r.projectId)).not.toContain("pr_kestrel_support");
  });

  it("raises creative watchouts with owners and links", () => {
    const ids = d.watchouts.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["wo_waiting_tk_verdant_claims", "wo_unpriced_tk_harbor_gift", "wo_retainer_pr_atlas_ret", "wo_overdue_tk_site_cases"]));
    for (const w of d.watchouts) {
      expect(w.links.length).toBeGreaterThan(0);
      expect(w.ownerId).toBeTruthy();
    }
    // Most severe first.
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < d.watchouts.length; i++) expect(rank[d.watchouts[i].severity]).toBeGreaterThanOrEqual(rank[d.watchouts[i - 1].severity]);
  });

  it("scores feedback only from readable messages, with evidence for each person", () => {
    const rosa = ws("agency", "department_head");
    const readable = new Set(rosa.data.threads.flatMap((t) => t.messages.map((m) => m.id)));
    for (const p of d.people) for (const e of p.feedback.evidence) expect(readable.has(e.messageId)).toBe(true);
    const nina = d.people.find((p) => p.person.id === "p_nina")!;
    expect(nina.feedback.evidence.some((e) => e.messageId === "th_meridian_articles_m1" && e.basis === "named" && e.tone === "concern")).toBe(true);
    const leo = d.people.find((p) => p.person.id === "p_leo")!;
    expect(leo.feedback.score).not.toBeNull();
    // A person with no attributed feedback gets no score rather than a neutral one.
    for (const p of d.people) if (p.feedback.positive + p.feedback.concerns === 0) expect(p.feedback.score).toBeNull();
  });

  it("reports team KPIs with targets", () => {
    const keys = d.kpis.map((k) => k.key);
    expect(keys).toEqual(expect.arrayContaining(["utilization", "contribution", "on_time", "retainer", "feedback", "revisions", "timesheets"]));
    expect(d.kpis.find((k) => k.key === "utilization")!.target).toBe(0.75);
  });
});

describe("department workspace access", () => {
  it("is open to department heads and executives only", () => {
    expect(ws("agency", "executive").department()?.name).toBe("Creative");
    for (const role of ["finance", "account_owner", "admin"] as const) {
      expect(ROLES[role].caps.viewDepartment).toBe("none");
      expect(ws("agency", role).department()).toBeNull();
    }
  });

  it("does not change what other roles see", () => {
    const exec = ws("agency", "executive");
    expect(exec.data.threads.some((t) => t.id === "th_bw_rfp")).toBe(true);
    expect(exec.scopeNote).toBeNull();
  });

  it.each(["agency", "saas", "enterprise"] as ProfileId[])("works in the %s profile", (profile) => {
    const w = ws(profile, "department_head");
    const d = w.department()!;
    expect(d).not.toBeNull();
    expect(d.memberIds).toContain(w.user.id);
    expect(homeFor(w).metrics.length).toBeGreaterThan(0);
    for (const pc of w.analysis.capacity.people) expect(d.memberIds).toContain(pc.person.id);
  });
});
