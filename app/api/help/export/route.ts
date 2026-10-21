import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { buildExport, readExportSpec } from "@/lib/assistant/reportExport";
import type { UserRole } from "@/components/UserContext";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/help/export — the file behind a Sage "Download" button.
 *
 * Body: { spec: ExportSpec, filename?: string }
 * Returns: an .xlsx workbook (one tab per sheet) or a .csv, up to 20,000 rows
 * per sheet.
 *
 * Re-checks everything: each sheet's dataset must be one the caller's role can
 * see (dataCatalog gates each dataset on its page), whatever Sage put in it.
 */
/** Letters, digits, _ - and spaces, then .xlsx or .csv (what exportFilename() makes). */
const SAFE_FILENAME = /^[\w\- ]+\.(xlsx|csv)$/;

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { spec?: unknown; filename?: unknown };
  try {
    const spec = readExportSpec(body.spec);
    const { body: file, contentType } = await buildExport(spec, user.access as UserRole);
    const ext = spec.format;
    const filename =
      typeof body.filename === "string" && SAFE_FILENAME.test(body.filename) && body.filename.endsWith(`.${ext}`)
        ? body.filename
        : `report.${ext}`;
    return new Response(file as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the report." }, { status: 400 });
  }
}
