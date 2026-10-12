import { describe, expect, it } from "vitest";
import { buildDataset } from "@/data/dataset";
import { emptyOverlay } from "@/data/state";
import type { MediaFlight, RetailLaunch } from "@/domain/types";
import { PROFILES } from "@/domain/profiles";
import { launchReadiness } from "@/lib/calc/launch";
import { flightPacing, needsAttention } from "@/lib/calc/media";
import { buildIssues } from "@/lib/issues";
import { ws } from "./helpers";

const flight = (over: Partial<MediaFlight> = {}): MediaFlight => ({
  id: "mf_t",
  orgId: "org_t",
  accountId: "a_t",
  projectId: "pr_t",
  channel: "Paid social",
  platform: "Meta",
  objective: "Conversions",
  start: "2026-09-07",
  end: "2026-11-01",
  budget: 56_000,
  currency: "USD",
  kpi: { metric: "CPA", target: 50 },
  // Four full weeks at 1,000/day: exactly on plan for a 56-day, 56,000 flight.
  weeks: ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map((week) => ({ week, spend: 7_000, conversions: 140, revenue: 0 })),
  ownerId: "p_t",
  source: { system: "seed" },
  ...over,
});

describe("media pacing", () => {
  const asOf = "2026-10-05";

  it("is on pace when spend follows the even plan", () => {
    const p = flightPacing(flight(), asOf);
    expect(p.status).toBe("on_pace");
    expect(p.spent).toBe(28_000);
    expect(p.expected).toBe(28_000);
    expect(p.projected).toBe(56_000);
    expect(p.kpiRecent).toBe(50);
    expect(p.kpiStatus).toBe("on_target");
    expect(needsAttention(p)).toBe(false);
  });

  it("projects the recent run rate and flags overpacing above +5%", () => {
    const f = flight();
    f.weeks[2].spend = 9_000;
    f.weeks[3].spend = 9_000;
    const p = flightPacing(f, asOf);
    // 32,000 spent; last two weeks at 18,000/14 days continue for 28 days: +36,000.
    expect(p.projected).toBeCloseTo(68_000);
    expect(p.status).toBe("over");
    expect(p.summary).toMatch(/21% over budget/);
  });

  it("flags underpacing below −10% and KPI more than 10% behind target", () => {
    const f = flight();
    f.weeks[2] = { ...f.weeks[2], spend: 3_500, conversions: 50 };
    f.weeks[3] = { ...f.weeks[3], spend: 3_500, conversions: 50 };
    const p = flightPacing(f, asOf);
    expect(p.status).toBe("under");
    // CPA over the last four weeks = 21,000 / 380 = 55.26, 10.5% worse than 50.
    expect(p.kpiStatus).toBe("behind");
    expect(needsAttention(p)).toBe(true);
  });

  it("does not judge a flight without recent reporting, or one that has not started", () => {
    expect(flightPacing(flight({ weeks: flight().weeks.slice(0, 1) }), asOf).status).toBe("no_data");
    expect(flightPacing(flight({ start: "2026-10-19", weeks: [] }), asOf).status).toBe("not_started");
  });

  it("measures ROAS as revenue over spend", () => {
    const f = flight({ kpi: { metric: "ROAS", target: 4 } });
    for (const w of f.weeks) w.revenue = 21_000;
    const p = flightPacing(f, asOf);
    expect(p.kpiRecent).toBe(3);
    expect(p.kpiStatus).toBe("behind");
  });
});

describe("retail launch readiness", () => {
  const ds = buildDataset("cpg_branding", emptyOverlay());
  const harvest = ds.retailLaunches.find((l) => l.id === "lc_harvest_bowls")!;

  it("compares the artwork release forecast with the print deadline", () => {
    const r = launchReadiness(ds, harvest);
    // Shelf Jan 11 2027 − 10 weeks = files due Nov 2; release forecast Nov 6.
    expect(r.filesDue).toBe("2026-11-02");
    expect(r.forecastRelease).toBe("2026-11-06");
    expect(r.bufferDays).toBe(-4);
    expect(r.status).toBe("at_risk");
  });

  it("treats a launch with more lead time as on track, and a past shelf date as on shelf", () => {
    const later: RetailLaunch = { ...harvest, shelfDate: "2027-02-15" };
    expect(launchReadiness(ds, later).status).toBe("on_track");
    expect(launchReadiness(ds, { ...harvest, shelfDate: "2026-09-01" }).status).toBe("on_shelf");
  });

  it("covers every status in the seed", () => {
    const statuses = ds.retailLaunches.map((l) => launchReadiness(ds, l).status);
    expect(new Set(statuses)).toEqual(new Set(["at_risk", "tight", "on_track", "released", "on_shelf"]));
  });
});

describe("CPG branding profile (Shelfmark Studio)", () => {
  const exec = ws("cpg_branding", "executive");
  const issues = buildIssues(exec);
  const byId = (id: string) => issues.find((i) => i.id === id);

  it("has its own organization, terminology and module", () => {
    expect(exec.org.name).toBe("Shelfmark Studio");
    expect(PROFILES.cpg_branding.terms.accounts).toBe("Brand clients");
    expect(exec.profile.modules.retailLaunches).toBe(true);
    expect(exec.profile.modules.mediaPacing).toBe(false);
    expect(exec.data.mediaFlights).toEqual([]);
  });

  it("raises the at-risk shelf date as a delivery issue with its print deadline", () => {
    const i = byId("iss_ms_pr_harvest_bowls")!;
    expect(i.kind).toBe("delivery");
    expect(i.severity).toBe("high");
    expect(i.title).toMatch(/Target and Kroger shelf date .* is at risk/);
    expect(byId("iss_ms_pr_gold_launch")?.title).toMatch(/little room left/);
  });

  it("surfaces the seeded scenarios", () => {
    expect(byId("iss_rel_a_northfork")?.severity).toBe("critical");
    expect(byId("iss_staff_p_tess")).toBeDefined();
    expect(byId("iss_opp_a_fizzwell")).toBeDefined();
    expect(byId("iss_data_a_juniper")).toBeDefined();
  });

  it("lowers delivery health for a launch at risk", () => {
    const h = exec.analysis.health.a_harvest;
    const delivery = h.components.find((c) => c.key === "delivery")!;
    expect(delivery.factors.some((f) => /shelf|print/i.test(f.label))).toBe(true);
  });
});

describe("media profile (Tempo Collective)", () => {
  const exec = ws("media", "executive");
  const issues = buildIssues(exec);
  const byId = (id: string) => issues.find((i) => i.id === id);

  it("has its own organization, terminology and module", () => {
    expect(exec.org.name).toBe("Tempo Collective");
    expect(PROFILES.media.terms.projects).toBe("Engagements");
    expect(exec.profile.modules.mediaPacing).toBe(true);
    expect(exec.data.retailLaunches).toEqual([]);
    expect(exec.data.mediaFlights.length).toBe(18);
  });

  it("groups flights needing action into one media issue per engagement", () => {
    const crest = byId("iss_media_pr_crest_ret")!;
    expect(crest.kind).toBe("media");
    expect(crest.title).toMatch(/LinkedIn.*overpacing/);
    expect(byId("iss_media_pr_kin_launch")?.title).toMatch(/2 media flights need action/);
    expect(byId("iss_media_pr_northstar_media")?.title).toMatch(/no spend reported since Aug/);
  });

  it("adds a media performance health component only for clients with flights", () => {
    const withFlights = exec.analysis.health.a_crestline.components.map((c) => c.key);
    expect(withFlights).toContain("media");
    const ids = new Set(exec.data.mediaFlights.map((f) => f.accountId));
    const without = exec.data.accounts.find((a) => !ids.has(a.id));
    if (without) expect(exec.analysis.health[without.id].components.map((c) => c.key)).not.toContain("media");
  });

  it("limits client media spend to roles with commercial terms, and an account owner to their clients", () => {
    const admin = ws("media", "admin");
    expect(admin.data.mediaFlights).toEqual([]);
    expect(admin.analysis.media).toEqual({});
    const owner = ws("media", "account_owner");
    const mine = new Set(owner.data.accounts.map((a) => a.id));
    expect(owner.data.mediaFlights.length).toBeGreaterThan(0);
    expect(owner.data.mediaFlights.length).toBeLessThan(18);
    for (const f of owner.data.mediaFlights) expect(mine.has(f.accountId)).toBe(true);
  });
});
