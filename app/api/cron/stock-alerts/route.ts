import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { processStockAlerts } from "@/lib/stockAlerts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/stock-alerts
 *
 * Emails shoppers whose back-in-stock alert product is available again (see
 * lib/stockAlerts.ts). Hourly in vercel.json; staff can also trigger it by
 * hand. Safe to overlap — each alert is claimed before its email goes out.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCronCall = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCronCall) {
    const user = await requireInternalUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processStockAlerts();
  return NextResponse.json(result);
}
