import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Not found or not available to your role</h1>
      <p className="mt-2 text-sm text-ink-soft">The record may belong to another profile, or your current role may not have access to it. Records you cannot access are not loaded at all.</p>
      <Link href="/" className="btn btn-primary mt-4">
        Back to overview
      </Link>
    </div>
  );
}
