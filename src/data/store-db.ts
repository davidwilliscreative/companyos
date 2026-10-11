import "server-only";
import { PUBLIC_DEMO } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { emptyState, type DemoState } from "./state";
import { ConflictError, type RequestStore } from "./store";

/** Public-preview visitors get their own sandbox row so they never touch the members' state. */
const ROW = PUBLIC_DEMO ? "public" : "demo";

/**
 * Hosted backend: the overlay lives in one row of `app_state` (see supabase/migrations). Saves are
 * conditional on the version that was read, so two people saving at once can't silently overwrite
 * each other; the loser gets a ConflictError and `mutate` retries against the fresh state.
 */
export async function dbRequestStore(): Promise<RequestStore> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("app_state").select("state, version").eq("id", ROW).maybeSingle();
  if (error) throw new Error(`Could not load saved demo state: ${error.message}`);
  const version: number = data?.version ?? 0;
  const loaded = data?.state as DemoState | undefined;
  let state: DemoState = loaded?.version === 1 ? loaded : emptyState();
  let dirty = false;
  return {
    read: () => state,
    write(s) {
      state = structuredClone(s);
      dirty = true;
    },
    reset() {
      state = emptyState();
      dirty = true;
    },
    async flush() {
      if (!dirty) return;
      if (!data) {
        const { error: e } = await db.from("app_state").insert({ id: ROW, state, version: 1 });
        if (e) throw e.code === "23505" ? new ConflictError() : new Error(`Could not save: ${e.message}`);
      } else {
        const { data: rows, error: e } = await db
          .from("app_state")
          .update({ state, version: version + 1, updated_at: new Date().toISOString() })
          .eq("id", ROW)
          .eq("version", version)
          .select("id");
        if (e) throw new Error(`Could not save: ${e.message}`);
        if (!rows?.length) throw new ConflictError();
      }
      dirty = false;
    },
  };
}
