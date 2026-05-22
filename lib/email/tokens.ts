import { supabaseServer } from "@/lib/supabaseServer";
import { decryptToken, encryptToken } from "./crypto";
import { refreshAccessToken } from "./microsoft";

export type AccountForSend = {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
};

/**
 * Resolve a portal user to a usable Graph access token.
 *
 * Looks up their user_email_accounts row, decrypts the refresh token, mints a
 * fresh access token via the Microsoft token endpoint, and returns both the
 * access token and the account row.
 *
 * If the refresh fails, marks the account as `needs_reconnect` with the error
 * stored on the row, then throws.
 */
export async function getAccessTokenForUser(
  userId: string,
): Promise<{ accessToken: string; account: AccountForSend }> {
  const { data, error } = await supabaseServer
    .from("user_email_accounts")
    .select("id, user_id, email, display_name, refresh_token_encrypted, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load email account: ${error.message}`);
  if (!data) throw new Error("No connected Outlook account for this user");
  if (data.status === "disconnected") {
    throw new Error("Outlook account is disconnected — reconnect in Company → Integrations");
  }
  if (!data.refresh_token_encrypted) {
    throw new Error("Outlook account has no refresh token — reconnect in Company → Integrations");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(data.refresh_token_encrypted);
  } catch (e) {
    throw new Error(
      `Could not decrypt refresh token (key rotated?): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let tokens;
  try {
    tokens = await refreshAccessToken(refreshToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Mark the account so the UI can prompt the user to reconnect.
    await supabaseServer
      .from("user_email_accounts")
      .update({ status: "needs_reconnect", last_error: msg })
      .eq("id", data.id);
    throw new Error(`Token refresh failed: ${msg}`);
  }

  // MS sometimes rotates the refresh token. If a new one came back, store it.
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    await supabaseServer
      .from("user_email_accounts")
      .update({
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", data.id);
  } else {
    await supabaseServer
      .from("user_email_accounts")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", data.id);
  }

  return {
    accessToken: tokens.access_token,
    account: {
      id: data.id,
      user_id: data.user_id,
      email: data.email,
      display_name: data.display_name,
    },
  };
}
