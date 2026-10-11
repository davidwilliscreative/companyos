import type { ReactNode } from "react";
import type { Interpretation, Level } from "@/lib/interpret";
import { Badge } from "./ui";

const LEVEL_BADGE: Record<Level, ["good" | "warn" | "bad" | "neutral", string]> = {
  good: ["good", "✓"],
  watch: ["warn", "◐"],
  at_risk: ["bad", "!"],
  unknown: ["neutral", "?"],
  restricted: ["neutral", "–"],
  none: ["neutral", "–"],
};

export function LevelBadge({ level, children }: { level: Level; children: ReactNode }) {
  const [tone, icon] = LEVEL_BADGE[level];
  return (
    <Badge tone={tone} icon={icon}>
      {children}
    </Badge>
  );
}

/**
 * The situation in one line, then one row per dimension with the reason in
 * words. The weighted score and its factors sit behind "Why this status?".
 */
export function StatusPanel({ it, why }: { it: Interpretation; why?: ReactNode }) {
  return (
    <section aria-labelledby="status-title" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="status-title" className="text-[15px] font-semibold tracking-tight">
          Status
        </h2>
        <LevelBadge level={it.overall}>{it.overallLabel}</LevelBadge>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink">{it.headline}</p>
      <dl className="mt-3 divide-y divide-line/70 border-t border-line">
        {it.dimensions.map((d) => (
          <div key={d.key} className="grid gap-1 py-2.5 sm:grid-cols-[150px_210px_1fr] sm:items-baseline sm:gap-3">
            <dt className="text-sm font-medium text-ink-soft">{d.label}</dt>
            <dd>
              <LevelBadge level={d.level}>{d.status}</LevelBadge>
            </dd>
            <dd className="text-sm text-ink-soft">{d.reason}</dd>
          </div>
        ))}
      </dl>
      {why && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-[13px] font-medium text-accent">Why this status?</summary>
          <div className="mt-3">{why}</div>
        </details>
      )}
    </section>
  );
}
