import { NextResponse } from "next/server";
import { runReport } from "@/lib/reports/run";
import { canEdit, deleteReport, getReport, isUuid, requireReportsUser, teamMembers, updateReport } from "@/lib/reports/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET    /api/reports/<id> — the report + every widget's data, run under the
 *                            VIEWER's role (widgets they can't see come back as errors).
 * PATCH  /api/reports/<id> — { title?, description?, widgets?, schedule? (null clears), schedule_enabled? }
 * DELETE /api/reports/<id>
 * Editing is the creator's or an owner/admin's.
 */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const report = await getReport(id);
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const [results, team] = await Promise.all([runReport(report.widgets, auth.user.role), teamMembers()]);
    return NextResponse.json({
      report,
      results,
      canEdit: canEdit(report, auth.user),
      team,
      myEmail: auth.user.email,
      ranAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load the report." }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (!canEdit(report, auth.user)) return NextResponse.json({ error: "Only the report's creator or an admin can change it." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return NextResponse.json({ report: await updateReport(report, body) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the report." }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ ok: true });
  if (!canEdit(report, auth.user)) return NextResponse.json({ error: "Only the report's creator or an admin can delete it." }, { status: 403 });
  await deleteReport(id);
  return NextResponse.json({ ok: true });
}
