import fs from "node:fs";
import path from "node:path";
import { emptyState, type DemoState } from "./state";

/**
 * Lightweight persistent store: a single JSON file under `.data/`.
 * Writes are atomic (write temp file, then rename). Swap this for SQLite or
 * Postgres later without touching callers: everything goes through StateStore.
 */
export interface StateStore {
  read(): DemoState;
  write(state: DemoState): void;
  reset(): void;
}

export function createFileStore(file = path.join(process.cwd(), ".data", "demo-state.json")): StateStore {
  // No in-memory cache: Next.js may load this module in several bundles, and the
  // file is small, so reading it per request keeps every bundle consistent.
  return {
    read() {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DemoState;
        return parsed.version === 1 ? parsed : emptyState();
      } catch {
        return emptyState();
      }
    },
    write(state) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
    },
    reset() {
      try {
        fs.unlinkSync(file);
      } catch {
        /* nothing to reset */
      }
    },
  };
}

export function createMemoryStore(initial: DemoState = emptyState()): StateStore {
  let state = structuredClone(initial);
  return {
    read: () => state,
    write: (s) => {
      state = structuredClone(s);
    },
    reset: () => {
      state = emptyState();
    },
  };
}

let singleton: StateStore | null = null;
export function getStore(): StateStore {
  if (!singleton) singleton = createFileStore();
  return singleton;
}
