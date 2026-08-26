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
  type VarianceOverride,
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
    const { overrides, overridesReady } = await readOverrides();

    const rows = sortByMagnitude(buildVarianceRows(fishbowl, synapse, overrides));
    const snapshotAgeHours =
      (Date.now() - new Date(upload.created_at as string).getTime()) / 3_600_000;

    return NextResponse.json({
      snapshotAt: upload.created_at,
      snapshotAgeHours: Number(snapshotAgeHours.toFixed(1)),
      synapseRowCount: synapseRows.length,
      overridesReady,
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

/**
 * The per-part human decisions, or an empty set when the table isn't there yet.
 *
 * The migration is applied by hand (`supabase db push`), so a deploy can land
 * before the table does. Failing the whole report over a missing override table
 * would take down a working page to protect a feature nobody has enabled yet —
 * so a missing table degrades to "no overrides" and says so via overridesReady,
 * which is what the UI keys its notice off.
 */
async function readOverrides(): Promise<{
  overrides: VarianceOverride[];
  overridesReady: boolean;
}> {
  const { data, error } = await supabaseServer
    .from("inventory_variance_overrides")
    .select("part, archived, uom_override, note");
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) {
      return { overrides: [], overridesReady: false };
    }
    throw new Error(error.message);
  }
  return { overrides: (data ?? []) as VarianceOverride[], overridesReady: true };
}

/**
 * PATCH /api/inventory/variance — record a decision about one part.
 *
 * Body: { part, archived?, uom?, note? }. `uom` of "" clears the override and
 * returns the line to trusting Fishbowl's own label.
 *
 * Upsert rather than insert-or-update: a part is decided about repeatedly, and
 * the decision is keyed by part precisely so it outlives each snapshot.
 */
export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { part?: unknown; archived?: unknown; uom?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const part = String(body.part ?? "").trim().toUpperCase();
  if (!part) return NextResponse.json({ error: "A part number is required." }, { status: 400 });

  const row: Record<string, unknown> = { part, updated_at: new Date().toISOString() };
  if (user.email) row.updated_by = user.email;
  if (body.archived !== undefined) row.archived = body.archived === true;
  // "" clears the override; anything else is stored upper-cased to match how
  // the report normalizes both sides before comparing them.
  if (body.uom !== undefined) {
    const uom = String(body.uom ?? "").trim().toUpperCase();
    row.uom_override = uom || null;
  }
  if (body.note !== undefined) {
    const note = String(body.note ?? "").trim();
    row.note = note || null;
  }

  const { error } = await supabaseServer
    .from("inventory_variance_overrides")
    .upsert(row, { onConflict: "part" });
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "The overrides table isn't there yet — run `supabase db push` to apply migration 20260826000000.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, part });
}
