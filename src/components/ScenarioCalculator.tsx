"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { applyScenarioAction, clearScenarioAction } from "@/app/actions";
import type { CurrencyCode } from "@/domain/types";
import { defaultInputs, runScenario, type ScenarioBase, type ScenarioInputs } from "@/lib/calc/scenario";
import { fmtMoney, fmtPct } from "@/lib/money";

export function ScenarioCalculator({ projectId, base, currency, canApply, applied }: { projectId: string; base: ScenarioBase; currency: CurrencyCode; canApply: boolean; applied: { note: string; at: string; by: string } | null }) {
  const initial = useMemo(() => defaultInputs(base), [base]);
  const [inp, setInp] = useState<ScenarioInputs>(initial);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = useMemo(() => runScenario(base, initial), [base, initial]);
  const result = useMemo(() => runScenario(base, inp), [base, inp]);
  const money = (n: number | null) => fmtMoney(n, currency);
  const changed = JSON.stringify(inp) !== JSON.stringify(initial);
  const set = <K extends keyof ScenarioInputs>(k: K, val: number) => setInp((x) => ({ ...x, [k]: Number.isFinite(val) ? val : 0 }));

  const field = (id: keyof ScenarioInputs, label: string, opts: { step?: number; min?: number; max?: number; pct?: boolean; help?: string }) => (
    <div>
      <label className="label" htmlFor={`sc-${id}`}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={`sc-${id}`}
          type="number"
          className="input"
          step={opts.step ?? 1}
          min={opts.min}
          max={opts.max}
          value={opts.pct ? Math.round(inp[id] * 1000) / 10 : inp[id]}
          onChange={(e) => set(id, opts.pct ? Number(e.target.value) / 100 : Number(e.target.value))}
        />
        {opts.pct && <span className="text-sm text-ink-muted">%</span>}
      </div>
      {opts.help && <p className="mt-0.5 text-[11px] text-ink-muted">{opts.help}</p>}
    </div>
  );

  const row = (label: string, a: string, b: string, highlight = false) => (
    <tr>
      <td className="td text-ink-soft">{label}</td>
      <td className="td num">{a}</td>
      <td className={`td num ${highlight && a !== b ? "font-semibold text-accent" : ""}`}>{b}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-xs text-accent">
        Exploring a scenario changes nothing. The project forecast only changes if {canApply ? "you" : "an Executive or Finance user"} explicitly apply it below.
      </div>
      {applied && (
        <div className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
          A scenario is currently applied to this forecast: “{applied.note || "no note"}” by {applied.by} on {applied.at.slice(0, 10)}. Base figures below already include it.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {base.billing === "fixed_fee" && field("contractValue", `Total contract value (${currency})`, { step: 1000, min: 0, help: "Fee plus approved change orders" })}
        {base.billing !== "fixed_fee" && field("priceChangePct", base.billing === "retainer" ? "Change to future monthly fee" : "Change to future bill rates", { step: 1, pct: true, help: "Applies to remaining work only" })}
        {field("remainingHours", "Remaining hours", { step: 10, min: 0 })}
        {field("substituteShare", "Share of remaining hours moved to substitute", { step: 5, min: 0, max: 100, pct: true })}
        {field("substituteCostRate", `Substitute cost per hour (${currency})`, { step: 5, min: 0, help: "e.g. a contractor quote" })}
        {field("targetMargin", "Target margin", { step: 1, pct: true })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className="th">Measure</th>
              <th className="th num">Current forecast</th>
              <th className="th num">Scenario</th>
            </tr>
          </thead>
          <tbody>
            {row("Revenue at completion", money(current.revenueAtCompletion), money(result.revenueAtCompletion), true)}
            {row("Cost already incurred", money(base.actualCost), money(base.actualCost))}
            {row("Remaining cost", money(current.remainingCost), money(result.remainingCost), true)}
            {row("Blended remaining cost / hour", money(current.blendedRemainingRate), money(result.blendedRemainingRate), true)}
            {row("Forecast cost at completion", money(current.forecastCost), money(result.forecastCost), true)}
            {row("Profit at completion", money(current.profit), money(result.profit), true)}
            {row("Margin at completion", fmtPct(current.margin, 1), fmtPct(result.margin, 1), true)}
            {row("Gap to target", fmtPct(current.gapToTarget, 1, { sign: true }), fmtPct(result.gapToTarget, 1, { sign: true }), true)}
            {row("Revenue needed for target", money(current.requiredRevenueForTarget), money(result.requiredRevenueForTarget), true)}
            {row("Max remaining hours for target", current.maxRemainingHoursForTarget === null ? "—" : `${Math.round(current.maxRemainingHoursForTarget)} h`, result.maxRemainingHoursForTarget === null ? "—" : `${Math.round(result.maxRemainingHoursForTarget)} h`, true)}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className="btn" onClick={() => setInp(initial)} disabled={!changed}>
          Reset inputs
        </button>
        {canApply ? (
          <>
            <div className="min-w-[220px] flex-1">
              <label className="label" htmlFor="sc-note">Note for the audit trail</label>
              <input id="sc-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agreed change order with client" />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !changed}
              onClick={() =>
                start(async () => {
                  const r = await applyScenarioAction(projectId, inp, note);
                  setMsg(r.ok ? { ok: true, text: "Scenario applied. The project forecast, alerts and assistant now use it." } : { ok: false, text: r.error });
                  if (r.ok) router.refresh();
                })
              }
            >
              Apply to forecast
            </button>
            {applied && (
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await clearScenarioAction(projectId);
                    setMsg(r.ok ? { ok: true, text: "Applied scenario removed. Forecast restored to source data." } : { ok: false, text: r.error });
                    if (r.ok) router.refresh();
                  })
                }
              >
                Remove applied scenario
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-muted">Your role can explore scenarios but not apply them.</p>
        )}
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
