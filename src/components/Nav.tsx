"use client";

import { Building2, Calculator, FolderKanban, LayoutDashboard, type LucideIcon, Menu, MessagesSquare, Newspaper, Plug, Radar, Settings, SquareCheckBig, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  hidden?: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/accounts": Building2,
  "/projects": FolderKanban,
  "/finance": Wallet,
  "/team": Users,
  "/signals": Radar,
  "/actions": SquareCheckBig,
  "/briefing": Newspaper,
  "/communications": MessagesSquare,
  "/integrations": Plug,
  "/settings": Settings,
  "/calculations": Calculator,
};

const GROUPS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/", "/briefing", "/actions"] },
  { label: "Business", hrefs: ["/accounts", "/projects", "/finance", "/team"] },
  { label: "Intelligence", hrefs: ["/signals", "/communications"] },
  { label: "Workspace", hrefs: ["/integrations", "/settings", "/calculations"] },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Nav({ items, orgName, profileLabel, controls }: { items: NavItem[]; orgName: string; profileLabel: string; controls?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const byHref = new Map(items.filter((i) => !i.hidden).map((i) => [i.href, i]));

  const list = (
    <div className="space-y-6">
      {GROUPS.map((g) => {
        const groupItems = g.hrefs.map((h) => byHref.get(h)).filter((x): x is NavItem => Boolean(x));
        if (!groupItems.length) return null;
        return (
          <div key={g.label ?? "main"}>
            {g.label && <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-text/60">{g.label}</div>}
            <ul className="space-y-0.5">
              {groupItems.map((i) => {
                const Icon = ICONS[i.href] ?? LayoutDashboard;
                const active = isActive(i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] no-underline transition ${active ? "bg-white/10 font-medium text-white" : "text-sidebar-text hover:bg-white/5 hover:text-white"}`}
                    >
                      <Icon aria-hidden="true" size={17} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-white" : "text-sidebar-text/80 group-hover:text-white"} />
                      <span className="flex-1 truncate">{i.label}</span>
                      {i.badge ? (
                        <span className="min-w-[20px] rounded-full bg-bad px-1.5 py-px text-center text-[10.5px] font-semibold text-white" aria-label={`${i.badge} items`}>
                          {i.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <div aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#7c74ff] to-[#4a43d4] text-[11px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
        OS
      </div>
      <div>
        <div className="text-[14px] font-semibold leading-tight tracking-tight text-white">CompanyOS</div>
        <div className="text-[11px] leading-tight text-sidebar-text/80">Demo · synthetic data</div>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        {brand}
        <button className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((x) => !x)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="sticky top-[60px] z-40 max-h-[calc(100vh-60px)] overflow-y-auto border-t border-sidebar-line bg-sidebar px-3 py-4 lg:hidden">
          {controls && <div className="mb-5">{controls}</div>}
          {list}
        </nav>
      )}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="px-5 pb-5 pt-6">{brand}</div>
        <div className="mx-3 mb-6 rounded-xl border border-sidebar-line bg-white/[0.03] p-2">
          <div className="flex items-center gap-3 px-1.5 py-1.5">
            <div aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-semibold text-white">
              {initials(orgName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-white">{orgName}</div>
              <div className="text-[11px] text-sidebar-text">{profileLabel} profile</div>
            </div>
          </div>
          {controls && <div className="mt-2">{controls}</div>}
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {list}
        </nav>
        <div className="border-t border-sidebar-line px-5 py-4 text-[11px] leading-relaxed text-sidebar-text/80">
          <span className="font-semibold text-sidebar-text">Demo, not production.</span> All data is synthetic. Connectors and the assistant are simulated.
        </div>
      </aside>
    </>
  );
}
