import { NextResponse } from "next/server";
import { safeNext } from "@/lib/supabase/config";
import { supabaseForRequest } from "@/lib/supabase/server";

/** Google sends people back here; trade the one-time code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const { error } = await (await supabaseForRequest()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=failed", url.origin));
}
