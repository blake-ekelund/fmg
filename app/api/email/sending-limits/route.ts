import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { loadSendingLimits } from "@/lib/email/sendingLimits";

export const runtime = "nodejs";

/**
 * GET  /api/email/sending-limits — the account's marketing frequency cap.
 * PATCH /api/email/sending-limits — { perWeek, minGapDays }; owners/admins.
 *
 * Enforced by the automations cron (lib/automations/overlap.ts). `stored`
 * is false until migration 20260924010000 adds the columns; the cron uses the
 * same defaults meanwhile, and saving reports the pending migration.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(await loadSendingLimits());
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabaseServer.from("profiles").select("access").eq("id", user.id).maybeSingle();
  const access = (profile?.access as string | null) ?? null;
  if (access !== "owner" && access !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change sending limits." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { perWeek?: unknown; minGapDays?: unknown } | null;
  const perWeek = Number(body?.perWeek);
  const minGapDays = Number(body?.minGapDays);
  if (!Number.isInteger(perWeek) || perWeek < 0 || perWeek > 50) {
    return NextResponse.json({ error: "Emails per week must be a whole number from 0 to 50." }, { status: 400 });
  }
  if (!Number.isInteger(minGapDays) || minGapDays < 0 || minGapDays > 30) {
    return NextResponse.json({ error: "Days between emails must be a whole number from 0 to 30." }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("email_settings")
    .update({ marketing_per_week: perWeek, marketing_min_gap_days: minGapDays, updated_by: user.id })
    .eq("id", true);
  if (error) {
    const pending = /marketing_per_week|marketing_min_gap_days|column/i.test(error.message);
    return NextResponse.json(
      {
        error: pending
          ? "Saving needs database migration 20260924010000 (run `npx supabase db push`). Until then the defaults (3 a week, 2 days apart) apply."
          : error.message,
      },
      { status: pending ? 409 : 500 },
    );
  }
  return NextResponse.json({ perWeek, minGapDays, stored: true });
}
