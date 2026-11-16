import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * Hand-set On Order for a SKU, from the Inventory forecast table.
 *
 *   PUT    { part, units }  set it (sticky: survives Fishbowl syncs and uploads)
 *   DELETE { part }         reset to Fishbowl's own figure
 *
 * Both also update the part's row in the newest snapshot, so the change shows
 * everywhere at once. Future snapshots get the typed figure via
 * lib/onOrderOverrides (called by the Fishbowl sync and the manual upload).
 */

const NOT_READY =
  "On Order overrides need migration 20261116000000_inventory_on_order_overrides.sql to be applied first.";

function tableMissing(msg: string) {
  return /inventory_on_order_overrides|schema cache|does not exist/i.test(msg);
}

async function latestSnapshotRow(part: string) {
  const { data: upload } = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!upload) return null;
  const { data } = await supabaseServer
    .from("inventory_snapshot_items")
    .select("id, on_order")
    .eq("upload_id", upload.id)
    .eq("part", part)
    .maybeSingle();
  return data as { id: string; on_order: number } | null;
}

function fail(message: string) {
  const missing = tableMissing(message);
  return NextResponse.json({ error: missing ? NOT_READY : message }, { status: missing ? 503 : 500 });
}

export async function PUT(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { part?: string; units?: number };
  const part = String(body.part ?? "").trim();
  const units = Number(body.units);
  if (!part || part.length > 60) return NextResponse.json({ error: "Missing part" }, { status: 400 });
  if (!Number.isFinite(units) || units < 0 || units > 10_000_000) {
    return NextResponse.json({ error: "On Order must be 0 or more" }, { status: 400 });
  }

  const snap = await latestSnapshotRow(part);
  const { data: existing, error: readErr } = await supabaseServer
    .from("inventory_on_order_overrides")
    .select("fishbowl_on_order")
    .eq("part", part)
    .maybeSingle();
  if (readErr) return fail(readErr.message);

  // First override for this part: remember Fishbowl's figure for the reset.
  const fishbowl = existing ? existing.fishbowl_on_order : (snap?.on_order ?? null);
  const { error } = await supabaseServer.from("inventory_on_order_overrides").upsert(
    {
      part,
      units: Math.round(units),
      fishbowl_on_order: fishbowl,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "part" },
  );
  if (error) return fail(error.message);

  if (snap) {
    await supabaseServer.from("inventory_snapshot_items").update({ on_order: Math.round(units) }).eq("id", snap.id);
  }
  return NextResponse.json({ ok: true, fishbowl });
}

export async function DELETE(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { part?: string };
  const part = String(body.part ?? "").trim();
  if (!part) return NextResponse.json({ error: "Missing part" }, { status: 400 });

  const { data: existing, error: readErr } = await supabaseServer
    .from("inventory_on_order_overrides")
    .select("fishbowl_on_order")
    .eq("part", part)
    .maybeSingle();
  if (readErr) return fail(readErr.message);

  const { error } = await supabaseServer.from("inventory_on_order_overrides").delete().eq("part", part);
  if (error) return fail(error.message);

  const restored = existing?.fishbowl_on_order != null ? Number(existing.fishbowl_on_order) : null;
  const snap = await latestSnapshotRow(part);
  if (snap && restored !== null) {
    await supabaseServer.from("inventory_snapshot_items").update({ on_order: restored }).eq("id", snap.id);
  }
  return NextResponse.json({ ok: true, onOrder: restored ?? snap?.on_order ?? 0 });
}

/** GET → { overrides: [{ part, units, fishbowl_on_order }] } ([] before the migration). */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data, error } = await supabaseServer
    .from("inventory_on_order_overrides")
    .select("part, units, fishbowl_on_order");
  if (error) return NextResponse.json({ overrides: [], note: tableMissing(error.message) ? NOT_READY : error.message });
  return NextResponse.json(
    { overrides: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
