import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/inbound-health
 *
 * Is inbound mail actually being ingested right now?
 *
 * The guard rail behind the reply-based automation rules. Inbound depends on a
 * live Graph webhook subscription; if that lapses — or the app is redeployed
 * without https, or the subscription silently expires — a "remove the customer
 * if they reply" rule doesn't error, it just never fires. Worse, a "no reply
 * after N days" rule starts exiting *everyone*, because from the runner's point
 * of view nobody ever replies.
 *
 * The UI reads this to disable those rules rather than let them misreport.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // A live subscription that hasn't expired is the necessary condition.
  const { data: accounts, error: acctErr } = await supabaseServer
    .from("user_email_accounts")
    .select("subscription_id, subscription_expires_at, status")
    .eq("status", "connected");

  if (acctErr) {
    // Missing columns mean the restore migration hasn't been applied.
    return NextResponse.json({
      healthy: false,
      reason: /column|does not exist/i.test(acctErr.message)
        ? "Inbound ingestion isn't set up — the email subscription migration hasn't been applied."
        : acctErr.message,
      everReceived: false,
      activeSubscriptions: 0,
    });
  }

  const now = Date.now();
  const active = ((accounts ?? []) as Array<{
    subscription_id: string | null;
    subscription_expires_at: string | null;
  }>).filter(
    (a) =>
      !!a.subscription_id &&
      (!a.subscription_expires_at || new Date(a.subscription_expires_at).getTime() > now),
  );

  // Has anything inbound ever landed? Distinguishes "set up but quiet" from
  // "set up but broken".
  const { data: received } = await supabaseServer
    .from("email_messages")
    .select("id")
    .eq("direction", "received")
    .limit(1);
  const everReceived = (received ?? []).length > 0;

  const healthy = active.length > 0;
  return NextResponse.json({
    healthy,
    everReceived,
    activeSubscriptions: active.length,
    reason: healthy
      ? null
      : (accounts ?? []).length === 0
        ? "No mailbox is connected, so no inbound mail can be received."
        : "No live Graph subscription — reconnect the mailbox from the public https URL to resume inbound sync.",
  });
}
