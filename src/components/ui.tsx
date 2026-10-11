import Link from "next/link";
import type { ReactNode } from "react";
import type { Confidence, ReviewStatus, Severity } from "@/domain/types";
import type { HealthStatus } from "@/lib/calc/health";
import type { MilestoneState } from "@/lib/calc/finance";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tightest text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A labelled group of cards. Gives long pages a clear second level of hierarchy. */
export function Section({ title, subtitle, actions, children, id }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Card({ title, subtitle, actions, children, className = "", id, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; padded?: boolean }) {
  return (
    <section id={id} className={`card scroll-mt-24 ${className}`} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-5 ${padded ? "" : "pb-3"}`}>
          <div className="min-w-0">
            {title && <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-snug text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 text-[13px]">{actions}</div>}
        </div>
      )}
      <div className={`min-w-0 overflow-x-auto ${padded ? "p-5" : ""} ${padded && (title || actions) ? "pt-4" : ""}`}>{children}</div>
    </section>
  );
}

/** Small "View all →" style link used in card headers. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-ink-soft no-underline transition hover:bg-canvas hover:text-ink">
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export function Stat({ label, value, sub, kind, href, tone, size = "md" }: { label: string; value: ReactNode; sub?: ReactNode; kind?: "observed" | "calculated" | "inferred" | "estimate"; href?: string; tone?: "good" | "warn" | "bad"; size?: "md" | "lg" }) {
  const toneCls = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  const dot = tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : tone === "good" ? "bg-good" : null;
  const body = (
    <div className={`card group h-full p-5 transition ${href ? "hover:-translate-y-px hover:shadow-lift" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
          {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
          {label}
        </div>
        {kind && <span className="hidden sm:inline-flex"><KindTag kind={kind} quiet /></span>}
      </div>
      <div className={`mt-3 font-semibold tabular-nums tracking-tightest ${size === "lg" ? "text-[34px] leading-none" : "text-[28px] leading-none"} ${toneCls}`}>{value}</div>
      {sub && <div className="mt-2 text-[13px] leading-snug text-ink-muted">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block text-inherit no-underline hover:text-inherit">
      {body}
    </Link>
  ) : (
    body
  );
}

const KIND_INFO = {
  observed: { label: "Observed", title: "Recorded fact from a source system (simulated)", cls: "bg-canvas text-ink-soft", dot: "bg-ink-faint" },
  calculated: { label: "Calculated", title: "Computed by Opsight from recorded facts using documented formulas", cls: "bg-accent-soft text-accent", dot: "bg-accent" },
  inferred: { label: "Inferred", title: "Judgment derived from communication patterns; review before acting", cls: "bg-violet-soft text-violet", dot: "bg-violet" },
  estimate: { label: "Manual estimate", title: "Entered by a person; not committed revenue", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
} as const;

/** Says where a number comes from. `quiet` renders a small dot + label for dense places such as stat cards. */
export function KindTag({ kind, quiet = false }: { kind: keyof typeof KIND_INFO; quiet?: boolean }) {
  const k = KIND_INFO[kind];
  if (quiet)
    return (
      <span title={k.title} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-faint">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
        {k.label}
      </span>
    );
  return (
    <span title={k.title} className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${k.cls}`}>
      {k.label}
    </span>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "purple";
const TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft ring-line-strong/70",
  good: "bg-good-soft text-good ring-good-line",
  warn: "bg-warn-soft text-warn ring-warn-line",
  bad: "bg-bad-soft text-bad ring-bad-line",
  accent: "bg-accent-soft text-accent ring-accent-line",
  purple: "bg-violet-soft text-violet ring-violet-line",
};

export function Badge({ tone = "neutral", children, icon, title }: { tone?: Tone; children: ReactNode; icon?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>
      {icon && <span aria-hidden="true" className="text-[10px] leading-none">{icon}</span>}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, [Tone, string]> = { critical: ["bad", "▲▲"], high: ["bad", "▲"], medium: ["warn", "●"], low: ["neutral", "○"] };
  const [tone, icon] = map[severity];
  return (
    <Badge tone={tone} icon={icon} title={`Severity: ${severity}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence, reason }: { confidence: Confidence; reason?: string }) {
  const bars = confidence === "high" ? "▮▮▮" : confidence === "medium" ? "▮▮▯" : "▮▯▯";
  return (
    <Badge tone="purple" title={reason ?? "Confidence in the textual evidence, not a probability"}>
      <span aria-hidden="true" className="font-mono text-[9px] tracking-tighter">{bars}</span>
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)} confidence
    </Badge>
  );
}

export function HealthBadge({ status, score }: { status: HealthStatus; score?: number | null }) {
  const map: Record<HealthStatus, [Tone, string, string]> = {
    healthy: ["good", "✓", "Healthy"],
    watch: ["warn", "◐", "Watch"],
    at_risk: ["bad", "!", "At risk"],
    insufficient: ["neutral", "?", "Insufficient data"],
  };
  const [tone, icon, label] = map[status];
  return (
    <Badge tone={tone} icon={icon} title={status === "insufficient" ? "Not enough current information. Missing data is not treated as healthy." : undefined}>
      {label}
      {score !== undefined && score !== null && status !== "insufficient" ? ` · ${score}` : ""}
    </Badge>
  );
}

export function MilestoneBadge({ state }: { state: MilestoneState }) {
  const map: Record<MilestoneState, [Tone, string, string]> = {
    done: ["good", "✓", "Done"],
    on_track: ["accent", "→", "On track"],
    at_risk: ["warn", "◐", "Moved"],
    blocked: ["bad", "■", "Blocked"],
    awaiting_client: ["warn", "⏸", "Waiting on approval"],
    late: ["bad", "!", "Late"],
  };
  const [tone, icon, label] = map[state];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, [Tone, string]> = { unreviewed: ["accent", "Unreviewed"], confirmed: ["bad", "Confirmed"], dismissed: ["neutral", "Dismissed"], resolved: ["good", "Resolved"] };
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Trend({ delta, suffix = "" }: { delta: number | null; suffix?: string }) {
  if (delta === null) return <span className="text-xs text-ink-faint">no prior data</span>;
  if (delta === 0) return <span className="text-xs text-ink-muted">no change</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${up ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
      <span aria-hidden="true">{up ? "↑" : "↓"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span>
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-canvas/60 px-4 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "warn", title, children }: { tone?: "warn" | "info" | "bad"; title?: string; children: ReactNode }) {
  const cls = tone === "bad" ? "border-bad-line bg-bad-soft/70" : tone === "info" ? "border-accent-line bg-accent-soft/70" : "border-warn-line bg-warn-soft/70";
  const icon = tone === "bad" ? "text-bad" : tone === "info" ? "text-accent" : "text-warn";
  return (
    <div role="note" className={`flex gap-3 rounded-xl border px-4 py-3 text-sm text-ink ${cls}`}>
      <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-1 ring-current ${icon}`}>
        {tone === "info" ? "i" : "!"}
      </span>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? "mt-0.5 text-[13px] text-ink-soft" : "text-ink-soft"}>{children}</div>
      </div>
    </div>
  );
}

export function Restricted({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-8 text-center text-sm text-ink-soft">
      <div className="font-medium text-ink">Restricted for your role</div>
      <div className="mt-1">{what} The data was not loaded for this session.</div>
    </div>
  );
}

export function DefList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Bar({ value, max = 1, tone = "accent", label }: { value: number; max?: number; tone?: "accent" | "good" | "warn" | "bad"; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : tone === "good" ? "bg-good" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={label}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SourceTag({ system, detail }: { system: string; detail?: string }) {
  const label: Record<string, string> = { seed: "Demo data", sheets: "Google Sheets (simulated)", clickup: "ClickUp (simulated)", gmail: "Gmail (simulated)", slack: "Slack (simulated)", accounting: "Accounting (simulated)", manual: "Manual" };
  return (
    <span className="text-[11px] text-ink-muted" title={detail}>
      Source: {label[system] ?? system}
      {detail ? ` · ${detail}` : ""}
    </span>
  );
}

/** Section tabs as links (?tab=…), so each view has its own URL and works without JavaScript. */
export function Tabs({ base, tabs, current }: { base: string; tabs: { key: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key}>
              <Link
                href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium no-underline ${active ? "border-ink text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink"}`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-canvas px-1.5 text-xs text-ink-soft ring-1 ring-inset ring-line">{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
