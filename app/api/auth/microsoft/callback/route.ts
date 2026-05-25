import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyState } from "@/lib/email/state";
import {
  exchangeCodeForTokens,
  getMe,
  GRAPH_SCOPES,
} from "@/lib/email/microsoft";
import { encryptToken } from "@/lib/email/crypto";
import {
  createSubscription,
  generateClientState,
} from "@/lib/email/subscriptions";
import { publicOriginFromRequest } from "@/lib/email/origin";

export const runtime = "nodejs";

/**
 * GET /api/auth/microsoft/callback
 *
 * Microsoft redirects here after the user consents. We verify the signed
 * state, exchange the code for tokens, fetch the user's mailbox identity from
 * Graph, encrypt the refresh token, and upsert into user_email_accounts.
 *
 * On success: redirect to /settings?outlook=connected
 * On failure: redirect to /settings?section=email-connection&outlook=error&reason=...
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const back = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/settings?section=email-connection&outlook=error&reason=${encodeURIComponent(reason)}`,
        url.origin,
      ),
    );

  if (oauthError) {
    return back(errorDescription || oauthError);
  }
  if (!code || !state) {
    return back("Missing code or state");
  }

  const payload = verifyState(state);
  if (!payload) {
    return back("Invalid or expired state token");
  }

  const publicOrigin = publicOriginFromRequest(request);
  const redirectUri = `${publicOrigin}/api/auth/microsoft/callback`;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (e) {
    return back(e instanceof Error ? e.message : String(e));
  }

  let me;
  try {
    me = await getMe(tokens.access_token);
  } catch (e) {
    return back(e instanceof Error ? e.message : String(e));
  }

  const mailbox = me.mail || me.userPrincipalName;
  if (!mailbox) {
    return back("Microsoft account has no mail address");
  }

  const encrypted = encryptToken(tokens.refresh_token);
  const scopes = (tokens.scope || GRAPH_SCOPES.join(" ")).split(/\s+/).filter(Boolean);

  const { error: upsertErr } = await supabaseServer
    .from("user_email_accounts")
    .upsert(
      {
        user_id: payload.uid,
        microsoft_user_id: me.id,
        email: mailbox,
        display_name: me.displayName,
        refresh_token_encrypted: encrypted,
        scopes,
        status: "connected",
        last_error: null,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    return back(`Failed to save account: ${upsertErr.message}`);
  }

  // publicOrigin was already computed above for the redirect_uri. Reuse it
  // for the webhook URL too.
  const webhookUrl = `${publicOrigin}/api/email/webhook`;
  const canSubscribe = webhookUrl.startsWith("https://");
  let subscribeNote: string;

  if (!canSubscribe) {
    subscribeNote = `Webhook skipped: origin ${publicOrigin} isn't https — inbound replies won't sync until reconnected from a public URL.`;
  } else {
    try {
      const clientState = generateClientState();
      const sub = await createSubscription(tokens.access_token, webhookUrl, clientState);
      await supabaseServer
        .from("user_email_accounts")
        .update({
          subscription_id: sub.id,
          subscription_expires_at: sub.expirationDateTime,
          subscription_client_state: clientState,
          last_error: null,
        })
        .eq("user_id", payload.uid);
      subscribeNote = `OK · subscribed at ${webhookUrl} · sub ${sub.id} · expires ${sub.expirationDateTime}`;
    } catch (e) {
      subscribeNote = `Webhook subscribe failed for ${webhookUrl}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Always record the subscribeNote so we can see what happened on reconnect.
  // (The success path also overwrites last_error to null above.)
  await supabaseServer
    .from("user_email_accounts")
    .update({ last_error: subscribeNote })
    .eq("user_id", payload.uid);

  return NextResponse.redirect(
    new URL(`/settings?section=email-connection&outlook=connected`, url.origin),
  );
}
