import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * Which mailbox automated email (automations without an owner, the Fishbowl
 * digest, storefront order notifications) sends from.
 *
 * Admin-only: this decides whose address the company's automated mail carries,
 * so it isn't a personal preference.
 */

async function requireAdmin(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("access")
    .eq("id", user.id)
    .maybeSingle();

  const access = (profile?.access as string | null) ?? null;
  if (access !== "owner" && access !== "admin") {
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const [{ data: settings }, { data: accounts }] = await Promise.all([
    supabaseServer.from("email_settings").select("system_sender_user_id").maybeSingle(),
    supabaseServer
      .from("user_email_accounts")
      .select("user_id, email, display_name, status, connected_at")
      .eq("status", "connected")
      // Same ordering the resolver falls back to, so the UI can show which
      // mailbox would be used when nothing is designated.
      .order("connected_at", { ascending: true }),
  ]);

  const mailboxes = (accounts ?? []).map((a) => ({
    user_id: a.user_id as string,
    email: a.email as string,
    display_name: (a.display_name as string | null) ?? null,
    connected_at: a.connected_at as string,
  }));

  const designated = (settings?.system_sender_user_id as string | null) ?? null;
  // Mirror the resolver: a designated mailbox that has since disconnected is
  // not what mail actually goes out from.
  const effective =
    (designated && mailboxes.some((m) => m.user_id === designated) ? designated : null) ??
    mailboxes[0]?.user_id ??
    null;

  return NextResponse.json({
    designated_user_id: designated,
    effective_user_id: effective,
    is_fallback: designated !== effective,
    mailboxes,
  });
}

export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  let body: { user_id?: string | null };
  try {
    body = (await request.json()) as { user_id?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.user_id ?? null;

  // null clears the setting and returns to the ordered fallback.
  if (userId) {
    const { data: acct } = await supabaseServer
      .from("user_email_accounts")
      .select("user_id")
      .eq("user_id", userId)
      .eq("status", "connected")
      .maybeSingle();
    if (!acct) {
      return NextResponse.json(
        { error: "That user has no connected Outlook mailbox." },
        { status: 400 },
      );
    }
  }

  const { error } = await supabaseServer
    .from("email_settings")
    .update({ system_sender_user_id: userId, updated_by: gate.user.id })
    .eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, designated_user_id: userId });
}
