"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyImportAction } from "@/app/actions";
import type { ColumnMapping, FieldSpec, ImportPreview, SheetDatasetKey } from "@/lib/connectors/sheets";

export interface WizardDataset {
  key: SheetDatasetKey;
  label: string;
  spreadsheet: string;
  sheetName: string;
  lastModified: string;
  restricted: boolean;
  description: string;
  fields: FieldSpec[];
  columns: string[];
  rows: string[][];
  suggested: ColumnMapping;
  allowed: boolean;
}

const ACTION_TONE: Record<string, string> = {
  create: "bg-good-soft text-good",
  update: "bg-accent-soft text-accent",
  unchanged: "bg-canvas text-ink-soft",
  reject: "bg-bad-soft text-bad",
  duplicate: "bg-warn-soft text-warn",
};

export function ImportWizard({ datasets }: { datasets: WizardDataset[] }) {
  const firstAllowed = datasets.find((d) => d.allowed)?.key ?? datasets[0]?.key;
  const [key, setKey] = useState<SheetDatasetKey | undefined>(firstAllowed);
  const def = datasets.find((d) => d.key === key);
  const [mapping, setMapping] = useState<ColumnMapping>(def?.suggested ?? {});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function choose(k: SheetDatasetKey) {
    const d = datasets.find((x) => x.key === k)!;
    setKey(k);
    setMapping(d.suggested);
    setPreview(null);
    setMsg(null);
  }

  async function runPreview() {
    if (!def) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset: def.key, mapping }) });
      const body = await res.json();
      if (!res.ok) setMsg({ ok: false, text: body.error ?? "Preview failed" });
      else setPreview(body as ImportPreview);
    } finally {
      setBusy(false);
    }
  }

  if (!def) return <p className="text-sm text-ink-muted">No datasets available.</p>;

  return (
    <div className="space-y-6">
      <section aria-labelledby="step1" className="card p-4">
        <h2 id="step1" className="text-sm font-semibold">
          1. Choose a dataset
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {datasets.map((d) => (
            <button
              key={d.key}
              type="button"
              disabled={!d.allowed}
              onClick={() => choose(d.key)}
              aria-pressed={d.key === key}
              className={`rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${d.key === key ? "border-accent bg-accent-soft" : "border-line bg-white hover:border-accent/50"}`}
            >
              <div className="font-medium">
                {d.label} {d.restricted && <span className="ml-1 rounded bg-bad-soft px-1 text-[10px] font-medium text-bad">Restricted</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                {d.spreadsheet} › {d.sheetName}
              </div>
              {!d.allowed && <div className="mt-1 text-[11px] text-bad">{d.restricted ? "Finance role only" : "Not permitted for your role"}</div>}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">{def.description}</p>
        <p className="mt-1 text-xs text-ink-muted">Simulated sheet, last modified {def.lastModified.slice(0, 10)}. No real spreadsheet is accessed.</p>
      </section>

      <section aria-labelledby="step2" className="card p-4">
        <h2 id="step2" className="text-sm font-semibold">
          2. Map columns to fields
        </h2>
        <p className="mt-1 text-xs text-ink-muted">Suggested from column headers. Required fields are marked *.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {def.fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`map-${f.key}`}>
                {f.label}
                {f.required ? " *" : ""} <span className="font-normal text-ink-muted">({f.type})</span>
              </label>
              <select
                id={`map-${f.key}`}
                className="input"
                value={mapping[f.key] ?? ""}
                onChange={(e) => {
                  setMapping((m) => ({ ...m, [f.key]: e.target.value || null }));
                  setPreview(null);
                }}
              >
                <option value="">Not mapped</option>
                {def.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-ink-soft">Source rows ({def.rows.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="th">Row</th>
                  {def.columns.map((c) => (
                    <th key={c} className="th">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {def.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="td text-ink-muted">{i + 2}</td>
                    {def.columns.map((c, j) => (
                      <td key={c} className="td">
                        {r[j] || <span className="text-ink-muted">∅</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <button type="button" className="btn btn-primary mt-4" onClick={runPreview} disabled={busy || !def.allowed}>
          {busy ? "Validating…" : "3. Preview and validate"}
        </button>
      </section>

      {preview && (
        <section aria-labelledby="step3" className="card p-4">
          <h2 id="step3" className="text-sm font-semibold">
            Preview: nothing has been written yet
          </h2>
          {preview.mappingErrors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-bad">
              {preview.mappingErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {Object.entries(preview.summary).map(([k, n]) => (
              <span key={k} className={`rounded-full px-2 py-0.5 font-medium ${ACTION_TONE[k]}`}>
                {n} {k === "reject" ? "rejected" : k === "duplicate" ? "duplicate" : k === "create" ? "new" : k === "update" ? "updated" : "unchanged"}
              </span>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr>
                  <th className="th">Row</th>
                  <th className="th">Result</th>
                  <th className="th">Key</th>
                  <th className="th">Errors, warnings and changes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="td">{r.rowNumber}</td>
                    <td className="td">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${ACTION_TONE[r.action]}`}>{r.action}</span>
                    </td>
                    <td className="td text-ink-muted">{r.stableId ?? "—"}</td>
                    <td className="td">
                      {r.errors.map((e) => (
                        <div key={e} className="text-bad">
                          ✗ {e}
                        </div>
                      ))}
                      {r.warnings.map((w) => (
                        <div key={w} className="text-warn">
                          ⚠︎ {w}
                        </div>
                      ))}
                      {r.changes?.map((c) => (
                        <div key={c} className="text-ink-soft">
                          {c}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || preview.mappingErrors.length > 0 || preview.summary.create + preview.summary.update === 0}
              onClick={() =>
                start(async () => {
                  const r = await applyImportAction(def.key, mapping);
                  if (!r.ok) setMsg({ ok: false, text: r.error });
                  else {
                    const s = r.value!;
                    setMsg({ ok: true, text: `Imported: ${s.created} created, ${s.updated} updated, ${s.unchanged} unchanged, ${s.rejected} rejected, ${s.duplicates} duplicates. Run the preview again to confirm the re-import is idempotent.` });
                    setPreview(null);
                    router.refresh();
                  }
                })
              }
            >
              Apply {preview.summary.create + preview.summary.update} valid rows
            </button>
            <span className="text-xs text-ink-muted">Rejected and duplicate rows are skipped. Re-running the same import changes nothing.</span>
          </div>
        </section>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
