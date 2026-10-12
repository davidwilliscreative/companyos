import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isProfileId } from "@/domain/profiles";
import type { RoleId } from "@/domain/types";
import type { CashAssumptions } from "@/lib/calc/company";
import { isRole } from "@/lib/permissions";
import { buildWorkspace, contextFor, type RequestContext, type Workspace } from "./access";
import { loadStore } from "./load-store";
import { canSwitchRole, getMember } from "./member";

export const COOKIE = { profile: "cos_profile", role: "cos_role", period: "cos_period" } as const;

/**
 * Profile and period come from cookies. The role comes from the signed-in person's membership when
 * sign-in is configured; only executives may preview another role. In the local demo (no sign-in)
 * the cookie role switcher applies, which is not authentication.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const jar = await cookies();
  const member = await getMember();
  const profile = jar.get(COOKIE.profile)?.value;
  const cookieRole = jar.get(COOKIE.role)?.value;
  const period = jar.get(COOKIE.period)?.value;
  const role: RoleId = canSwitchRole(member) && isRole(cookieRole) ? (cookieRole as RoleId) : (member?.role ?? "executive");
  return contextFor(isProfileId(profile) ? profile : "agency", role, period);
}

/** One read of saved state per request, shared by the layout and the page. */
export const readStore = cache(loadStore);

export async function getWorkspace(opts: { cash?: CashAssumptions } = {}): Promise<Workspace> {
  return buildWorkspace(await getRequestContext(), await readStore(), opts);
}
