import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/support/conversations
 *
 * The Customer Service inbox: every chat conversation from the storefronts,
 * newest activity first. The list carries just enough to triage — who, when,
 * what they opened with, whether a person is needed — and the thread itself is
 * loaded per-conversation.
 *
 * Query: ?status=all|bot|needs_human|human|closed  &store=all|sassy|ni
 */

const STATUSES = ["bot", "needs_human", "human", "closed"] as const;

function tableMissing(message: string): boolean {
  return /schema cache|does not exist/i.test(message);
}

const MIGRATION_HINT =
  "the support_conversations table is missing — run supabase/migrations/20260909010000_support_conversations.sql";

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "all";
  const store = params.get("store") ?? "all";

  let query = supabaseServer
    .from("support_conversations")
    .select(
      "id, store, session_key, profile_id, email, name, channel, status, assigned_to, subject, entry_preset, message_count, last_message_at, agent_unread, page_url, created_at"
    )
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (STATUSES.includes(status as (typeof STATUSES)[number])) {
    query = query.eq("status", status);
  }
  if (store === "sassy" || store === "ni") {
    query = query.eq("store", store);
  }

  const { data, error } = await query;
  if (error) {
    if (tableMissing(error.message)) {
      return NextResponse.json({ conversations: [], agents: {}, notReady: true, hint: MIGRATION_HINT });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve assignee names in one round trip rather than a join per row —
  // the same handful of people own most of the queue.
  const ids = Array.from(
    new Set((data ?? []).map((r) => r.assigned_to).filter(Boolean))
  ) as string[];
  const agents: Record<string, string> = {};
  if (ids.length) {
    const { data: people } = await supabaseServer
      .from("profiles")
      .select("id, first_name, email")
      .in("id", ids);
    for (const p of people ?? []) {
      agents[p.id as string] =
        (p.first_name as string | null)?.trim() ||
        (p.email as string | null)?.split("@")[0] ||
        "Team";
    }
  }

  return NextResponse.json({
    conversations: data ?? [],
    agents,
    notReady: false,
  });
}
