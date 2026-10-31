import { NextResponse } from "next/server";
import { createReport, listReports, requireReportsUser } from "@/lib/reports/store";

export const runtime = "nodejs";

/**
 * GET  /api/reports — every saved custom report (shared across staff).
 * POST /api/reports — create one. Body: { title, description?, widgets, schedule?, schedule_enabled? }
 */
export async function GET(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const { ready, items } = await listReports();
  return NextResponse.json({ ready, items, me: auth.user.id, myEmail: auth.user.email, role: auth.user.role });
}

export async function POST(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const report = await createReport(auth.user.id, body);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the report." }, { status: 400 });
  }
}
