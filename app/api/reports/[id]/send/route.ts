import { NextResponse } from "next/server";
import { deliverReport } from "@/lib/reports/deliver";
import { getReport, isUuid, requireReportsUser } from "@/lib/reports/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/reports/<id>/send — email the caller a copy right now (the same
 * email the schedule sends), run under the caller's own role. Only ever to the
 * caller; the schedule decides everyone else.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (!auth.user.email) return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
  try {
    return NextResponse.json(await deliverReport(report, { to: [auth.user.email], role: auth.user.role }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send the report." }, { status: 500 });
  }
}
