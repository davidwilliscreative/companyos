import Link from "next/link";
import type { Workspace } from "@/data/access";
import type { LaunchReadiness, LaunchStatus } from "@/lib/calc/launch";
import { fmtKpi, type FlightPacing, type KpiStatus, type PacingStatus } from "@/lib/calc/media";
import { fmtDate } from "@/lib/dates";
import { fmtPct } from "@/lib/money";
import { viewHelpers } from "@/lib/view";
import { Badge, Bar } from "./ui";

/* ---------------- Retail launches (CPG branding profile) ---------------- */

const LAUNCH_BADGE: Record<LaunchStatus, { tone: "good" | "warn" | "bad" | "neutral" | "accent"; label: string }> = {
  at_risk: { tone: "bad", label: "Shelf date at risk" },
  tight: { tone: "warn", label: "Little buffer" },
  on_track: { tone: "good", label: "On track" },
  released: { tone: "accent", label: "Files released" },
  on_shelf: { tone: "neutral", label: "On shelf" },
};

export function LaunchBadge({ status }: { status: LaunchStatus }) {
  const b = LAUNCH_BADGE[status];
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

const bufferText = (r: LaunchReadiness) => (r.bufferDays === null ? "—" : r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days`);

/** One row per launch: shelf date, printer deadline, forecast release and buffer. */
export function LaunchTable({ ws, rows, showAccount = true }: { ws: Workspace; rows: LaunchReadiness[]; showAccount?: boolean }) {
  const v = viewHelpers(ws);
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.launch.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/projects/${r.launch.projectId}`} className="font-medium">
                {r.launch.name}
              </Link>
              <LaunchBadge status={r.status} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{r.summary}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {[showAccount ? v.account(r.launch.accountId) : null, r.launch.retailers.join(", "), `shelf ${fmtDate(r.launch.shelfDate)}`, `files due ${fmtDate(r.filesDue)}`, `${r.launch.skus} SKUs`].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px]">
          <thead>
            <tr>
              <th className="th">Launch</th>
              <th className="th">Status</th>
              <th className="th">Retailers</th>
              <th className="th">Shelf date</th>
              <th className="th">Files due at printer</th>
              <th className="th">Forecast release</th>
              <th className="th num">Buffer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.launch.id} className="hover:bg-canvas/60">
                <td className="td min-w-[220px]">
                  <Link href={`/projects/${r.launch.projectId}`} className="font-medium">
                    {r.launch.name}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {showAccount ? `${v.account(r.launch.accountId)} · ` : ""}
                    {r.launch.skus} SKU{r.launch.skus === 1 ? "" : "s"} · {r.launch.printer}
                  </div>
                </td>
                <td className="td whitespace-nowrap">
                  <LaunchBadge status={r.status} />
                </td>
                <td className="td text-sm">{r.launch.retailers.join(", ")}</td>
                <td className="td whitespace-nowrap text-sm">{fmtDate(r.launch.shelfDate, { year: true })}</td>
                <td className="td whitespace-nowrap text-sm">
                  {fmtDate(r.filesDue)}
                  <div className="text-[11px] text-ink-muted">{r.launch.printLeadWeeks}-week print lead</div>
                </td>
                <td className="td min-w-[180px] text-sm">
                  {r.forecastRelease ? fmtDate(r.forecastRelease) : "—"}
                  {r.milestone && (
                    <div className="text-[11px] text-ink-muted">
                      <Link href={`/projects/${r.launch.projectId}#${r.milestone.id}`}>{r.milestone.name}</Link>
                      {r.milestoneState === "awaiting_client" ? " · waiting on client" : r.milestoneState === "blocked" ? " · blocked" : ""}
                    </div>
                  )}
                </td>
                <td className={`td num whitespace-nowrap ${r.status === "at_risk" ? "font-medium text-bad" : r.status === "tight" ? "text-warn" : ""}`}>{r.status === "on_shelf" ? "—" : bufferText(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Media pacing (media profile) ---------------- */

const PACE_BADGE: Record<PacingStatus, { tone: "good" | "warn" | "bad" | "neutral" | "accent"; label: string }> = {
  over: { tone: "bad", label: "Overpacing" },
  under: { tone: "warn", label: "Underpacing" },
  on_pace: { tone: "good", label: "On pace" },
  no_data: { tone: "warn", label: "No recent data" },
  not_started: { tone: "neutral", label: "Not started" },
  ended: { tone: "neutral", label: "Ended" },
};

export function PacingBadge({ status }: { status: PacingStatus }) {
  const b = PACE_BADGE[status];
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

export function KpiBadge({ status }: { status: KpiStatus }) {
  if (!status) return <span className="text-xs text-ink-muted">—</span>;
  return <Badge tone={status === "behind" ? "bad" : status === "ahead" ? "good" : "neutral"}>{status === "behind" ? "Behind target" : status === "ahead" ? "Ahead of target" : "On target"}</Badge>;
}

/** One row per flight: budget, spend against plan, projection and KPI against target. */
export function FlightTable({ ws, rows, showAccount = true }: { ws: Workspace; rows: FlightPacing[]; showAccount?: boolean }) {
  const v = viewHelpers(ws);
  const sym = v.money(0).replace(/[\d.,\s]/g, "");
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((p) => (
          <li key={p.flight.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">
                {p.flight.channel} · {p.flight.platform}
              </span>
              <PacingBadge status={p.status} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {v.money(p.spent, { compact: true })} of {v.money(p.flight.budget, { compact: true })} · {p.flight.kpi.metric} {fmtKpi(p.flight.kpi.metric, p.kpiRecent, sym)} vs {fmtKpi(p.flight.kpi.metric, p.flight.kpi.target, sym)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{[showAccount ? v.account(p.flight.accountId) : null, `${fmtDate(p.flight.start)} – ${fmtDate(p.flight.end)}`, v.person(p.flight.ownerId)].filter(Boolean).join(" · ")}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr>
              <th className="th">Flight</th>
              <th className="th">Pacing</th>
              <th className="th">Spend vs plan to date</th>
              <th className="th num">Projected vs budget</th>
              <th className="th">KPI, last 4 weeks</th>
              <th className="th">Buyer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const f = p.flight;
              const live = p.status !== "not_started" && p.status !== "no_data";
              return (
                <tr key={f.id} className="hover:bg-canvas/60">
                  <td className="td min-w-[220px]">
                    <span className="font-medium">
                      {f.channel} · {f.platform}
                    </span>
                    <div className="text-xs text-ink-muted">
                      {showAccount ? (
                        <>
                          <Link href={`/accounts/${f.accountId}`}>{v.account(f.accountId)}</Link> ·{" "}
                        </>
                      ) : null}
                      {f.objective} · {fmtDate(f.start)} – {fmtDate(f.end)}
                    </div>
                    {f.note && <div className="mt-0.5 text-[11px] text-ink-muted">{f.note}</div>}
                  </td>
                  <td className="td whitespace-nowrap">
                    <PacingBadge status={p.status} />
                    {p.dataThrough && <div className="mt-0.5 text-[11px] text-ink-muted">data to {fmtDate(p.dataThrough)}</div>}
                  </td>
                  <td className="td w-48">
                    {live ? (
                      <>
                        <Bar value={p.spent} max={Math.max(p.expected, p.spent, 1)} tone={p.status === "over" ? "bad" : p.status === "under" ? "warn" : "accent"} label={`${v.money(p.spent)} spent against ${v.money(p.expected)} planned to date`} />
                        <div className="mt-0.5 text-[11px] text-ink-muted">
                          {v.money(p.spent, { compact: true })} / {v.money(p.expected, { compact: true })} planned ({fmtPct(p.pacing)})
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-ink-muted">{p.status === "no_data" ? p.summary : `Budget ${v.money(f.budget, { compact: true })}`}</span>
                    )}
                  </td>
                  <td className={`td num whitespace-nowrap ${p.status === "over" ? "font-medium text-bad" : p.status === "under" ? "text-warn" : ""}`}>
                    {live ? (
                      <>
                        {v.money(p.projected, { compact: true })}
                        <div className="text-[11px] font-normal text-ink-muted">
                          of {v.money(f.budget, { compact: true })} ({fmtPct(p.projectedVariance, 0, { sign: true })})
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-sm">
                    {p.kpiRecent !== null && p.status !== "not_started" ? (
                      <>
                        <KpiBadge status={p.kpiStatus} />
                        <div className="mt-0.5 text-[11px] text-ink-muted">
                          {f.kpi.metric} {fmtKpi(f.kpi.metric, p.kpiRecent, sym)} vs {fmtKpi(f.kpi.metric, f.kpi.target, sym)} target
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {f.kpi.metric} target {fmtKpi(f.kpi.metric, f.kpi.target, sym)}
                      </span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-sm">{v.person(f.ownerId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
