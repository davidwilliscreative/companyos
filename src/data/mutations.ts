import type { Action, ActionComment, CurrencyCode, EvidenceLink, ID, Opportunity, ReviewStatus, Severity } from "@/domain/types";
import { buildSeed } from "@/data/seed";
import { runScenario, type ScenarioInputs } from "@/lib/calc/scenario";
import { previewImport, sheetDatasets, type ColumnMapping, type SheetDatasetKey } from "@/lib/connectors/sheets";
import { convert } from "@/lib/money";
import { canImport, capsFor } from "@/lib/permissions";
import { buildWorkspace, type RequestContext } from "./access";
import { buildRawDataset } from "./dataset";
import { scenarioBaseFor } from "./scenario-base";
import { demoTimestamp, emptyOverlay, type DemoState, type OrgOverlay } from "./state";
import type { StateStore } from "./store";

/**
 * All persistent demo edits go through these functions. Each one checks the
 * role's capabilities against the role-scoped workspace before writing, and
 * records an audit entry.
 */

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

function withOverlay(store: StateStore, ctx: RequestContext, actor: ID, action: string, detail: string, fn: (o: OrgOverlay) => void) {
  const state: DemoState = structuredClone(store.read());
  const overlay = { ...emptyOverlay(), ...(state.orgs[ctx.orgId] ?? {}) };
  fn(overlay);
  state.orgs[ctx.orgId] = overlay;
  state.audit = [...state.audit, { at: new Date().toISOString(), orgId: ctx.orgId, actor, action, detail }].slice(-500);
  store.write(state);
}

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface NewActionInput {
  title: string;
  description?: string;
  ownerId: ID;
  dueDate: string;
  severity: Severity;
  impact?: string;
  accountId?: ID;
  links: EvidenceLink[];
  origin: Action["origin"];
}

export function createAction(store: StateStore, ctx: RequestContext, input: NewActionInput): Result<ID> {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.manageActions) return { ok: false, error: "Your role cannot create actions." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > 200) return { ok: false, error: "Title is too long." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate ?? "")) return { ok: false, error: "Due date must be a valid date." };
  if (!ws.data.people.some((p) => p.id === input.ownerId)) return { ok: false, error: "Owner must be a person in this organization." };
  if (input.accountId && !ws.accountIds.has(input.accountId)) return { ok: false, error: "You don't have access to that account." };
  if (!["low", "medium", "high", "critical"].includes(input.severity)) return { ok: false, error: "Invalid severity." };
  const id = newId("act");
  const action: Action = {
    id,
    orgId: ctx.orgId,
    title,
    description: input.description?.trim().slice(0, 2000) ?? "",
    ownerId: input.ownerId,
    dueDate: input.dueDate,
    status: "open",
    severity: input.severity,
    impact: input.impact?.trim().slice(0, 300) ?? "",
    accountId: input.accountId,
    links: (input.links ?? []).slice(0, 10),
    comments: [],
    createdBy: ws.user.id,
    createdAt: demoTimestamp(ws.org.demoDate),
    origin: input.origin,
  };
  withOverlay(store, ctx, ws.user.id, "action.create", title, (o) => {
    o.actions[id] = action;
  });
  return { ok: true, value: id };
}

export function updateAction(store: StateStore, ctx: RequestContext, id: ID, patch: Partial<Pick<Action, "status" | "ownerId" | "dueDate">>, comment?: string): Result {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.manageActions) return { ok: false, error: "Your role cannot update actions." };
  const current = ws.data.actions.find((a) => a.id === id);
  if (!current) return { ok: false, error: "Action not found." };
  if (patch.status && !["open", "in_progress", "done", "cancelled"].includes(patch.status)) return { ok: false, error: "Invalid status." };
  if (patch.ownerId && !ws.data.people.some((p) => p.id === patch.ownerId)) return { ok: false, error: "Unknown owner." };
  if (patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) return { ok: false, error: "Invalid date." };
  const next: Action = { ...current, ...patch };
  if (comment?.trim()) {
    const c: ActionComment = { id: newId("cm"), authorId: ws.user.id, at: demoTimestamp(ws.org.demoDate), body: comment.trim().slice(0, 2000) };
    next.comments = [...current.comments, c];
  }
  withOverlay(store, ctx, ws.user.id, "action.update", `${current.title}: ${JSON.stringify(patch)}${comment ? " +comment" : ""}`, (o) => {
    o.actions[id] = next;
  });
  return { ok: true };
}

export function reviewSignal(store: StateStore, ctx: RequestContext, signalId: ID, status: ReviewStatus, note?: string): Result {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.reviewSignals) return { ok: false, error: "Your role cannot review signals." };
  const s = ws.analysis.signals.find((x) => x.id === signalId);
  if (!s) return { ok: false, error: "Signal not found or not accessible." };
  if (!["unreviewed", "confirmed", "dismissed", "resolved"].includes(status)) return { ok: false, error: "Invalid status." };
  withOverlay(store, ctx, ws.user.id, "signal.review", `${signalId} → ${status}`, (o) => {
    if (status === "unreviewed") delete o.signalReviews[signalId];
    else o.signalReviews[signalId] = { status, by: ws.user.id, at: demoTimestamp(ws.org.demoDate), note: note?.slice(0, 500), lastEvidenceAtReview: s.lastEvidenceOn };
  });
  return { ok: true };
}

export function editOpportunity(store: StateStore, ctx: RequestContext, oppId: ID, patch: { estimatedValue?: number | null; nextStep?: string; status?: Opportunity["status"] }): Result {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.manageActions) return { ok: false, error: "Your role cannot edit opportunities." };
  const o = ws.analysis.opportunities.find((x) => x.id === oppId);
  if (!o) return { ok: false, error: "Opportunity not found or not accessible." };
  if (patch.estimatedValue !== undefined && patch.estimatedValue !== null && (!Number.isFinite(patch.estimatedValue) || patch.estimatedValue < 0)) return { ok: false, error: "Estimated value must be a positive number." };
  const usd = patch.estimatedValue === undefined || patch.estimatedValue === null ? patch.estimatedValue : convert(patch.estimatedValue, ws.org.reportingCurrency, "USD");
  withOverlay(store, ctx, ws.user.id, "opportunity.edit", `${oppId}: ${JSON.stringify(patch)}`, (ov) => {
    const prev = ov.opportunityEdits[o.signalId] ?? {};
    ov.opportunityEdits[o.signalId] = { ...prev, ...(patch.nextStep !== undefined ? { nextStep: patch.nextStep.slice(0, 300) } : {}), ...(patch.status ? { status: patch.status } : {}), ...(usd !== undefined ? { estimatedValue: usd, estimatedBy: ws.user.id } : {}) };
  });
  return { ok: true };
}

/** Explicitly apply a what-if scenario to a project's forecast inputs. */
export function applyScenario(store: StateStore, ctx: RequestContext, projectId: ID, inputs: ScenarioInputs, note: string): Result {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.applyScenarios) return { ok: false, error: "Only Executive and Finance roles can apply scenarios. You can still explore them." };
  const project = ws.data.projects.find((p) => p.id === projectId);
  const base = project ? scenarioBaseFor(ws, project) : null;
  if (!project || !base) return { ok: false, error: "Scenario cannot be applied to this project." };
  const result = runScenario(base, inputs);
  if (!Number.isFinite(result.forecastCost)) return { ok: false, error: "Scenario produced an invalid result." };
  const cur = ws.org.reportingCurrency;
  withOverlay(store, ctx, ws.user.id, "scenario.apply", `${project.name}: ${note || "no note"}`, (o) => {
    o.projectAdjustments[projectId] = {
      remainingHoursEstimate: Math.max(0, Math.round(inputs.remainingHours)),
      remainingCostRate: convert(result.blendedRemainingRate, cur, "USD"),
      targetMargin: inputs.targetMargin,
      ...(base.billing === "fixed_fee" ? { contractValue: convert(inputs.contractValue, cur, "USD") } : { futureBillRateFactor: 1 + inputs.priceChangePct }),
      appliedAt: new Date().toISOString(),
      appliedBy: ws.user.id,
      note: note.slice(0, 300),
    };
  });
  return { ok: true };
}

export function clearScenario(store: StateStore, ctx: RequestContext, projectId: ID): Result {
  const caps = capsFor(ctx.role);
  if (!caps.applyScenarios) return { ok: false, error: "Your role cannot change applied scenarios." };
  withOverlay(store, ctx, ctx.role, "scenario.clear", projectId, (o) => {
    delete o.projectAdjustments[projectId];
  });
  return { ok: true };
}

export function decideMapping(store: StateStore, ctx: RequestContext, mappingId: ID, decision: "confirmed" | "rejected"): Result {
  const ws = buildWorkspace(ctx, store);
  if (!ws.caps.manageIntegrations) return { ok: false, error: "Only administrators can confirm mappings." };
  if (!ws.data.mappings.some((m) => m.id === mappingId)) return { ok: false, error: "Mapping not found." };
  withOverlay(store, ctx, ws.user.id, "mapping.decide", `${mappingId} → ${decision}`, (o) => {
    o.mappingDecisions[mappingId] = decision;
  });
  return { ok: true };
}

export function applyImport(store: StateStore, ctx: RequestContext, dataset: SheetDatasetKey, mapping: ColumnMapping): Result<{ created: number; updated: number; unchanged: number; rejected: number; duplicates: number }> {
  const caps = capsFor(ctx.role);
  const state = store.read();
  const overlay = { ...emptyOverlay(), ...(state.orgs[ctx.orgId] ?? {}) };
  const raw = buildRawDataset(ctx.profileId, overlay);
  const def = sheetDatasets(buildSeed(ctx.profileId)).find((d) => d.key === dataset);
  if (!def) return { ok: false, error: "Unknown dataset." };
  if (!canImport(caps, def)) return { ok: false, error: def.restricted ? "Compensation imports are restricted to the Finance role." : "Your role cannot run imports." };
  const batch = { id: newId("batch"), at: demoTimestamp(raw.org.demoDate) };
  const preview = previewImport(def, mapping, raw, batch);
  if (preview.mappingErrors.length) return { ok: false, error: preview.mappingErrors.join("; ") };
  const actor = raw.org.demoPersonas[ctx.role];
  withOverlay(store, ctx, actor, "import.apply", `${def.label}: ${JSON.stringify(preview.summary)}`, (o) => {
    const bucket = { ...(o.imports.records[dataset] ?? {}) };
    for (const r of preview.rows) if ((r.action === "create" || r.action === "update") && r.recordId) bucket[r.recordId] = r.record;
    o.imports = {
      batches: [...o.imports.batches, { id: batch.id, dataset: def.label, at: batch.at, by: actor, created: preview.summary.create, updated: preview.summary.update, unchanged: preview.summary.unchanged, rejected: preview.summary.reject, duplicates: preview.summary.duplicate, spreadsheet: def.spreadsheet }],
      records: { ...o.imports.records, [dataset]: bucket },
    };
  });
  return { ok: true, value: { created: preview.summary.create, updated: preview.summary.update, unchanged: preview.summary.unchanged, rejected: preview.summary.reject, duplicates: preview.summary.duplicate } };
}

export function setReportingCurrency(store: StateStore, ctx: RequestContext, currency: CurrencyCode): Result {
  if (!["USD", "EUR", "GBP"].includes(currency)) return { ok: false, error: "Unsupported currency." };
  if (ctx.role === "account_owner") return { ok: false, error: "Your role cannot change organization settings." };
  withOverlay(store, ctx, ctx.role, "settings.currency", currency, (o) => {
    o.settings = { ...o.settings, reportingCurrency: currency };
  });
  return { ok: true };
}

export function resetDemo(store: StateStore): Result {
  store.reset();
  return { ok: true };
}
