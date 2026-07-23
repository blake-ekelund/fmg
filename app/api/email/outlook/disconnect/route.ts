import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * POST /api/email/outlook/disconnect
 * Marks the user's mailbox row as disconnected and clears the refresh token.
 *
 * We do NOT revoke the consent on Microsoft's side — the user can do that at
 * https://myapps.microsoft.com if they want.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabaseServer
    .from("user_email_accounts")
    .update({
      status: "disconnected",
      refresh_token_encrypted: "",
      disconnected_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
