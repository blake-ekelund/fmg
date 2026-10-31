import { NextResponse } from "next/server";
import { normalizeWidgets, runReport } from "@/lib/reports/run";
import { requireReportsUser } from "@/lib/reports/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/reports/preview — run an unsaved widget list (a starter template
 * before it's saved). Body: { widgets }. Returns { widgets, results } under the
 * caller's role.
 */
export async function POST(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const body = (await request.json().catch(() => ({}))) as { widgets?: unknown };
  try {
    const widgets = normalizeWidgets(body.widgets ?? []);
    return NextResponse.json({ widgets, results: await runReport(widgets, auth.user.role) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't run the report." }, { status: 400 });
  }
}
