import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { ensureSettlementTasks } from "@/lib/amazonSettlementStore";

export const runtime = "nodejs";

/**
 * GET /api/cron/amazon-settlement-tasks
 *
 * Daily in vercel.json: when an Amazon settlement's deposit date arrives and
 * the settlement hasn't been uploaded to Accounting → Amazon Payments, adds a
 * task for Julie (once per period; see ensureSettlementTasks). Uploading the
 * settlement ticks the task off. Staff can also trigger it by hand.
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

  // "Today" in Eastern time — the deposit date is a calendar day.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  try {
    return NextResponse.json({ today, ...(await ensureSettlementTasks(today)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
