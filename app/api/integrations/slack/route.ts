import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { slackConfigured } from "@/lib/slack";
import { assistantConfigured } from "@/lib/assistant/agent";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack — status for the Slack card on /integrations.
 *
 * Reports whether the Slack connection and the assistant's LLM key are
 * configured (server-only env checks the browser can't do), plus a little
 * recent-activity summary from the slack_events audit log.
 *
 * Auth: any internal FMG user (Bearer access token).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let lastActivityAt: string | null = null;
  let answeredCount: number | null = null;

  // Most recent answered question.
  const { data: last, error: lastErr } = await supabaseServer
    .from("slack_events")
    .select("created_at")
    .eq("authorized", true)
    .not("answer", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If the table isn't migrated yet, treat activity as simply unknown.
  if (!lastErr) {
    lastActivityAt = (last as { created_at: string } | null)?.created_at ?? null;

    const { count } = await supabaseServer
      .from("slack_events")
      .select("*", { count: "exact", head: true })
      .eq("authorized", true)
      .not("answer", "is", null);
    answeredCount = count ?? 0;
  }

  return NextResponse.json({
    connected: slackConfigured(),
    assistantReady: assistantConfigured(),
    lastActivityAt,
    answeredCount,
  });
}
