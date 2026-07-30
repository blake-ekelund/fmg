import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/template-send-counts
 *
 * How many times each designed template has been sent — total recipients
 * (`sends`) and number of send jobs (`campaigns`), keyed by template id.
 *
 * Runs with the service role so the count spans every rep's sends, not just the
 * caller's (email_send_jobs is RLS-scoped by account). Only sends made since the
 * block_template_id column shipped are attributable.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("email_send_jobs")
    .select("block_template_id, target_count")
    .not("block_template_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, { sends: number; campaigns: number }> = {};
  for (const row of (data ?? []) as Array<{ block_template_id: string; target_count: number | null }>) {
    const id = row.block_template_id;
    const entry = counts[id] ?? { sends: 0, campaigns: 0 };
    entry.sends += Number(row.target_count) || 0;
    entry.campaigns += 1;
    counts[id] = entry;
  }

  return NextResponse.json({ counts });
}
