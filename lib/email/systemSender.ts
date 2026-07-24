import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Resolve the mailbox that automated email sends from.
 *
 * User-initiated sends never come here — those resolve the sender from the
 * logged-in user (see getAccessTokenForUser). This is only for mail with no
 * human behind it: the automations cron when the automation has no
 * sender_user_id, the Fishbowl digest, and storefront order notifications.
 *
 * Order of preference:
 *   1. The mailbox an admin designated in Settings → Email connection.
 *   2. The oldest connected mailbox, ordered by connected_at.
 *
 * (2) is a safety net, not a design: it exists so a fresh install still sends
 * before anyone has chosen. It is deliberately ordered — the previous
 * `.limit(1)` with no ORDER BY returned an arbitrary row, so company mail
 * could change sender between runs as mailboxes were connected.
 *
 * Returns null when no mailbox is connected at all; callers should skip the
 * send rather than throw.
 */
export async function resolveSystemSenderUserId(): Promise<string | null> {
  const { data: settings } = await supabaseServer
    .from("email_settings")
    .select("system_sender_user_id")
    .maybeSingle();

  const designated = (settings?.system_sender_user_id as string | null) ?? null;

  if (designated) {
    // Only honour the choice while that mailbox is still usable — an admin can
    // disconnect Outlook long after being named here.
    const { data: acct } = await supabaseServer
      .from("user_email_accounts")
      .select("user_id")
      .eq("user_id", designated)
      .eq("status", "connected")
      .maybeSingle();
    if (acct?.user_id) return acct.user_id as string;
  }

  const { data: fallback } = await supabaseServer
    .from("user_email_accounts")
    .select("user_id")
    .eq("status", "connected")
    .order("connected_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback?.user_id as string | null) ?? null;
}
