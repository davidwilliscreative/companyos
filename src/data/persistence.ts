import "server-only";
import { PUBLIC_DEMO } from "@/lib/supabase/config";
import { DB_ENABLED } from "@/lib/supabase/server";

/**
 * Where demo edits are saved, in words that match the storage actually in
 * use (see load-store.ts). Edits are never kept only in the browser.
 */
export function persistenceDescription(): { mode: "database" | "public_sandbox" | "local_file"; text: string } {
  if (DB_ENABLED() && PUBLIC_DEMO) return { mode: "public_sandbox", text: "saved to a shared sandbox for this public preview, so anyone using the preview link sees them. They are kept apart from the signed-in members' data" };
  if (DB_ENABLED()) return { mode: "database", text: "saved in the shared database, so everyone with access sees them" };
  return { mode: "local_file", text: "saved on the server running this demo, in .data/demo-state.json, so everyone using this copy of the demo sees them. They are not stored in your browser" };
}
