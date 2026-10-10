import Link from "next/link";
import { buildSeed } from "@/data/seed";
import { ImportWizard, type WizardDataset } from "@/components/ImportWizard";
import { Notice, PageHeader, Restricted } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { sheetDatasets, suggestMapping } from "@/lib/connectors/sheets";
import { canImport } from "@/lib/permissions";

export default async function SheetsImportPage() {
  const ws = await getWorkspace();
  if (ws.caps.importDatasets === "none") {
    return (
      <div className="space-y-6">
        <PageHeader title="Google Sheets import (simulated)" eyebrow={<Link href="/integrations" className="text-ink-muted">← Integrations</Link>} />
        <Restricted what="Imports are run by the Finance role (all datasets) or the Administrator role (non-restricted datasets)." />
      </div>
    );
  }
  const datasets: WizardDataset[] = sheetDatasets(buildSeed(ws.ctx.profileId)).map((d) => {
    const allowed = canImport(ws.caps, d);
    // Rows of datasets the role cannot import (e.g. compensation) are never sent to the browser.
    return { key: d.key, label: d.label, spreadsheet: d.spreadsheet, sheetName: d.sheetName, lastModified: d.lastModified, restricted: d.restricted, description: d.description, fields: d.fields, columns: allowed ? d.columns : [], rows: allowed ? d.rows : [], suggested: allowed ? suggestMapping(d) : {}, allowed };
  });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/integrations" className="text-ink-muted">
            ← Integrations
          </Link>
        }
        title="Google Sheets import (simulated)"
        subtitle="Map columns, preview validation results, then apply. Imports are idempotent: rows are keyed by stable identifiers, so re-importing the same sheet updates or skips rather than duplicating."
      />
      <Notice tone="info">No real spreadsheet is read. The sheets below are synthetic and include deliberate problems (an unknown person, an invalid date, a duplicate row, a currency mismatch) so validation can be demonstrated.</Notice>
      <ImportWizard datasets={datasets} />
    </div>
  );
}
