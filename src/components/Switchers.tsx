"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPeriod, setProfile, setRole } from "@/app/actions";
import { PROFILES } from "@/domain/profiles";
import type { ProfileId, RoleId } from "@/domain/types";

interface Props {
  profile: ProfileId;
  role: RoleId;
  period: string;
  periods: { key: string; label: string }[];
  roleUser: string;
  canSwitchRole: boolean;
  /** Which controls to render; defaults to all three. */
  show?: ("profile" | "role" | "period")[];
  /** Sidebar variant: stacked, dark. */
  variant?: "header" | "sidebar";
}

export function Switchers({ profile, role, period, periods, roleUser, canSwitchRole, show = ["profile", "role", "period"], variant = "header" }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  const cls = variant === "sidebar" ? "h-9 w-full cursor-pointer rounded-lg border border-sidebar-line bg-sidebar-soft py-0 pl-3 pr-8 text-xs font-medium text-white focus:border-accent focus:outline-none [&>option]:text-ink" : "input h-9 w-auto cursor-pointer rounded-full py-0 pl-3 pr-8 text-xs font-medium";
  return (
    <div className={`${variant === "sidebar" ? "grid gap-2" : "flex flex-wrap items-center gap-2"} ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      {show.includes("profile") && <label className="contents"><span className="sr-only">Business profile</span><select className={cls} value={profile} onChange={(e) => run(() => setProfile(e.target.value as ProfileId))}>
        {Object.values(PROFILES).map((p) => (
          <option key={p.id} value={p.id}>
            Profile: {p.label}
          </option>
        ))}
      </select></label>}
      {canSwitchRole && show.includes("role") && <label className="contents"><span className="sr-only">Demo role</span><select className={cls} value={role} onChange={(e) => run(() => setRole(e.target.value as RoleId))} title={`Viewing as ${roleUser}. Preview of what this role can see.`}>
        <option value="executive">Role: Executive</option>
        <option value="finance">Role: Finance</option>
        <option value="account_owner">Role: Account owner</option>
        <option value="department_head">Role: Department head</option>
        <option value="admin">Role: Administrator</option>
      </select></label>}
      {show.includes("period") && <label className="contents"><span className="sr-only">Reporting period</span><select className={cls} value={period} onChange={(e) => run(() => setPeriod(e.target.value))}>
        {periods.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select></label>}
    </div>
  );
}
