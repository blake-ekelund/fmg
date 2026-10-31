import { NextResponse } from "next/server";
import { buildReportWorkbook, reportFilename } from "@/lib/reports/excel";
import { runReport } from "@/lib/reports/run";
import { getReport, isUuid, requireReportsUser } from "@/lib/reports/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/reports/<id>/export — the report as an Excel workbook, run under the caller's role. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const results = await runReport(report.widgets, auth.user.role, 20_000);
  const file = await buildReportWorkbook(report, results);
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${reportFilename(report.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
