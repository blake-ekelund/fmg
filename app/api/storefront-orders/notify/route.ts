import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/storefront-orders/notify
 *
 * Internal relay so the storefronts can send an ops email through the team's
 * connected Outlook account (Microsoft Graph) instead of standing up their
 * own mail provider. The storefront builds the subject + HTML and posts it
 * here with the shared secret; we send it from the first connected mailbox
 * (same path as the digest/automations crons).
 *
 * The recipient is FIXED here — never taken from the request — so a leaked
 * secret can only ever generate an email to Blake, not to arbitrary people.
 * Set STOREFRONT_NOTIFY_SECRET to the same value on this project and on the
 * storefront project.
 */

const NOTIFY_TO = "blake.ekelund@fragrancemarketinggroup.com";

export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_NOTIFY_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    html?: string;
  };
  const subject = body.subject?.trim();
  const html = body.html;
  if (!subject || !html) {
    return NextResponse.json(
      { error: "subject and html are required" },
      { status: 400 },
    );
  }

  // Sender: first connected Outlook account (same fallback as the crons).
  const { data: acct } = await supabaseServer
    .from("user_email_accounts")
    .select("user_id")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  const senderUserId = (acct?.user_id as string | null) ?? null;
  if (!senderUserId) {
    return NextResponse.json(
      { error: "No connected Outlook account to send from (Settings → Email)." },
      { status: 500 },
    );
  }

  try {
    const { accessToken } = await getAccessTokenForUser(senderUserId);
    await sendEmail(accessToken, {
      subject,
      bodyHtml: html,
      to: [{ address: NOTIFY_TO, name: "Blake Ekelund" }],
    });
    return NextResponse.json({ sent: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
