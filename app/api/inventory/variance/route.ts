import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  synapseConfigured,
  getSynapseInventoryRows,
  rollUpSynapseInventory,
} from "@/lib/pointb";
import {
  buildVarianceRows,
  sortByMagnitude,
  summarize,
  type FishbowlStock,
} from "@/lib/inventoryVariance";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/inventory/variance — Fishbowl's inventory snapshot against the live
 * Synapse (Point B) count, one row per part.
 *
 * The Fishbowl side is the newest `inventory_snapshot_items` upload, which
 * fishbowl-inventory-sync refreshes 3x daily and which is already scoped to the
 * Point B location group. The Synapse side is read LIVE, so the report always
 * shows the warehouse as it is now — and reports the snapshot's age, because a
 * variance against a stale Fishbowl figure says nothing.
 *
 * Read-only end to end: it writes nothing to either system.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!synapseConfigured()) {
    return NextResponse.json(
      { error: "Point B isn't connected — set SYNAPSE_API_URL, SYNAPSE_USER, SYNAPSE_PASS." },
      { status: 500 },
    );
  }

  try {
    const { data: upload, error: upErr } = await supabaseServer
      .from("inventory_uploads")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!upload) {
      return NextResponse.json(
        { error: "No Fishbowl inventory snapshot on file — run fishbowl-inventory-sync first." },
        { status: 503 },
      );
    }

    // Page through the snapshot: it runs to ~540 parts, above PostgREST's
    // default cap, and .range() without a stable .order() silently drops rows.
    const fishbowl: FishbowlStock[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 20_000; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("inventory_snapshot_items")
        .select("part, description, uom, on_hand, available, allocated")
        .eq("upload_id", upload.id)
        .order("part", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as FishbowlStock[];
      fishbowl.push(...page);
      if (page.length < PAGE) break;
    }

    const synapseRows = await getSynapseInventoryRows();
    const synapse = rollUpSynapseInventory(synapseRows);

    const rows = sortByMagnitude(buildVarianceRows(fishbowl, synapse));
    const snapshotAgeHours =
      (Date.now() - new Date(upload.created_at as string).getTime()) / 3_600_000;

    return NextResponse.json({
      snapshotAt: upload.created_at,
      snapshotAgeHours: Number(snapshotAgeHours.toFixed(1)),
      synapseRowCount: synapseRows.length,
      summary: summarize(rows),
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
