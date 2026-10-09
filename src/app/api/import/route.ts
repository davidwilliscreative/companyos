import { NextResponse } from "next/server";
import { buildSeed } from "@/data/seed";
import { buildRawDataset } from "@/data/dataset";
import { getRequestContext } from "@/data/session";
import { overlayFor } from "@/data/state";
import { getStore } from "@/data/store";
import { previewImport, sheetDatasets, type ColumnMapping, type SheetDatasetKey } from "@/lib/connectors/sheets";
import { canImport, capsFor } from "@/lib/permissions";

/** Preview (validate) a simulated Sheets import. Nothing is written. */
export async function POST(req: Request) {
  const ctx = await getRequestContext();
  const { dataset, mapping } = (await req.json().catch(() => ({}))) as { dataset?: SheetDatasetKey; mapping?: ColumnMapping };
  const raw = buildRawDataset(ctx.profileId, overlayFor(getStore().read(), ctx.orgId));
  const def = sheetDatasets(buildSeed(ctx.profileId)).find((d) => d.key === dataset);
  if (!def || !mapping) return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  if (!canImport(capsFor(ctx.role), def)) return NextResponse.json({ error: def.restricted ? "Compensation data is restricted to the Finance role." : "Your role cannot preview imports." }, { status: 403 });
  return NextResponse.json(previewImport(def, mapping, raw, { id: "preview", at: new Date().toISOString() }));
}
