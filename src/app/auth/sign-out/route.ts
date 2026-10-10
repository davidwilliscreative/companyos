import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/supabase/config";
import { supabaseForRequest } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (AUTH_ENABLED) await (await supabaseForRequest()).auth.signOut();
  const to = new URL("/sign-in", url.origin);
  if (url.searchParams.get("reason") === "not_approved") to.searchParams.set("error", "not_approved");
  return NextResponse.redirect(to);
}
