"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  hidden?: boolean;
}

export function Nav({ items, orgName, profileLabel }: { items: NavItem[]; orgName: string; profileLabel: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const list = (
    <ul className="space-y-0.5">
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(i.href) ? "page" : undefined}
              className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm no-underline hover:no-underline ${isActive(i.href) ? "bg-white font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-soft hover:bg-white/70 hover:text-ink"}`}
            >
              <span>{i.label}</span>
              {i.badge ? <span className="rounded-full bg-bad-soft px-1.5 text-[11px] font-semibold text-bad" aria-label={`${i.badge} items`}>{i.badge}</span> : null}
            </Link>
          </li>
        ))}
    </ul>
  );
  return (
    <>
      <div className="flex items-center justify-between border-b border-line bg-[#f1f1ed] px-4 py-3 lg:hidden">
        <div>
          <div className="text-sm font-semibold">CompanyOS</div>
          <div className="text-xs text-ink-muted">{orgName}</div>
        </div>
        <button className="btn" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((x) => !x)}>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-b border-line bg-[#f1f1ed] p-3 lg:hidden">
          {list}
        </nav>
      )}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-[#f1f1ed] lg:flex">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <div aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-ink text-xs font-bold text-white">OS</div>
            <div>
              <div className="text-sm font-semibold leading-tight">CompanyOS</div>
              <div className="text-[11px] leading-tight text-ink-muted">Demo · synthetic data</div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-line bg-white px-3 py-2">
            <div className="truncate text-sm font-medium">{orgName}</div>
            <div className="text-xs text-ink-muted">{profileLabel} profile</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {list}
        </nav>
        <div className="border-t border-line px-5 py-3 text-[11px] leading-snug text-ink-muted">All data is synthetic. Connectors and the assistant are simulated.</div>
      </aside>
    </>
  );
}
