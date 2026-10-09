import type { Dataset, ID, ISODate, Person } from "@/domain/types";
import { addDays, maxDate, minDate, mondaysBetween } from "@/lib/dates";
import { projectFinancials, utilization } from "./finance";
import { indexOf } from "./index";

const NON_DELIVERY_ROLES = ["Executive", "Finance", "Operations", "Account management", "Customer success", "Unit lead"];

export function isDeliveryRole(p: Person): boolean {
  return !NON_DELIVERY_ROLES.includes(p.role);
}

function weeklyCapacity(ds: Dataset, p: Person): number {
  return ds.org.hoursPerWeek * p.fte;
}

function timeOffHours(ds: Dataset, personId: ID, start: ISODate, end: ISODate): number {
  return ds.timeOff.filter((t) => t.personId === personId && t.start <= end && t.end >= start).reduce((s, t) => s + t.hours, 0);
}

function activeWeeks(p: Person, start: ISODate, end: ISODate): ISODate[] {
  const s = maxDate(start, p.startDate);
  const e = p.endDate ? minDate(end, p.endDate) : end;
  return s > e ? [] : mondaysBetween(s, e);
}

export function plannedHoursForWeek(ds: Dataset, personId: ID, week: ISODate): { total: number; byProject: { projectId: ID; hours: number }[] } {
  const byProject: { projectId: ID; hours: number }[] = [];
  for (const p of ds.projects) {
    if (p.status === "completed" && (p.completedOn ?? p.currentEndDate) < week) continue;
    for (const a of p.assignments) if (a.personId === personId && a.from <= addDays(week, 6) && a.to >= week) byProject.push({ projectId: p.id, hours: a.hoursPerWeek });
  }
  return { total: byProject.reduce((s, x) => s + x.hours, 0), byProject };
}

export interface PersonCapacity {
  person: Person;
  delivery: boolean;
  weeklyCapacity: number;
  period: { available: number; actual: number; billable: number; utilization: number | null; timeOff: number; missingWeeks: ISODate[] };
  upcoming: { weeks: { week: ISODate; planned: number; pct: number }[]; avgPct: number; peakPct: number; overallocatedWeeks: number };
  projects: { projectId: ID; hoursPerWeek: number; to: ISODate }[];
}

export function personCapacity(ds: Dataset, person: Person, start: ISODate, end: ISODate, horizonWeeks = 8): PersonCapacity {
  const idx = indexOf(ds);
  const cap = weeklyCapacity(ds, person);
  const weeks = activeWeeks(person, start, end);
  const off = timeOffHours(ds, person.id, start, end);
  const available = Math.max(0, weeks.length * cap - off);
  const entries = (idx.entriesByPerson.get(person.id) ?? []).filter((e) => e.date >= start && e.date <= end);
  const actual = entries.reduce((s, e) => s + e.hours, 0);
  const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
  // Weeks where the person was planned on work, not on leave, yet recorded nothing.
  const missingWeeks = weeks.filter((w) => {
    if (w > ds.org.demoDate) return false;
    const planned = plannedHoursForWeek(ds, person.id, w).total;
    if (planned === 0) return false;
    if (timeOffHours(ds, person.id, w, addDays(w, 4)) >= cap) return false;
    return !entries.some((e) => e.date === w);
  });

  const upcomingWeeks = mondaysBetween(ds.org.demoDate, addDays(ds.org.demoDate, horizonWeeks * 7 - 1)).map((week) => {
    const planned = plannedHoursForWeek(ds, person.id, week).total;
    const offW = timeOffHours(ds, person.id, week, addDays(week, 4));
    const capW = Math.max(0, cap - offW);
    return { week, planned, pct: capW > 0 ? planned / capW : planned > 0 ? Infinity : 0 };
  });
  const finite = upcomingWeeks.map((w) => (Number.isFinite(w.pct) ? w.pct : 2));
  const projects = ds.projects
    .flatMap((p) => p.assignments.filter((a) => a.personId === person.id && a.to >= ds.org.demoDate && a.from <= addDays(ds.org.demoDate, horizonWeeks * 7) && p.status !== "completed").map((a) => ({ projectId: p.id, hoursPerWeek: a.hoursPerWeek, to: a.to })))
    .reduce<{ projectId: ID; hoursPerWeek: number; to: ISODate }[]>((acc, x) => {
      const hit = acc.find((y) => y.projectId === x.projectId);
      if (hit) hit.hoursPerWeek = Math.max(hit.hoursPerWeek, x.hoursPerWeek);
      else acc.push({ ...x });
      return acc;
    }, []);

  return {
    person,
    delivery: isDeliveryRole(person),
    weeklyCapacity: cap,
    period: { available, actual, billable, utilization: utilization(billable, available), timeOff: off, missingWeeks },
    upcoming: {
      weeks: upcomingWeeks,
      avgPct: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0,
      peakPct: finite.length ? Math.max(...finite) : 0,
      overallocatedWeeks: upcomingWeeks.filter((w) => w.pct > 1.05).length,
    },
    projects,
  };
}

export interface StaffingGap {
  projectId: ID;
  hours: number;
  reason: string;
}

export function staffingGaps(ds: Dataset): StaffingGap[] {
  const out: StaffingGap[] = [];
  for (const p of ds.projects) {
    if (p.status === "completed") continue;
    const f = projectFinancials(ds, p);
    if (f.schedule.unstaffedHours > 0) out.push({ projectId: p.id, hours: f.schedule.unstaffedHours, reason: "Remaining estimate exceeds planned assignments before the current end date" });
  }
  return out.sort((a, b) => b.hours - a.hours);
}

export interface CapacityOverview {
  people: PersonCapacity[];
  team: { available: number; billable: number; actual: number; utilization: number | null };
  overallocated: PersonCapacity[];
  gaps: StaffingGap[];
  byRole: { role: string; people: number; weeklyCapacity: number; weeklyPlanned: number; weeklyFree: number }[];
  missingTimesheets: { personId: ID; weeks: ISODate[] }[];
}

export function capacityOverview(ds: Dataset, start: ISODate, end: ISODate, horizonWeeks = 8): CapacityOverview {
  const people = ds.people.filter((p) => !p.endDate || p.endDate >= start).map((p) => personCapacity(ds, p, start, end, horizonWeeks));
  const delivery = people.filter((p) => p.delivery && p.person.type === "employee");
  const available = delivery.reduce((s, p) => s + p.period.available, 0);
  const billable = delivery.reduce((s, p) => s + p.period.billable, 0);
  const actual = delivery.reduce((s, p) => s + p.period.actual, 0);
  const roles = [...new Set(people.filter((p) => p.delivery).map((p) => p.person.role))];
  const byRole = roles.map((role) => {
    const members = people.filter((p) => p.delivery && p.person.role === role);
    const weeklyCapacity = members.reduce((s, p) => s + p.weeklyCapacity, 0);
    const weeklyPlanned = members.reduce((s, p) => s + p.upcoming.weeks.reduce((x, w) => x + w.planned, 0) / Math.max(1, p.upcoming.weeks.length), 0);
    return { role, people: members.length, weeklyCapacity, weeklyPlanned, weeklyFree: members.reduce((s, p) => s + Math.max(0, p.weeklyCapacity - p.upcoming.weeks.reduce((x, w) => x + w.planned, 0) / Math.max(1, p.upcoming.weeks.length)), 0) };
  });
  return {
    people,
    team: { available, billable, actual, utilization: utilization(billable, available) },
    overallocated: people.filter((p) => p.upcoming.weeks.slice(0, 4).filter((w) => w.pct > 1.05).length >= 2).sort((a, b) => b.upcoming.peakPct - a.upcoming.peakPct),
    gaps: staffingGaps(ds),
    byRole,
    missingTimesheets: people.filter((p) => p.period.missingWeeks.length).map((p) => ({ personId: p.person.id, weeks: p.period.missingWeeks })),
  };
}

export interface NewWorkRequest {
  hoursByRole: Record<string, number>;
  weeks: number;
  startDate: ISODate;
}

export interface NewWorkAssessment {
  feasible: "yes" | "tight" | "no";
  rows: { role: string; requestedPerWeek: number; freePerWeek: number; shortfallPerWeek: number }[];
  notes: string[];
}

/** Can we accept new work? Compares requested hours per role with unplanned capacity over the window. */
export function assessNewWork(ds: Dataset, req: NewWorkRequest): NewWorkAssessment {
  const weeks = mondaysBetween(req.startDate, addDays(req.startDate, req.weeks * 7 - 1));
  const rows = Object.entries(req.hoursByRole).map(([role, hours]) => {
    const members = ds.people.filter((p) => p.role === role && isDeliveryRole(p) && (!p.endDate || p.endDate > req.startDate));
    const free = weeks.reduce((s, w) => s + members.reduce((x, m) => x + Math.max(0, weeklyCapacity(ds, m) - timeOffHours(ds, m.id, w, addDays(w, 4)) - plannedHoursForWeek(ds, m.id, w).total), 0), 0) / Math.max(1, weeks.length);
    const requestedPerWeek = hours / Math.max(1, weeks.length);
    return { role, requestedPerWeek, freePerWeek: free, shortfallPerWeek: Math.max(0, requestedPerWeek - free) };
  });
  const notes: string[] = [];
  const anyShort = rows.some((r) => r.shortfallPerWeek > 0.5);
  const tight = rows.some((r) => r.freePerWeek > 0 && r.requestedPerWeek / r.freePerWeek > 0.8);
  notes.push("Free capacity = weekly capacity − planned assignments − approved time off. It does not include unplanned remaining effort on existing work.");
  return { feasible: anyShort ? "no" : tight ? "tight" : "yes", rows, notes };
}
