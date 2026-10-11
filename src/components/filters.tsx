"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useTransition } from "react";

/** A row of preset views. Each is a plain link, so presets are shareable URLs. */
export function Presets({ label, items }: { label: string; items: { label: string; href: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm no-underline ring-1 ring-inset ${i.active ? "bg-ink text-white ring-ink hover:text-white" : "bg-surface text-ink-soft ring-line hover:text-ink"}`}
        >
          {i.label}
          {i.count !== undefined && <span className={`tabular-nums ${i.active ? "text-white/80" : "text-ink-muted"}`}>{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/**
 * A GET filter form that applies as soon as a select changes. Text inputs
 * apply on Enter. Values left at their default ("all", empty) are dropped from
 * the URL. Without JavaScript the form still submits normally.
 */
export function FilterForm({ label, defaults = {}, children }: { label: string; defaults?: Record<string, string>; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();

  const apply = (form: HTMLFormElement) => {
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      const val = String(v).trim();
      if (val && val !== "all" && val !== defaults[k]) qs.set(k, val);
    }
    const q = qs.toString();
    start(() => router.replace(q ? `${path}?${q}` : path, { scroll: false }));
  };

  return (
    <form
      role="search"
      aria-label={label}
      aria-busy={pending}
      className={`card flex flex-wrap items-end gap-3 p-3 transition-opacity ${pending ? "opacity-70" : ""}`}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) apply(e.currentTarget);
      }}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
