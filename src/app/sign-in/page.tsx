import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { AUTH_ENABLED, safeNext } from "@/lib/supabase/config";
import { GoogleButton } from "./GoogleButton";

const ERRORS: Record<string, string> = {
  not_approved: "That Google account hasn't been given access. Ask an executive to add your email in Settings.",
  failed: "Sign-in didn't complete. Please try again.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!AUTH_ENABLED) redirect("/");
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">CompanyOS</h1>
        <p className="mt-1 text-sm text-ink-soft">Demo with synthetic data. Sign in with an approved Google account.</p>
        {sp.error && ERRORS[sp.error] && (
          <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {ERRORS[sp.error]}
          </p>
        )}
        <div className="mt-5">
          <GoogleButton next={safeNext(sp.next)} />
        </div>
      </div>
    </main>
  );
}
