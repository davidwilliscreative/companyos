/**
 * Sign-in and the shared database turn on only when these are set. Without them the app runs as
 * the local demo: no sign-in, a role switcher, and edits saved to .data/demo-state.json.
 * Both NEXT_PUBLIC_ values are public by design; the secret key is server-only.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Pages reachable without signing in. */
export const PUBLIC_PATHS = ["/sign-in", "/auth"];

/** Only same-site relative paths are allowed as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
