import type { ISODate } from "@/domain/types";

/** All date math is done in UTC on calendar dates to keep the demo deterministic. */

export function parseDate(d: ISODate): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`);
}

export function fmtISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmtISO(x);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return fmtISO(x);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const x = parseDate(startOfMonth(d));
  return fmtISO(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)));
}

export function mondayOf(d: ISODate): ISODate {
  const x = parseDate(d);
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return fmtISO(x);
}

/** Mondays m with start <= m <= end. */
export function mondaysBetween(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let m = mondayOf(start);
  if (m < start) m = addDays(m, 7);
  while (m <= end) {
    out.push(m);
    m = addDays(m, 7);
  }
  return out;
}

export function monthsBetween(start: ISODate, end: ISODate): string[] {
  const out: string[] = [];
  let m = startOfMonth(start);
  while (m <= end) {
    out.push(m.slice(0, 7));
    m = addMonths(m, 1);
  }
  return out;
}

export function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  const x = d.slice(0, 10);
  return x >= start && x <= end;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d: ISODate | undefined, opts: { year?: boolean } = {}): string {
  if (!d) return "—";
  const x = parseDate(d);
  const base = `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
  return opts.year === false ? base : `${base}, ${x.getUTCFullYear()}`;
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtMonthShort(ym: string): string {
  const [, m] = ym.split("-").map(Number);
  return MONTHS[m - 1];
}

export function relativeDays(from: ISODate, to: ISODate): string {
  const n = daysBetween(from, to);
  if (n === 0) return "today";
  if (n > 0) return n === 1 ? "in 1 day" : `in ${n} days`;
  return n === -1 ? "1 day ago" : `${-n} days ago`;
}
