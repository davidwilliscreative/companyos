import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SIGN_IN_REQUIRED, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Keeps the sign-in session fresh and sends signed-out visitors to /sign-in. Whether a signed-in
 * person is allowed in, and with which role, is decided on the server from the members table
 * (src/data/member.ts). Without Supabase settings, or with PUBLIC_DEMO on, this does nothing.
 */
export async function middleware(request: NextRequest) {
  if (!SIGN_IN_REQUIRED) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser verifies the session with Supabase; nothing should run between creating the client and this.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (user || PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return response;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
