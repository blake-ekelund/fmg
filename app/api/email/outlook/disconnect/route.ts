import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { deleteSubscription } from "@/lib/email/subscriptions";

export const runtime = "nodejs";

/**
 * POST /api/email/outlook/disconnect
 * Deletes the Graph webhook subscription, marks the user's mailbox row as
 * disconnected, and clears the refresh token.
 *
 * We do NOT revoke the consent on Microsoft's side — the user can do that at
 * https://myapps.microsoft.com if they want.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Try to delete the Graph subscription first while the refresh token is
  // still usable. Failures here are non-fatal — we still mark disconnected.
  const { data: account } = await supabaseServer
    .from("user_email_accounts")
    .select("subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (account?.subscription_id && account.status !== "disconnected") {
    try {
      const { accessToken } = await getAccessTokenForUser(user.id);
      await deleteSubscription(accessToken, account.subscription_id);
    } catch {
      // Best effort — the subscription will expire on Graph's side anyway.
    }
  }

  const { error } = await supabaseServer
    .from("user_email_accounts")
    .update({
      status: "disconnected",
      refresh_token_encrypted: "",
      subscription_id: null,
      subscription_expires_at: null,
      subscription_client_state: null,
      disconnected_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
