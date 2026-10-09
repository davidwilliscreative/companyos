import { buildWorkspace, contextFor } from "@/data/access";
import { createMemoryStore, type StateStore } from "@/data/store";
import type { ProfileId, RoleId } from "@/domain/types";

export function ws(profile: ProfileId, role: RoleId, store: StateStore = createMemoryStore(), period?: string) {
  return buildWorkspace(contextFor(profile, role, period), store);
}

export { createMemoryStore, contextFor };
