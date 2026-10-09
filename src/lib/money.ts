import type { CurrencyCode } from "@/domain/types";

/**
 * Fixed demo exchange rates (units of USD per 1 unit of currency).
 * Clearly simulated; a production system would source dated rates from the
 * finance provider and store the rate used on each converted record.
 */
export const DEMO_FX_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
};

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  return (amount * DEMO_FX_TO_USD[from]) / DEMO_FX_TO_USD[to];
}

const SYMBOL: Record<CurrencyCode, string> = { USD: "$", EUR: "€", GBP: "£" };

export function fmtMoney(amount: number | null | undefined, currency: CurrencyCode, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let body: string;
  if (opts.compact && abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2)}M`;
  else if (opts.compact && abs >= 10_000) body = `${Math.round(abs / 1000)}k`;
  else if (opts.compact && abs >= 1000) body = `${(abs / 1000).toFixed(1)}k`;
  else body = Math.round(abs).toLocaleString("en-US");
  const s = `${SYMBOL[currency]}${body}`;
  if (neg) return `−${s}`;
  return opts.sign && amount > 0 ? `+${s}` : s;
}

export function fmtPct(v: number | null | undefined, digits = 0, opts: { sign?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  const s = `${(Math.abs(v) * 100).toFixed(digits)}%`;
  if (v < 0) return `−${s}`;
  return opts.sign && v > 0 ? `+${s}` : s;
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return "—";
  return `${Math.round(h).toLocaleString("en-US")} h`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
