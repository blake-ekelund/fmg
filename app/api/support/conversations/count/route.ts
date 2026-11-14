import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/support/conversations/count
 *
 * The badge on the top-bar Customer Service icon: outstanding customer items,
 * meaning everything a person owns and hasn't finished. That's "Sent to a
 * human" (needs_human, nobody has it yet) plus "Human helping" (human, in
 * progress). AI-handled and handled chats don't count. `latestEscalation` is
 * the newest waiting ticket, which lets the client pop an alert when a new
 * one appears. Head-only counts, plus one tiny row.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [needs, helping, newest] = await Promise.all([
    supabaseServer
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_human"),
    supabaseServer
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "human"),
    supabaseServer
      .from("support_conversations")
      .select("id, store, subject, name, email")
      .eq("status", "needs_human")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Table not there yet (or any read error): a badge of nothing, not an error.
  const needsHuman = needs.error ? 0 : needs.count ?? 0;
  const inProgress = helping.error ? 0 : helping.count ?? 0;

  return NextResponse.json(
    {
      needsHuman,
      inProgress,
      outstanding: needsHuman + inProgress,
      latestEscalation: newest.error ? null : newest.data ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
