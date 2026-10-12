import type { ProfileId, RoleId } from "@/domain/types";
import { isRole } from "@/lib/permissions";

/**
 * Shareable entry links: /media_agency opens the app on the media agency profile, and
 * /media_agency/finance also picks the Finance role. Only exact slugs below are matched, so real
 * pages such as /media or /team/rates are never intercepted. The role part follows the usual rule:
 * it applies where the role switcher does (local demo, public preview) and is ignored for signed-in
 * members, whose role comes from their membership.
 */
export const PROFILE_LINKS: Record<ProfileId, string> = {
  agency: "agency",
  cpg_branding: "branding_agency",
  media: "media_agency",
  saas: "saas",
  enterprise: "enterprise",
};

const ALIASES: Record<string, ProfileId> = {
  cpg_agency: "cpg_branding",
  cpg_branding: "cpg_branding",
  cpg_branding_agency: "cpg_branding",
  saas_startup: "saas",
  larger_organization: "enterprise",
};

const SLUGS: Record<string, ProfileId> = { ...ALIASES, ...Object.fromEntries(Object.entries(PROFILE_LINKS).map(([id, slug]) => [slug, id as ProfileId])) };

const norm = (s: string) => decodeURIComponent(s).toLowerCase().replace(/-/g, "_");

/** The profile (and optional role) a path like /media_agency or /media-agency/finance asks for, or null. */
export function parseProfileLink(pathname: string): { profile: ProfileId; role: RoleId | null } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  let first: string, second: string | undefined;
  try {
    [first, second] = parts.map(norm);
  } catch {
    return null;
  }
  const profile = SLUGS[first];
  if (!profile) return null;
  if (second === undefined) return { profile, role: null };
  return isRole(second) ? { profile, role: second } : null;
}
