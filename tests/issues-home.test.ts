import { describe, expect, it } from "vitest";
import type { ProfileId, RoleId } from "@/domain/types";
import { homeFor } from "@/lib/home";
import { interpretAccount, interpretProject } from "@/lib/interpret";
import { fmtPts } from "@/lib/money";
import { buildIssues } from "@/lib/issues";
import { ws } from "./helpers";

const PROFILES: ProfileId[] = ["agency", "saas", "enterprise"];
const ROLES: RoleId[] = ["executive", "finance", "account_owner", "admin"];

describe("issues", () => {
  const exec = ws("agency", "executive");
  const issues = buildIssues(exec);
  const byId = (id: string) => issues.find((i) => i.id === id);

  it("have stable, unique ids", () => {
    const ids = issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildIssues(ws("agency", "executive")).map((i) => i.id)).toEqual(ids);
  });

  it("group Priya's overload with the Harbor & Pine build and the Copperline beta", () => {
    const priya = byId("iss_staff_p_priya")!;
    const parts = priya.parts.map((p) => p.id);
    expect(parts).toEqual(expect.arrayContaining(["att_cap_p_priya", "att_ms_ms_harbor_build", "att_ms_ms_copper_beta"]));
    expect(byId("iss_ms_pr_harbor_web")).toBeUndefined();
    expect(byId("iss_ms_pr_copper_app")).toBeUndefined();
    expect(priya.plans.find((p) => p.relation === "plan")?.actionId).toBe("act_priya_rebalance");
  });

  it("group Verdant's approval delay, slipped launch and overdue plan, keeping collections separate", () => {
    const v = byId("iss_ms_pr_verdant_launch")!;
    expect(v.parts.map((p) => p.id)).toEqual(expect.arrayContaining(["att_ms_ms_verdant_approval", "att_ms_ms_verdant_media"]));
    expect(v.plans[0]).toMatchObject({ actionId: "act_verdant_chase", relation: "plan", overdue: true });
    expect(v.nextUpdateOverdue).toBe(true);
    const ar = byId("iss_ar_a_verdant")!;
    expect(ar.ownerId).toBe("p_marcus");
    expect(ar.plans.every((p) => p.relation === "related")).toBe(true);
    expect(ar.related).toContain(v.id);
    // The overdue action is the plan's state, not an issue of its own.
    expect(issues.some((i) => i.parts.some((p) => p.id === "att_act_act_verdant_chase"))).toBe(false);
  });

  it("never add unlike impacts together", () => {
    for (const i of issues) {
      const labels = i.impacts.map((x) => x.label);
      expect(new Set(labels).size, i.id).toBe(labels.length);
      for (const x of i.impacts) expect(x.basis.length, `${i.id} ${x.label}`).toBeGreaterThan(0);
    }
  });

  it("show percentage-point differences for margins", () => {
    const h = byId("iss_margin_pr_harbor_web")!;
    const gap = h.impacts.find((x) => x.label === "Forecast margin vs target")!;
    expect(gap.value! * 100).toBeCloseTo(-55.1, 1);
  });

  it("separate inferred issues that still need review from recorded facts", () => {
    expect(byId("iss_rel_a_brightwater")!.review.state).toBe("unreviewed");
    expect(byId("iss_staff_p_priya")!.review.state).toBe("recorded");
  });

  for (const profile of PROFILES)
    for (const role of ROLES)
      it(`assign each action as the plan for at most one issue (${profile}/${role})`, () => {
        const counts = new Map<string, number>();
        for (const i of buildIssues(ws(profile, role))) for (const p of i.plans) if (p.relation === "plan") counts.set(p.actionId, (counts.get(p.actionId) ?? 0) + 1);
        for (const [id, n] of counts) expect(n, id).toBe(1);
      });
});

describe("role homes", () => {
  for (const profile of PROFILES)
    for (const role of ROLES)
      it(`${profile}/${role} has a short briefing, up to 4 figures and up to 5 issues`, () => {
        const h = homeFor(ws(profile, role));
        expect(h.briefing.length).toBeGreaterThan(0);
        expect(h.metrics.length).toBeLessThanOrEqual(4);
        expect(h.issues.length).toBeLessThanOrEqual(5);
        expect(h.counts.urgent).toBeGreaterThanOrEqual(h.counts.shownUrgent);
        for (const m of h.metrics) {
          expect(m.scope).toBeTruthy();
          expect(m.period).toBeTruthy();
        }
      });

  it("put different priorities first for each role", () => {
    const first = (role: RoleId) => homeFor(ws("agency", role)).issues[0]?.kind;
    expect(first("executive")).toBe("relationship");
    expect(["collections", "margin"]).toContain(first("finance"));
    expect(first("admin")).toBe("system");
  });

  it("attach incomplete-cost warnings to margin and operating result", () => {
    const h = homeFor(ws("agency", "executive"));
    for (const label of ["Operating result", "Delivery margin"]) expect(h.metrics.find((m) => m.label === label)?.warnings.map((w) => w.label)).toContain("Incomplete costs");
  });

  it("keep money and other clients off restricted homes", () => {
    expect(JSON.stringify(homeFor(ws("agency", "admin")))).not.toMatch(/\$\d/);
    const sofia = ws("agency", "account_owner");
    const others = ws("agency", "executive").data.accounts.filter((a) => !sofia.data.accounts.some((x) => x.id === a.id));
    const text = JSON.stringify(homeFor(sofia));
    for (const a of others) expect(text, a.name).not.toContain(a.name);
  });
});

describe("status by dimension", () => {
  const w = ws("agency", "executive");
  const issues = buildIssues(w);
  const dim = (accountId: string, key: string) => interpretAccount(w, accountId, issues).dimensions.find((d) => d.key === key)!;

  it("shows Brightwater's relationship at risk even though the overall score says watch", () => {
    expect(w.analysis.health.a_brightwater.status).toBe("watch");
    expect(dim("a_brightwater", "relationship").level).toBe("at_risk");
    expect(interpretAccount(w, "a_brightwater", issues).overall).toBe("at_risk");
  });

  it("does not call Harbor & Pine healthy while its project is late and loss-making", () => {
    expect(w.analysis.health.a_harbor.status).toBe("healthy");
    expect(dim("a_harbor", "delivery").level).toBe("at_risk");
    expect(dim("a_harbor", "financial").level).toBe("at_risk");
    expect(dim("a_harbor", "financial").reason).toContain("−55.1 pts");
  });

  it("flags Orchard's overdue invoice in the financial dimension", () => {
    expect(w.analysis.health.a_orchard.status).toBe("healthy");
    expect(dim("a_orchard", "financial").level).toBe("watch");
  });

  it("never reads missing data as healthy", () => {
    expect(dim("a_lumen", "data").level).toBe("at_risk");
    expect(dim("a_lumen", "data").status).toBe("Low");
  });

  it("restricts the financial dimension for the administrator", () => {
    const admin = ws("agency", "admin");
    expect(interpretAccount(admin, "a_harbor", buildIssues(admin)).dimensions.find((d) => d.key === "financial")!.level).toBe("restricted");
    expect(interpretProject(admin, "pr_harbor_web", buildIssues(admin)).dimensions.find((d) => d.key === "financial")!.level).toBe("restricted");
  });

  it("formats margin gaps in percentage points", () => {
    expect(fmtPts(-0.101 - 0.45)).toBe("−55.1 pts");
    expect(fmtPts(0.02)).toBe("+2.0 pts");
  });

  it("treats praise elsewhere as context, not contradiction", () => {
    const s = w.analysis.signals.find((x) => x.id === "sig_a_brightwater_renewal_risk")!;
    expect(s.counterEvidence.some((e) => e.excerpt.includes("Great work") && e.relation === "context")).toBe(true);
    expect(s.confidence).toBe("high");
  });
});
