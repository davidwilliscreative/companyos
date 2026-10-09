import "server-only";
import { cookies } from "next/headers";
import type { ProfileId, RoleId } from "@/domain/types";
import type { CashAssumptions } from "@/lib/calc/company";
import { isRole } from "@/lib/permissions";
import { buildWorkspace, contextFor, type RequestContext, type Workspace } from "./access";
import { getStore } from "./store";

export const COOKIE = { profile: "cos_profile", role: "cos_role", period: "cos_period" } as const;

function isProfile(x: unknown): x is ProfileId {
  return x === "agency" || x === "saas" || x === "enterprise";
}

/** Demo session from cookies. This is a role switcher, not authentication. */
export async function getRequestContext(): Promise<RequestContext> {
  const jar = await cookies();
  const profile = jar.get(COOKIE.profile)?.value;
  const role = jar.get(COOKIE.role)?.value;
  const period = jar.get(COOKIE.period)?.value;
  return contextFor(isProfile(profile) ? profile : "agency", isRole(role) ? (role as RoleId) : "executive", period);
}

export async function getWorkspace(opts: { cash?: CashAssumptions } = {}): Promise<Workspace> {
  return buildWorkspace(await getRequestContext(), getStore(), opts);
}
