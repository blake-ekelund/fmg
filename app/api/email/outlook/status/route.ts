import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/outlook/status
 * Returns the current user's mailbox connection status, or
 * { connected: false } if they haven't connected one yet.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("user_email_accounts")
    .select("email, display_name, status, last_error, connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.status === "disconnected") {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: data.email,
    displayName: data.display_name,
    status: data.status,
    lastError: data.last_error,
    connectedAt: data.connected_at,
  });
}
