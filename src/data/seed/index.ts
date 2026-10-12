import type { Dataset, ProfileId } from "@/domain/types";
import { buildAgency } from "./agency";
import { buildCpg } from "./cpg";
import { buildMedia } from "./media";
import { buildEnterprise } from "./enterprise";
import { buildSaas } from "./saas";

export const ORG_BY_PROFILE: Record<ProfileId, string> = {
  agency: "org_fieldwork",
  cpg_branding: "org_shelfmark",
  media: "org_tempo",
  saas: "org_relay",
  enterprise: "org_halden",
};

const builders: Record<ProfileId, () => Dataset> = {
  agency: buildAgency,
  cpg_branding: buildCpg,
  media: buildMedia,
  saas: buildSaas,
  enterprise: buildEnterprise,
};

/** Seeds are deterministic; build a fresh copy each time so callers can't mutate shared state. */
export function buildSeed(profile: ProfileId): Dataset {
  return builders[profile]();
}
