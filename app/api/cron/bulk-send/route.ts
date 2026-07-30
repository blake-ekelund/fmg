import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { processBulkSendJobs } from "@/lib/email/bulkSend";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Leave headroom under maxDuration to finish the in-flight chunk + bookkeeping. */
const WORK_BUDGET_MS = 250_000;

/**
 * GET /api/cron/bulk-send
 *
 * Drains queued bulk-send jobs (transport='resend') for up to ~250s, then
 * stops; the next tick continues where this one left off. Scheduled every
 * 5 minutes in vercel.json, and also kicked immediately by the enqueue
 * endpoint so a fresh blast starts within seconds.
 *
 * Overlapping runs (cron + kick) are safe — recipient claims are atomic.
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

  const result = await processBulkSendJobs(Date.now() + WORK_BUDGET_MS);
  return NextResponse.json(result);
}
