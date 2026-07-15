import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { publicOriginFromRequest } from "@/lib/email/origin";

export const runtime = "nodejs";

/**
 * POST /api/portal/invite  { repId }
 *
 * Internal-only. Provisions a portal login for a rep from the sales_reps roster:
 * sends a Supabase invite email and links the resulting auth user to a profile
 * with access='rep' + rep_agency_code (from the roster). The rep sets a password
 * via the invite link and lands on /portal. Idempotent: re-inviting an existing
 * account just refreshes the profile link.
 */
export async function POST(request: Request) {
  const internal = await requireInternalUser(request);
  if (!internal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { repId?: string };
  try {
    body = (await request.json()) as { repId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repId) return NextResponse.json({ error: "repId is required" }, { status: 400 });

  // Resolve the rep from the roster.
  const { data: rep, error: repErr } = await supabaseServer
    .from("sales_reps")
    .select("id, name, email, agency_code")
    .eq("id", body.repId)
    .maybeSingle();

  if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 });
  if (!rep) return NextResponse.json({ error: "Rep not found" }, { status: 404 });

  const email = (rep.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "This rep has no email on file." }, { status: 400 });
  }
  if (rep.agency_code == null) {
    return NextResponse.json(
      { error: "This rep has no agency code — set one before inviting." },
      { status: 400 },
    );
  }

  const firstName = String(rep.name ?? "").trim().split(/\s+/)[0] || "there";
  const redirectTo = `${publicOriginFromRequest(request)}/auth/reset-password`;

  // 1. Create the auth user via invite email (idempotent — reuse if it exists).
  let userId: string | null = null;
  const invite = await supabaseServer.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (invite.error) {
    const already = /already|registered|exists/i.test(invite.error.message);
    if (!already) {
      return NextResponse.json({ error: invite.error.message }, { status: 500 });
    }
    // Account already exists — find it so we can (re)link the profile.
    const { data: list } = await supabaseServer.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "An account exists for this email but could not be located." },
        { status: 500 },
      );
    }
  } else {
    userId = invite.data.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Could not provision the account." }, { status: 500 });
  }

  // 2. Link the profile: role=rep, scoped to the rep's agency.
  const { error: profErr } = await supabaseServer.from("profiles").upsert(
    {
      id: userId,
      email,
      first_name: firstName,
      access: "rep",
      rep_agency_code: rep.agency_code,
    },
    { onConflict: "id" },
  );

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    invited: !invite.error,
    email,
    message: invite.error
      ? "Account already existed — portal access refreshed."
      : "Invite email sent.",
  });
}
