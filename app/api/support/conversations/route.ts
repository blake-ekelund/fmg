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
  // Deliberately narrow. "does not exist" on its own also fires for a missing
  // COLUMN, and reporting that as "run the migration" sends someone to re-run
  // a migration that already ran while the real cause — a column added to the
  // file after it was applied — stays invisible. Match the relation, not the
  // phrase.
  return (
    /relation \"?[a-z_.]*support_(conversations|messages)\"? does not exist/i.test(
      message
    ) || /schema cache/i.test(message)
  );
}

const MIGRATION_HINT =
  "the support_conversations table is missing — run supabase/migrations/20260909010000_support_conversations.sql";

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "all";
  const store = params.get("store") ?? "all";

  const BASE_COLS =
    "id, store, session_key, profile_id, email, name, channel, status, assigned_to, subject, entry_preset, message_count, last_message_at, agent_unread, page_url, created_at";

  type Row = Record<string, unknown> & { assigned_to: string | null };
  type Result = { data: Row[] | null; error: { message: string } | null; count?: number | null };

  // A resolved ticket stays on the board for this long, then it's archived.
  // Derived, not moved: nothing has to run for a ticket to "move".
  const HANDLED_ON_BOARD_MS = 12 * 60 * 60_000;
  const handledCutoff = new Date(Date.now() - HANDLED_ON_BOARD_MS).toISOString();

  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  // Search goes into a PostgREST .or() string, so keep only characters that
  // can't break out of it.
  const q = (params.get("q") ?? "").replace(/[^\w@.+\- ]/g, " ").trim().slice(0, 80);

  /**
   * One query. `resolution` says whether this column set includes the
   * resolution columns (migration 20261114050000); without them the
   * handled/archive split falls back to last activity.
   */
  const one = (
    cols: string,
    resolution: boolean,
    opts: { only?: string | null; limit: number; handled?: "recent" | "archive" },
  ) => {
    const when = resolution ? "resolved_at" : "last_message_at";
    let query = supabaseServer
      .from("support_conversations")
      .select(cols, opts.handled === "archive" ? { count: "exact" } : undefined)
      .order(opts.handled ? when : "last_message_at", { ascending: false, nullsFirst: false });
    if (opts.only) query = query.eq("status", opts.only);
    if (opts.handled === "recent") query = query.gte(when, handledCutoff);
    if (opts.handled === "archive") {
      query = resolution
        ? query.or(`resolved_at.lt.${handledCutoff},resolved_at.is.null`)
        : query.lt("last_message_at", handledCutoff);
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          ["subject", "email", "name", ...(resolution ? ["resolution", "phone"] : [])]
            .map((c) => `${c}.ilike.${like}`)
            .join(","),
        );
      }
    }
    if (store === "sassy" || store === "ni") {
      query = query.eq("store", store);
    }
    return opts.handled === "archive"
      ? query.range(offset, offset + opts.limit - 1).returns<Row[]>()
      : query.limit(opts.limit).returns<Row[]>();
  };

  // `status=board` is the kanban: each column fetched on its own, so a busy
  // day of AI-handled chats can't push an escalated one off the board the way
  // a single newest-200 list would. "Issue handled" only holds the last 12h.
  // `status=archive` is everything resolved before that, paged + searchable.
  const BOARD_LIMITS: Record<(typeof STATUSES)[number], number> = {
    bot: 60,
    needs_human: 150,
    human: 150,
    closed: 60,
  };
  const run = async (cols: string, resolution: boolean): Promise<Result> => {
    if (status === "board") {
      const parts = await Promise.all(
        STATUSES.map((s) =>
          one(cols, resolution, {
            only: s,
            limit: BOARD_LIMITS[s],
            handled: s === "closed" ? "recent" : undefined,
          }),
        ),
      );
      const failed = parts.find((p) => p.error);
      if (failed) return { data: null, error: failed.error };
      return { data: parts.flatMap((p) => p.data ?? []), error: null };
    }
    if (status === "archive") {
      return one(cols, resolution, { only: "closed", limit: 100, handled: "archive" });
    }
    const only = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : null;
    return one(cols, resolution, { only, limit: 200 });
  };

  // Newer columns arrive with later migrations (photos/refund: 20261114030000,
  // phone: 20261114040000, resolution: 20261114050000). Try the widest set
  // first and step back to what the database has, so the inbox loads at
  // every stage.
  const COL_SETS: [string, boolean][] = [
    [`${BASE_COLS}, has_attachments, refund_requested, phone, resolved_at, resolved_by, resolution, customer_resolved, csat_rating, csat_comment, csat_agent_id`, true],
    [`${BASE_COLS}, has_attachments, refund_requested, phone, resolved_at, resolved_by, resolution`, true],
    [`${BASE_COLS}, has_attachments, refund_requested, phone`, false],
    [`${BASE_COLS}, has_attachments, refund_requested`, false],
    [BASE_COLS, false],
  ];
  let { data, error, count } = await run(...COL_SETS[0]);
  for (const set of COL_SETS.slice(1)) {
    if (!error || tableMissing(error.message)) break;
    ({ data, error, count } = await run(...set));
  }
  if (error) {
    if (tableMissing(error.message)) {
      return NextResponse.json({ conversations: [], agents: {}, notReady: true, hint: MIGRATION_HINT });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve assignee names in one round trip rather than a join per row —
  // the same handful of people own most of the queue.
  const ids = Array.from(
    new Set((data ?? []).flatMap((r) => [r.assigned_to, r.csat_agent_id as string | null | undefined]).filter(Boolean))
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
    ...(status === "archive" ? { total: count ?? null, offset } : {}),
    ...(status === "board" ? { ratings: await repRatings() } : {}),
    notReady: false,
  });
}

/**
 * Rep scorecard for the board: average stars per rep over the last 90 days,
 * from the survey customers fill in after saying "yes, it's resolved".
 * Empty before migration 20261114060000.
 */
async function repRatings(): Promise<{ agentId: string; name: string; avg: number; count: number }[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabaseServer
    .from("support_conversations")
    .select("csat_agent_id, csat_rating")
    .not("csat_rating", "is", null)
    .gte("csat_at", since)
    .limit(2000);
  if (error || !data?.length) return [];

  const by = new Map<string, { sum: number; count: number }>();
  for (const r of data as { csat_agent_id: string | null; csat_rating: number }[]) {
    if (!r.csat_agent_id) continue;
    const t = by.get(r.csat_agent_id) ?? { sum: 0, count: 0 };
    t.sum += r.csat_rating;
    t.count += 1;
    by.set(r.csat_agent_id, t);
  }
  if (!by.size) return [];
  const { data: people } = await supabaseServer
    .from("profiles")
    .select("id, first_name, email")
    .in("id", Array.from(by.keys()));
  const names = new Map(
    ((people ?? []) as { id: string; first_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.first_name?.trim() || p.email?.split("@")[0] || "Team",
    ]),
  );
  return Array.from(by.entries())
    .map(([agentId, t]) => ({
      agentId,
      name: names.get(agentId) ?? "Team",
      avg: Math.round((t.sum / t.count) * 10) / 10,
      count: t.count,
    }))
    .sort((a, b) => b.count - a.count);
}
