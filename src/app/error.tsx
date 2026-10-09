"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-soft">{error.message || "An unexpected error occurred while loading this page."}</p>
      <button className="btn btn-primary mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
