import { NextResponse } from "next/server";
import { getReport, isUuid, requireReportsUser } from "@/lib/reports/store";
import { suggestWidgets } from "@/lib/reports/suggest";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/reports/<id>/suggest — Sage's recommended additions (tested widgets + why). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return NextResponse.json({ error: "Sage isn't switched on (no AI key)." }, { status: 503 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  try {
    return NextResponse.json({ suggestions: await suggestWidgets(report, auth.user.role) });
  } catch (e) {
    console.error("[reports/suggest]", e);
    return NextResponse.json({ error: "Sage couldn't come up with suggestions just now — try again." }, { status: 500 });
  }
}
