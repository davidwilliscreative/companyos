import type { Dataset, ID, ISODate, Milestone, RetailLaunch } from "@/domain/types";
import { addDays, daysBetween, fmtDate, maxDate } from "@/lib/dates";
import { milestoneState, type MilestoneState } from "./finance";

/**
 * Retail launch readiness. A packaging launch is on shelf only if final artwork reaches the printer
 * `printLeadWeeks` before the retailer's shelf date. The files-due date is that shelf date minus the
 * print lead time; the release forecast is the release milestone's completion date, or its current
 * due date (never earlier than today when it is still open). Buffer = files-due − forecast release.
 *
 *  - at risk: forecast release is after the files-due date (negative buffer)
 *  - tight: less than 7 days of buffer, or the release is waiting on the client or blocked
 *  - released: final files are with the printer on time
 *  - on shelf: the shelf date has passed
 */

export type LaunchStatus = "on_shelf" | "released" | "on_track" | "tight" | "at_risk";

export interface LaunchReadiness {
  launch: RetailLaunch;
  status: LaunchStatus;
  filesDue: ISODate;
  forecastRelease: ISODate | null;
  bufferDays: number | null;
  milestone: Milestone | null;
  milestoneState: MilestoneState | null;
  summary: string;
}

export function launchReadiness(ds: Dataset, l: RetailLaunch, asOf: ISODate = ds.org.demoDate): LaunchReadiness {
  const filesDue = addDays(l.shelfDate, -l.printLeadWeeks * 7);
  const m = ds.milestones.find((x) => x.id === l.releaseMilestoneId) ?? null;
  if (!m) return { launch: l, status: "tight", filesDue, forecastRelease: null, bufferDays: null, milestone: null, milestoneState: null, summary: "Release milestone not found; readiness cannot be judged" };
  const st = milestoneState(m, asOf);
  const done = st.state === "done";
  const forecastRelease = done ? m.completedOn! : maxDate(st.due, asOf);
  const bufferDays = daysBetween(forecastRelease, filesDue);
  let status: LaunchStatus;
  let summary: string;
  if (l.shelfDate <= asOf) {
    status = "on_shelf";
    summary = `On shelf since ${fmtDate(l.shelfDate)}`;
  } else if (done) {
    status = bufferDays >= 0 ? "released" : "at_risk";
    summary = bufferDays >= 0 ? `Final files released to ${l.printer}` : `Files reached ${l.printer} ${-bufferDays} days after the print deadline; shelf date depends on a rush run`;
  } else if (bufferDays < 0) {
    status = "at_risk";
    summary = `Final files forecast ${-bufferDays} days after the print deadline${st.state === "awaiting_client" ? ", waiting on client approval" : ""}`;
  } else if (bufferDays < 7 || st.state === "awaiting_client" || st.state === "blocked") {
    status = "tight";
    summary = `${bufferDays} days of buffer before the print deadline${st.state === "awaiting_client" ? "; waiting on client approval" : st.state === "blocked" ? `; blocked: ${m.blockedReason ?? ""}` : ""}`;
  } else {
    status = "on_track";
    summary = `${bufferDays} days of buffer before the print deadline`;
  }
  return { launch: l, status, filesDue, forecastRelease, bufferDays, milestone: m, milestoneState: st.state, summary };
}

export function retailLaunches(ds: Dataset, asOf: ISODate = ds.org.demoDate): Record<ID, LaunchReadiness> {
  return Object.fromEntries(ds.retailLaunches.map((l) => [l.id, launchReadiness(ds, l, asOf)]));
}

export const LAUNCH_RANK: Record<LaunchStatus, number> = { at_risk: 0, tight: 1, on_track: 2, released: 3, on_shelf: 4 };
