import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/** Acts as the signed-in person (publishable key + their session cookie). */
export async function supabaseForRequest() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Server components can't set cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/**
 * Server-only client with the secret key. It bypasses row-level security, so it is used only after
 * the app has checked who is asking, and never imported into browser code.
 */
export function supabaseAdmin(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secret) throw new Error("SUPABASE_SECRET_KEY is not set on the server, so Opsight can't reach its database.");
  if (!admin) admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export const DB_ENABLED = () => Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
