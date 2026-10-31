import { NextResponse } from "next/server";
import { runDueReports } from "@/lib/reports/deliver";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/reports
 *
 * Emails every scheduled custom report whose send time has passed (see
 * lib/reports/deliver.ts). Every 15 minutes in vercel.json — report times snap
 * to the quarter hour. Cron-secret only: a manual trigger would email the whole
 * schedule (a report's "Email me a copy" button covers testing). Safe to
 * overlap — each report is claimed before it's sent.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDueReports());
}
