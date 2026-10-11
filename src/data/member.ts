import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { RoleId } from "@/domain/types";
import { isRole } from "@/lib/permissions";
import { SIGN_IN_REQUIRED } from "@/lib/supabase/config";
import { supabaseForRequest } from "@/lib/supabase/server";

export interface Member {
  email: string;
  role: RoleId;
  displayName: string | null;
}

/**
 * The signed-in person's membership, or null in the local demo or public preview (no sign-in).
 * Signed-in people without a membership row are signed out: signing in with Google proves who
 * someone is, the members table decides whether they get in and with which role.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  if (!SIGN_IN_REQUIRED) return null;
  const sb = await supabaseForRequest();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) redirect("/sign-in");
  // Row-level security lets a person read only their own membership row.
  const { data } = await sb.from("members").select("email, role, display_name").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!data || !isRole(data.role)) redirect("/auth/sign-out?reason=not_approved");
  return { email: data.email, role: data.role as RoleId, displayName: data.display_name };
});

/** Executives may preview the app as another role; everyone else is fixed to their own. */
export function canSwitchRole(member: Member | null): boolean {
  return !member || member.role === "executive";
}
