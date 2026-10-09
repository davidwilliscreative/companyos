import Link from "next/link";
import type { ReactNode } from "react";
import type { Confidence, ReviewStatus, Severity } from "@/domain/types";
import type { HealthStatus } from "@/lib/calc/health";
import type { MilestoneState } from "@/lib/calc/finance";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 max-w-3xl text-sm text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, children, className = "", id, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; padded?: boolean }) {
  return (
    <section id={id} className={`card scroll-mt-20 ${className}`} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={`min-w-0 overflow-x-auto ${padded ? "p-4" : ""}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, kind, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; kind?: "observed" | "calculated" | "inferred" | "estimate"; href?: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  const body = (
    <div className="card h-full p-4 transition-colors hover:border-accent/40">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        {kind && <KindTag kind={kind} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block text-inherit no-underline hover:no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

const KIND_INFO = {
  observed: { label: "Observed", title: "Recorded fact from a source system (simulated)", cls: "bg-[#eef1f5] text-ink-soft" },
  calculated: { label: "Calculated", title: "Computed by CompanyOS from recorded facts using documented formulas", cls: "bg-accent-soft text-accent" },
  inferred: { label: "Inferred", title: "Judgment derived from communication patterns; review before acting", cls: "bg-[#f3eefa] text-[#5b3f8a]" },
  estimate: { label: "Manual estimate", title: "Entered by a person; not committed revenue", cls: "bg-warn-soft text-warn" },
} as const;

export function KindTag({ kind }: { kind: keyof typeof KIND_INFO }) {
  const k = KIND_INFO[kind];
  return (
    <span title={k.title} className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${k.cls}`}>
      {k.label}
    </span>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "purple";
const TONE: Record<Tone, string> = {
  neutral: "bg-[#eef0ec] text-ink-soft border-[#e1e3dd]",
  good: "bg-good-soft text-good border-[#cfe3d8]",
  warn: "bg-warn-soft text-warn border-[#f1dfb8]",
  bad: "bg-bad-soft text-bad border-[#efcdc7]",
  accent: "bg-accent-soft text-accent border-[#d3e0ec]",
  purple: "bg-[#f3eefa] text-[#5b3f8a] border-[#e3d9f1]",
};

export function Badge({ tone = "neutral", children, icon, title }: { tone?: Tone; children: ReactNode; icon?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
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
  if (delta === null) return <span className="text-xs text-ink-muted">no prior data</span>;
  if (delta === 0) return <span className="text-xs text-ink-muted">→ no change</span>;
  const up = delta > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-good" : "text-bad"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {up ? "up" : "down"} {Math.abs(delta)}
      {suffix}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas/50 px-4 py-8 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "warn", title, children }: { tone?: "warn" | "info" | "bad"; title?: string; children: ReactNode }) {
  const cls = tone === "bad" ? "border-[#efcdc7] bg-bad-soft text-bad" : tone === "info" ? "border-[#d3e0ec] bg-accent-soft text-accent" : "border-[#f1dfb8] bg-warn-soft text-warn";
  return (
    <div role="note" className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {title && <div className="font-medium">{title}</div>}
      <div className={title ? "mt-0.5 text-[13px] opacity-90" : ""}>{children}</div>
    </div>
  );
}

export function Restricted({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-4 py-6 text-center text-sm text-ink-soft">
      <div className="font-medium text-ink">Restricted for your role</div>
      <div className="mt-1">{what} The data was not loaded for this session.</div>
    </div>
  );
}

export function DefList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
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
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#ecece7]" role="img" aria-label={label}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SourceTag({ system, detail }: { system: string; detail?: string }) {
  const label: Record<string, string> = { seed: "Demo seed", sheets: "Google Sheets (simulated)", clickup: "ClickUp (simulated)", gmail: "Gmail (simulated)", slack: "Slack (simulated)", accounting: "Accounting (simulated)", manual: "Manual" };
  return (
    <span className="text-[11px] text-ink-muted" title={detail}>
      Source: {label[system] ?? system}
      {detail ? ` · ${detail}` : ""}
    </span>
  );
}
