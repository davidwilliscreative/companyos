import "server-only";
import { DB_ENABLED } from "@/lib/supabase/server";
import { dbRequestStore } from "./store-db";
import { ConflictError, localRequestStore, type RequestStore } from "./store";

/** The database when the server has its Supabase keys, otherwise the local JSON file. */
export async function loadStore(): Promise<RequestStore> {
  return DB_ENABLED() ? dbRequestStore() : localRequestStore();
}

/** Run a mutation against fresh state and save it, retrying if a concurrent save won. */
export async function mutate<T>(fn: (store: RequestStore) => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const store = await loadStore();
    const result = fn(store);
    try {
      await store.flush();
      return result;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 2) throw e;
    }
  }
}
