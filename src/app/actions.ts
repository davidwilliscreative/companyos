"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Action, CurrencyCode, EvidenceLink, Opportunity, ProfileId, ReviewStatus, RoleId, Severity } from "@/domain/types";
import * as m from "@/data/mutations";
import { COOKIE, getRequestContext } from "@/data/session";
import { getStore } from "@/data/store";
import type { ScenarioInputs } from "@/lib/calc/scenario";
import type { ColumnMapping, SheetDatasetKey } from "@/lib/connectors/sheets";
import { isRole } from "@/lib/permissions";

const YEAR = 60 * 60 * 24 * 365;

function done<T extends m.Result<unknown>>(r: T): T {
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function setProfile(profile: ProfileId) {
  if (!["agency", "saas", "enterprise"].includes(profile)) return;
  (await cookies()).set(COOKIE.profile, profile, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setRole(role: RoleId) {
  if (!isRole(role)) return;
  (await cookies()).set(COOKIE.role, role, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setPeriod(period: string) {
  if (!["month", "quarter", "six", "ytd"].includes(period)) return;
  (await cookies()).set(COOKIE.period, period, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function createActionAction(input: { title: string; description?: string; ownerId: string; dueDate: string; severity: Severity; impact?: string; accountId?: string; links: EvidenceLink[]; origin: Action["origin"] }) {
  return done(m.createAction(getStore(), await getRequestContext(), input));
}

export async function updateActionAction(id: string, patch: Partial<Pick<Action, "status" | "ownerId" | "dueDate">>, comment?: string) {
  return done(m.updateAction(getStore(), await getRequestContext(), id, patch, comment));
}

export async function reviewSignalAction(signalId: string, status: ReviewStatus, note?: string) {
  return done(m.reviewSignal(getStore(), await getRequestContext(), signalId, status, note));
}

export async function editOpportunityAction(oppId: string, patch: { estimatedValue?: number | null; nextStep?: string; status?: Opportunity["status"] }) {
  return done(m.editOpportunity(getStore(), await getRequestContext(), oppId, patch));
}

export async function applyScenarioAction(projectId: string, inputs: ScenarioInputs, note: string) {
  return done(m.applyScenario(getStore(), await getRequestContext(), projectId, inputs, note));
}

export async function clearScenarioAction(projectId: string) {
  return done(m.clearScenario(getStore(), await getRequestContext(), projectId));
}

export async function decideMappingAction(mappingId: string, decision: "confirmed" | "rejected") {
  return done(m.decideMapping(getStore(), await getRequestContext(), mappingId, decision));
}

export async function applyImportAction(dataset: SheetDatasetKey, mapping: ColumnMapping) {
  return done(m.applyImport(getStore(), await getRequestContext(), dataset, mapping));
}

export async function setCurrencyAction(currency: CurrencyCode) {
  return done(m.setReportingCurrency(getStore(), await getRequestContext(), currency));
}

export async function resetDemoAction() {
  return done(m.resetDemo(getStore()));
}
