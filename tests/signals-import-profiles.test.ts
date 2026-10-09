import { describe, expect, it } from "vitest";
import { buildDataset, buildRawDataset } from "@/data/dataset";
import { applyImport, applyScenario, clearScenario, editOpportunity, resetDemo, reviewSignal } from "@/data/mutations";
import { buildSeed } from "@/data/seed";
import { emptyOverlay, overlayFor } from "@/data/state";
import { getProfile } from "@/domain/profiles";
import { previewImport, sheetDatasets, suggestMapping } from "@/lib/connectors/sheets";
import { detectSignals, looksLikeInstruction } from "@/lib/signals/engine";
import { createMemoryStore, contextFor, ws } from "./helpers";

describe("signals", () => {
  const ds = buildDataset("agency", emptyOverlay());
  const signals = detectSignals(ds, { asOf: ds.org.demoDate });

  it("has one signal per account and category (no duplicates)", () => {
    const keys = signals.map((s) => `${s.accountId}:${s.category}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(signals.map((s) => s.id)).size).toBe(signals.length);
  });
  it("every signal has evidence, explanation, confidence reason and recommended action", () => {
    for (const s of signals) {
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.explanation).toBeTruthy();
      expect(s.confidenceReason).toBeTruthy();
      expect(s.recommendedAction).toBeTruthy();
    }
  });
  it("keeps resolved issues as history (Kestrel outage)", () => {
    const resolved = signals.filter((s) => s.autoResolved);
    expect(resolved.some((s) => s.accountId === "a_kestrel")).toBe(true);
    expect(resolved.every((s) => s.resolutionEvidence.length > 0)).toBe(true);
  });
  it("records contradicting evidence where it exists", () => {
    expect(signals.some((s) => s.counterEvidence.length > 0)).toBe(true);
  });
  it("never turns embedded instructions into a positive signal", () => {
    const lumen = signals.filter((s) => s.accountId === "a_lumen");
    expect(lumen.some((s) => s.polarity === "positive" && s.evidence.some((e) => looksLikeInstruction(e.excerpt)))).toBe(false);
    expect(ds.threads.some((t) => t.messages.some((m) => looksLikeInstruction(m.body)))).toBe(true);
  });
  it("dismissed signals re-surface when new evidence arrives", () => {
    const store = createMemoryStore();
    const ctx = contextFor("agency", "executive");
    const s = ws("agency", "executive", store).analysis.signals.find((x) => x.polarity === "risk" && !x.autoResolved)!;
    expect(reviewSignal(store, ctx, s.id, "dismissed").ok).toBe(true);
    expect(ws("agency", "executive", store).analysis.signals.find((x) => x.id === s.id)!.review.status).toBe("dismissed");
    // Simulate the review having happened before the latest evidence.
    const state = store.read();
    state.orgs[ctx.orgId].signalReviews[s.id].lastEvidenceAtReview = "2026-01-01";
    store.write(state);
    const again = ws("agency", "executive", store).analysis.signals.find((x) => x.id === s.id)!;
    expect(again.review.status).toBe("unreviewed");
    expect(again.newEvidenceSinceReview).toBe(true);
  });
});

describe("Google Sheets import (simulated)", () => {
  const raw = buildRawDataset("agency", emptyOverlay());
  const defs = sheetDatasets(buildSeed("agency"));

  it("compensation is restricted and its validation catches the planted problems", () => {
    const comp = defs.find((d) => d.key === "compensation")!;
    expect(comp.restricted).toBe(true);
    const p = previewImport(comp, suggestMapping(comp), raw, { id: "t", at: "2026-10-05T00:00:00Z" });
    expect(p.summary.reject).toBeGreaterThan(0);
    expect(p.summary.duplicate).toBeGreaterThan(0);
    expect(p.rows.some((r) => r.errors.some((e) => /Unknown person/.test(e)))).toBe(true);
    expect(p.rows.some((r) => r.errors.some((e) => /date/.test(e)))).toBe(true);
  });
  it("reports missing required mappings", () => {
    const def = defs.find((d) => d.key === "billable_rates")!;
    const p = previewImport(def, {}, raw, { id: "t", at: "x" });
    expect(p.mappingErrors.length).toBeGreaterThan(0);
  });
  it.each(sheetDatasets(buildSeed("agency")).map((d) => d.key))("re-importing %s is idempotent", (key) => {
    const store = createMemoryStore();
    const role = key === "compensation" ? "finance" : "finance";
    const ctx = contextFor("agency", role);
    const def = defs.find((d) => d.key === key)!;
    const first = applyImport(store, ctx, key, suggestMapping(def));
    expect(first.ok).toBe(true);
    const second = applyImport(store, ctx, key, suggestMapping(def));
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value!.created).toBe(0);
      expect(second.value!.updated).toBe(0);
    }
    // Record counts do not grow on the second import.
    const after1 = JSON.stringify(overlayFor(store.read(), ctx.orgId).imports.records[key] ?? {});
    applyImport(store, ctx, key, suggestMapping(def));
    expect(JSON.stringify(overlayFor(store.read(), ctx.orgId).imports.records[key] ?? {})).toBe(after1);
  });
  it("importing Omar's compensation fills the missing cost rate", () => {
    const store = createMemoryStore();
    const before = ws("agency", "finance", store).personCosts!["p_omar"];
    expect(before?.hourlyCost ?? null).toBeNull();
    const def = defs.find((d) => d.key === "compensation")!;
    expect(applyImport(store, contextFor("agency", "finance"), "compensation", suggestMapping(def)).ok).toBe(true);
    expect(ws("agency", "finance", store).personCosts!["p_omar"].hourlyCost).toBeGreaterThan(0);
  });
});

describe("scenarios, edits and reset", () => {
  it("exploring changes nothing; applying changes the forecast; clearing restores it", () => {
    const store = createMemoryStore();
    const ctx = contextFor("agency", "executive");
    const before = ws("agency", "executive", store).analysis.projectFin["pr_harbor_web"].margin.forecastAtCompletion!;
    const r = applyScenario(store, ctx, "pr_harbor_web", { contractValue: 185_000, priceChangePct: 0, remainingHours: 340, substituteShare: 0, substituteCostRate: 95, targetMargin: 0.45 }, "test");
    expect(r.ok).toBe(true);
    const after = ws("agency", "executive", store).analysis.projectFin["pr_harbor_web"].margin.forecastAtCompletion!;
    expect(after).toBeGreaterThan(before);
    expect(clearScenario(store, ctx, "pr_harbor_web").ok).toBe(true);
    expect(ws("agency", "executive", store).analysis.projectFin["pr_harbor_web"].margin.forecastAtCompletion).toBeCloseTo(before, 10);
  });
  it("opportunity estimates persist and reset clears everything", () => {
    const store = createMemoryStore();
    const ctx = contextFor("agency", "executive");
    const opp = ws("agency", "executive", store).analysis.opportunities[0];
    expect(editOpportunity(store, ctx, opp.id, { estimatedValue: 50_000 }).ok).toBe(true);
    expect(ws("agency", "executive", store).analysis.opportunities.find((o) => o.id === opp.id)!.estimatedValue).toBeCloseTo(50_000);
    resetDemo(store);
    expect(ws("agency", "executive", store).analysis.opportunities.find((o) => o.id === opp.id)!.estimatedValue).toBe(opp.estimatedValue);
  });
  it("reporting currency converts every figure consistently", () => {
    const usd = ws("agency", "executive");
    const store = createMemoryStore({ version: 1, orgs: { [usd.org.id]: { ...emptyOverlay(), settings: { reportingCurrency: "EUR" } } }, audit: [] });
    const eur = ws("agency", "executive", store);
    expect(eur.org.reportingCurrency).toBe("EUR");
    expect(eur.finance!.summary.earnedRevenue).toBeCloseTo(usd.finance!.summary.earnedRevenue / 1.08, 0);
  });
});

describe("profiles differ meaningfully", () => {
  const a = ws("agency", "executive");
  const s = ws("saas", "executive");
  const e = ws("enterprise", "executive");
  it("terminology and modules", () => {
    expect(new Set([a.profile.terms.accounts, s.profile.terms.accounts, e.profile.terms.accounts]).size).toBe(3);
    expect(getProfile("agency").modules.billableUtilization).toBe(true);
    expect(getProfile("saas").modules.subscriptions).toBe(true);
    expect(getProfile("enterprise").modules.invoices).toBe(false);
  });
  it("finance modes and data", () => {
    expect(a.finance!.cash).not.toBeNull();
    expect(e.finance!.cash).toBeNull();
    expect(s.data.subscriptions.length).toBeGreaterThan(0);
    expect(a.data.subscriptions).toHaveLength(0);
    expect(e.data.projects.every((p) => p.billing === "internal")).toBe(true);
  });
  it("health components differ", () => {
    const keys = (w: typeof a) => Object.values(w.analysis.health)[0].components.map((c) => c.key).join(",");
    expect(new Set([keys(a), keys(s), keys(e)]).size).toBe(3);
  });
  it("seed volume matches the brief", () => {
    expect(a.data.accounts.length).toBe(10);
    expect(a.data.projects.length).toBeGreaterThanOrEqual(18);
    expect(a.data.people.filter((p) => p.type === "employee").length).toBeGreaterThanOrEqual(15);
    expect(a.data.people.some((p) => p.type === "contractor")).toBe(true);
  });
});
