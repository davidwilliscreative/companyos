"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Action, CurrencyCode, EvidenceLink, Opportunity, ProfileId, ReviewStatus, RoleId, Severity } from "@/domain/types";
import * as m from "@/data/mutations";
import { COOKIE, getRequestContext } from "@/data/session";
import { mutate } from "@/data/load-store";
import { canSwitchRole, getMember } from "@/data/member";
import { supabaseAdmin } from "@/lib/supabase/server";
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
  if (!isRole(role) || !canSwitchRole(await getMember())) return;
  (await cookies()).set(COOKIE.role, role, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setPeriod(period: string) {
  if (!["month", "quarter", "six", "ytd"].includes(period)) return;
  (await cookies()).set(COOKIE.period, period, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function createActionAction(input: { title: string; description?: string; ownerId: string; dueDate: string; severity: Severity; impact?: string; accountId?: string; links: EvidenceLink[]; origin: Action["origin"] }) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.createAction(s, ctx, input)));
}

export async function updateActionAction(id: string, patch: Partial<Pick<Action, "status" | "ownerId" | "dueDate">>, comment?: string) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.updateAction(s, ctx, id, patch, comment)));
}

export async function reviewSignalAction(signalId: string, status: ReviewStatus, note?: string) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.reviewSignal(s, ctx, signalId, status, note)));
}

export async function editOpportunityAction(oppId: string, patch: { estimatedValue?: number | null; nextStep?: string; status?: Opportunity["status"] }) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.editOpportunity(s, ctx, oppId, patch)));
}

export async function applyScenarioAction(projectId: string, inputs: ScenarioInputs, note: string) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.applyScenario(s, ctx, projectId, inputs, note)));
}

export async function clearScenarioAction(projectId: string) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.clearScenario(s, ctx, projectId)));
}

export async function decideMappingAction(mappingId: string, decision: "confirmed" | "rejected") {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.decideMapping(s, ctx, mappingId, decision)));
}

export async function applyImportAction(dataset: SheetDatasetKey, mapping: ColumnMapping) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.applyImport(s, ctx, dataset, mapping)));
}

export async function setCurrencyAction(currency: CurrencyCode) {
  const ctx = await getRequestContext();
  return done(await mutate((s) => m.setReportingCurrency(s, ctx, currency)));
}

export async function resetDemoAction(): Promise<m.Result> {
  const member = await getMember();
  if (member && member.role !== "executive") return { ok: false, error: "Only executives can reset the shared demo data." };
  return done(await mutate((s) => m.resetDemo(s)));
}

/** Executives manage who can sign in. Only acts after checking the caller's own membership. */
async function requireExecutive(): Promise<m.Result | null> {
  const member = await getMember();
  if (!member) return { ok: false, error: "Sign-in is not configured in this copy of the demo." };
  if (member.role !== "executive") return { ok: false, error: "Only executives can manage access." };
  return null;
}

export async function addMemberAction(email: string, role: RoleId, displayName?: string): Promise<m.Result> {
  const denied = await requireExecutive();
  if (denied) return denied;
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email address." };
  if (!isRole(role)) return { ok: false, error: "Choose a role." };
  const me = (await getMember())!;
  const { error } = await supabaseAdmin()
    .from("members")
    .upsert({ email: clean, role, display_name: displayName?.trim() || null, added_by: me.email });
  if (error) return { ok: false, error: error.message };
  return done({ ok: true });
}

export async function removeMemberAction(email: string): Promise<m.Result> {
  const denied = await requireExecutive();
  if (denied) return denied;
  const me = (await getMember())!;
  if (email.toLowerCase() === me.email) return { ok: false, error: "You can't remove your own access." };
  const { error } = await supabaseAdmin().from("members").delete().eq("email", email.toLowerCase());
  if (error) return { ok: false, error: error.message };
  return done({ ok: true });
}
