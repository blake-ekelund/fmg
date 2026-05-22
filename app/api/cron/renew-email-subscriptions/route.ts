import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  createSubscription,
  generateClientState,
  renewSubscription,
} from "@/lib/email/subscriptions";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron: GET /api/cron/renew-email-subscriptions
 * Configured in vercel.json to fire every 6 hours.
 *
 * For each connected mailbox whose subscription is expiring in <12 hours
 * (or missing): try to renew it, or create a new one. Vercel adds an
 * Authorization header from CRON_SECRET that we validate.
 */
export async function GET(request: Request) {
  // Vercel sets `Authorization: Bearer <CRON_SECRET>` on cron requests.
  // Outside of cron, only run if the same secret is provided.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const renewSoon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const { data: accounts, error } = await supabaseServer
    .from("user_email_accounts")
    .select("id, user_id, subscription_id, subscription_expires_at")
    .eq("status", "connected");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let renewed = 0;
  let created = 0;
  let failed = 0;

  for (const acct of accounts ?? []) {
    const expiresAt = acct.subscription_expires_at as string | null;
    const subId = acct.subscription_id as string | null;
    const needsAction = !subId || !expiresAt || expiresAt < renewSoon;
    if (!needsAction) continue;

    try {
      const { accessToken } = await getAccessTokenForUser(acct.user_id as string);

      if (subId && expiresAt) {
        try {
          const sub = await renewSubscription(accessToken, subId);
          await supabaseServer
            .from("user_email_accounts")
            .update({ subscription_expires_at: sub.expirationDateTime })
            .eq("id", acct.id);
          renewed++;
          continue;
        } catch {
          // Fall through to recreate (subscription may have already expired).
        }
      }

      const clientState = generateClientState();
      const sub = await createSubscription(accessToken, clientState);
      await supabaseServer
        .from("user_email_accounts")
        .update({
          subscription_id: sub.id,
          subscription_expires_at: sub.expirationDateTime,
          subscription_client_state: clientState,
        })
        .eq("id", acct.id);
      created++;
    } catch (e) {
      failed++;
      await supabaseServer
        .from("user_email_accounts")
        .update({ last_error: e instanceof Error ? e.message : String(e) })
        .eq("id", acct.id);
    }
  }

  return NextResponse.json({
    checked: accounts?.length ?? 0,
    renewed,
    created,
    failed,
  });
}
