import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type ReorderBody = {
  /** Step ids in their new order, first to last. Must be the complete set. */
  order?: string[];
};

/**
 * POST /api/automations/:id/steps/reorder
 *
 * automation_steps has `unique (automation_id, step_order)`, so writing the new
 * positions directly collides the moment two steps swap — the first update
 * lands on a number the second still holds. This parks every row on a negative
 * order first (negatives can't collide with the 1..n range), then writes the
 * final positions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let body: ReorderBody;
  try {
    body = (await request.json()) as ReorderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const order = body.order ?? [];
  if (order.length === 0) {
    return NextResponse.json({ error: "order is required" }, { status: 400 });
  }

  // The order must name exactly the steps this automation has — no additions,
  // omissions or ids borrowed from another automation.
  const { data: existing, error: readErr } = await supabaseServer
    .from("automation_steps")
    .select("id")
    .eq("automation_id", id);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const have = new Set((existing ?? []).map((s) => (s as { id: string }).id));
  const want = new Set(order);
  if (have.size !== want.size || [...want].some((sid) => !have.has(sid))) {
    return NextResponse.json(
      { error: "order must list exactly this automation's steps" },
      { status: 400 },
    );
  }

  // Pass 1 — park on negatives so the 1..n range is free.
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabaseServer
      .from("automation_steps")
      .update({ step_order: -(i + 1) })
      .eq("id", order[i])
      .eq("automation_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pass 2 — final positions.
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabaseServer
      .from("automation_steps")
      .update({ step_order: i + 1 })
      .eq("id", order[i])
      .eq("automation_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: steps, error: finalErr } = await supabaseServer
    .from("automation_steps")
    .select("id, step_order, template_id, delay_days")
    .eq("automation_id", id)
    .order("step_order", { ascending: true });
  if (finalErr) return NextResponse.json({ error: finalErr.message }, { status: 500 });

  return NextResponse.json({ steps: steps ?? [] });
}
