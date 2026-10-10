"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (e) {
      setError(e.message);
      setPending(false);
    }
  }
  return (
    <>
      <button className="btn btn-primary w-full justify-center" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google…" : "Sign in with Google"}
      </button>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </>
  );
}
