"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPeriod, setProfile, setRole } from "@/app/actions";
import type { ProfileId, RoleId } from "@/domain/types";

interface Props {
  profile: ProfileId;
  role: RoleId;
  period: string;
  periods: { key: string; label: string }[];
  roleUser: string;
}

export function Switchers({ profile, role, period, periods, roleUser }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <label className="sr-only" htmlFor="sw-profile">Business profile</label>
      <select id="sw-profile" className="input w-auto py-1 text-xs" value={profile} onChange={(e) => run(() => setProfile(e.target.value as ProfileId))}>
        <option value="agency">Profile: Agency</option>
        <option value="saas">Profile: SaaS startup</option>
        <option value="enterprise">Profile: Larger organization</option>
      </select>
      <label className="sr-only" htmlFor="sw-role">Demo role</label>
      <select id="sw-role" className="input w-auto py-1 text-xs" value={role} onChange={(e) => run(() => setRole(e.target.value as RoleId))} title={`Viewing as ${roleUser}. Demo role switcher, not authentication.`}>
        <option value="executive">Role: Executive</option>
        <option value="finance">Role: Finance</option>
        <option value="account_owner">Role: Account owner</option>
        <option value="admin">Role: Administrator</option>
      </select>
      <label className="sr-only" htmlFor="sw-period">Reporting period</label>
      <select id="sw-period" className="input w-auto py-1 text-xs" value={period} onChange={(e) => run(() => setPeriod(e.target.value))}>
        {periods.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
