import { NextResponse } from "next/server";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/fishbowl-tasks
 *
 * Keeps the task list in sync with sales orders that still need to be keyed
 * into Fishbowl. Runs every 15 min (vercel.json):
 *   • CREATE — one task per order that needs entry and doesn't already have an
 *     open auto-task (owner Blake, High priority).
 *   • REMOVE — delete the auto-task once its order is entered or cancelled.
 *
 * Orders live in the wholesale Supabase project; tasks live in the FMG
 * project — so this reconcile is the join. `tasks.fishbowl_order_id` is the
 * dedup key and also scopes every write to auto-tasks only: human-created
 * tasks (null marker) are never touched. `?dry=1` reports the diff without
 * writing.
 */

// The task list stores owner as profiles.first_name (free text). "Blake" for
// now — change here to reassign.
const TASK_OWNER = "Blake";

type AutoTask = { id: string; fishbowl_order_id: string };

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const wholesale = wholesalePortalAdmin();
  if (!wholesale) {
    return NextResponse.json(
      { error: "Wholesale portal not connected (WHOLESALE_SUPABASE_URL / SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  // Orders that still need Fishbowl entry (not entered, not cancelled).
  const { data: orderData, error: orderErr } = await wholesale
    .from("orders")
    .select("id, number, store, fishbowl_entered_at, status")
    .is("fishbowl_entered_at", null);
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }
  const needs = ((orderData ?? []) as StorefrontOrder[]).filter(
    (o) => o.status !== "cancelled",
  );
  const needById = new Map(needs.map((o) => [o.id, o]));

  // Open auto-tasks (carry the marker). Missing column = migration not run.
  const { data: taskData, error: taskErr } = await supabaseServer
    .from("tasks")
    .select("id, fishbowl_order_id")
    .not("fishbowl_order_id", "is", null)
    .neq("status", "done");
  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }
  const openTasks = (taskData ?? []) as AutoTask[];
  const haveTaskFor = new Set(openTasks.map((t) => t.fishbowl_order_id));

  const toCreate = needs.filter((o) => !haveTaskFor.has(o.id));
  const toRemove = openTasks.filter((t) => !needById.has(t.fishbowl_order_id));

  if (dry) {
    return NextResponse.json({
      dry: true,
      needs: needs.length,
      openTasks: openTasks.length,
      create: toCreate.map((o) => orderRef(o)),
      remove: toRemove.map((t) => t.fishbowl_order_id),
    });
  }

  let created = 0;
  let removed = 0;

  if (toCreate.length > 0) {
    const rows = toCreate.map((o) => ({
      name: `Enter ${orderRef(o)} into Fishbowl`,
      description: "Storefront sales order awaiting entry into Fishbowl.",
      owner: TASK_OWNER,
      priority: "High",
      status: "todo" as const,
      completed: false,
      fishbowl_order_id: o.id,
    }));
    const { error } = await supabaseServer.from("tasks").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    created = rows.length;
  }

  if (toRemove.length > 0) {
    // Hard-delete: these are system reminders, and the order's
    // fishbowl_entered_at is the lasting record. Scoped to auto-tasks only.
    const { error } = await supabaseServer
      .from("tasks")
      .delete()
      .in(
        "id",
        toRemove.map((t) => t.id),
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    removed = toRemove.length;
  }

  return NextResponse.json({ created, removed, openTasks: needs.length });
}
