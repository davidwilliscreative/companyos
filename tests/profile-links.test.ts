import { describe, expect, it } from "vitest";
import { PROFILES } from "@/domain/profiles";
import { parseProfileLink, PROFILE_LINKS } from "@/lib/profile-links";

describe("profile links", () => {
  it("has one link per profile, each resolving back to it", () => {
    for (const id of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) expect(parseProfileLink(`/${PROFILE_LINKS[id]}`)).toEqual({ profile: id, role: null });
  });

  it("accepts hyphens, case, a trailing slash and an optional role", () => {
    expect(parseProfileLink("/media_agency")).toEqual({ profile: "media", role: null });
    expect(parseProfileLink("/Media-Agency/")).toEqual({ profile: "media", role: null });
    expect(parseProfileLink("/branding_agency/finance")).toEqual({ profile: "cpg_branding", role: "finance" });
    expect(parseProfileLink("/media-agency/account-owner")).toEqual({ profile: "media", role: "account_owner" });
  });

  it("never matches real pages or unknown roles", () => {
    for (const p of ["/", "/media", "/launches", "/projects", "/team/rates", "/accounts/a_harvest", "/settings", "/media_agency/ceo", "/agency/finance/extra", "/%E0%A4%A"]) expect(parseProfileLink(p)).toBeNull();
  });
});
