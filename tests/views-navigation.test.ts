import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProfileId, RoleId } from "@/domain/types";
import { homeFor } from "@/lib/home";
import { buildIssues } from "@/lib/issues";
import { ACCOUNT_VIEWS, accountRows, inAccountView, inProjectView, PROJECT_VIEWS, parseView, projectRows, RENEWAL_WINDOW_DAYS } from "@/lib/views";
import { ws } from "./helpers";

const PROFILES: ProfileId[] = ["agency", "saas", "enterprise"];
const ROLES: RoleId[] = ["executive", "finance", "account_owner", "department_head", "admin"];
const APP = path.join(__dirname, "../src/app/(app)");
const routeExists = (p: string) => fs.existsSync(path.join(APP, p === "/" ? "" : p, "page.tsx"));

describe("navigation", () => {
  const nav = fs.readFileSync(path.join(__dirname, "../src/components/Nav.tsx"), "utf8");
  const groups = nav.slice(nav.indexOf("const GROUPS"), nav.indexOf("];", nav.indexOf("const GROUPS")));
  const hrefs = [...groups.matchAll(/"(\/[a-z/]*)"/g)].map((m) => m[1]);

  it("has the six top-level sections in order", () => {
    const labels = [...groups.matchAll(/label: (null|"[^"]+")/g)].map((m) => m[1]);
    expect(labels).toEqual(["null", '"My work"', '"Clients"', '"Delivery"', '"Finance"', '"Administration"']);
  });

  it("links only to pages that exist", () => {
    expect(hrefs.length).toBeGreaterThan(10);
    for (const h of hrefs) expect(routeExists(h), h).toBe(true);
  });

  it("keeps every older URL working", () => {
    for (const h of ["/briefing", "/actions", "/team", "/finance", "/signals", "/communications", "/integrations", "/integrations/sheets", "/settings", "/calculations", "/accounts", "/projects"]) expect(routeExists(h), h).toBe(true);
    expect(fs.readFileSync(path.join(APP, "briefing/page.tsx"), "utf8")).toContain('redirect("/?view=weekly")');
    expect(fs.readFileSync(path.join(__dirname, "../next.config.mjs"), "utf8")).toContain('destination: "/?view=weekly"');
  });

  for (const profile of PROFILES)
    for (const role of ROLES)
      it(`Home links in ${profile}/${role} go to real pages and known preset views`, () => {
        const h = homeFor(ws(profile, role));
        for (const href of h.metrics.flatMap((m) => [m.href, m.calcHref]).filter((x): x is string => !!x)) {
          const u = new URL(href, "http://x");
          expect(routeExists(u.pathname), href).toBe(true);
          const view = u.searchParams.get("view");
          if (view && u.pathname === "/accounts") expect(ACCOUNT_VIEWS as readonly string[], href).toContain(view);
          if (view && u.pathname === "/projects") expect(PROJECT_VIEWS as readonly string[], href).toContain(view);
        }
      });
});

describe("preset views", () => {
  const exec = ws("agency", "executive");
  const issues = buildIssues(exec);
  const accounts = accountRows(exec, issues);
  const names = (view: (typeof ACCOUNT_VIEWS)[number]) => accounts.filter((r) => inAccountView(r, view, exec.user.id)).map((r) => r.acc.name);

  it("ignores unknown view names", () => {
    expect(parseView(ACCOUNT_VIEWS, "renewals")).toBe("renewals");
    expect(parseView(ACCOUNT_VIEWS, "everything")).toBeNull();
    expect(parseView(PROJECT_VIEWS, ["gaps"])).toBeNull();
  });

  it("lists clients that need attention, including ones with only an open issue", () => {
    expect(names("attention")).toEqual(expect.arrayContaining(["Brightwater Credit Union", "Harbor & Pine Hotels", "Orchard Education"]));
    expect(names("attention")).not.toContain("Kestrel Outdoor");
  });

  it("limits renewals soon to the renewal window", () => {
    expect(names("renewals")).toContain("Brightwater Credit Union");
    expect(names("renewals")).not.toContain("Kestrel Outdoor");
    for (const r of accounts.filter((x) => inAccountView(x, "renewals", exec.user.id))) expect(r.renewalDays!).toBeLessThanOrEqual(RENEWAL_WINDOW_DAYS);
  });

  it("lists overdue collections only where money is overdue", () => {
    for (const r of accounts) expect(inAccountView(r, "overdue", exec.user.id)).toBe(r.overdue > 0);
    expect(names("overdue").length).toBeGreaterThan(0);
  });

  it("shows an account owner only their own clients", () => {
    const sofia = ws("agency", "account_owner");
    const rows = accountRows(sofia, buildIssues(sofia));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(inAccountView(r, "mine", sofia.user.id)).toBe(true);
  });

  it("flags projects needing intervention and staffing gaps from the same issues", () => {
    const projects = projectRows(exec, issues);
    const intervention = projects.filter((r) => inProjectView(r, "intervention", exec.user.id));
    expect(intervention.map((r) => r.p.id)).toContain("pr_harbor_web");
    for (const r of intervention) expect(r.p.status).not.toBe("completed");
    const gaps = new Set(exec.analysis.capacity.gaps.map((g) => g.projectId));
    for (const r of projects) if (gaps.has(r.p.id) && r.p.status !== "completed") expect(inProjectView(r, "gaps", exec.user.id), r.p.name).toBe(true);
  });
});

describe("rates and costs", () => {
  it("gives account owners bill rates but no cost rates, and the administrator neither", () => {
    const owner = ws("agency", "account_owner");
    expect(owner.data.billRates.length).toBeGreaterThan(0);
    expect(owner.personCosts).toBeNull();
    const admin = ws("agency", "admin");
    expect(admin.data.billRates).toHaveLength(0);
    expect(admin.personCosts).toBeNull();
    expect(ws("agency", "finance").personCosts).not.toBeNull();
  });
});

describe("profile wording", () => {
  it("does not offer renewals or collections where the profile has none", () => {
    expect(homeFor(ws("enterprise", "account_owner")).focus).not.toMatch(/renewal/i);
    expect(homeFor(ws("enterprise", "finance")).focus).not.toMatch(/collection|margin/i);
    expect(homeFor(ws("saas", "finance")).focus).not.toMatch(/unbilled|margins/i);
  });

  it("counts budget overruns the same way on Home and in the issue list", () => {
    const w = ws("enterprise", "executive");
    const budgetIssues = buildIssues(w).filter((i) => i.kind === "budget").length;
    const sub = homeFor(w).metrics.find((m) => m.label === "Forecast cost at completion")?.sub ?? "";
    const material = /(\d+) by more than 5%/.exec(sub)?.[1] ?? /(\d+) forecast over budget/.exec(sub)?.[1] ?? "0";
    expect(Number(material)).toBe(budgetIssues);
  });
});

describe("persistence copy", () => {
  it("describes the local file store accurately when no database is configured", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const { persistenceDescription } = await import("@/data/persistence");
    const d = persistenceDescription();
    expect(d.mode).toBe("local_file");
    expect(d.text).toContain(".data/demo-state.json");
    expect(d.text).toMatch(/not stored in your browser/);
  });
});
