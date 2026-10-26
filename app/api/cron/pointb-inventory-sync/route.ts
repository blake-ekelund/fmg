import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import {
  synapseConfigured,
  getSynapseInventoryRows,
  rollUpSynapseInventory,
} from "@/lib/pointb";
import { buildVarianceRows, type FishbowlStock } from "@/lib/inventoryVariance";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/pointb-inventory-sync
 *
 * Saves Point B's (Synapse) live stock per part into `pointb_inventory`, which
 * `storefront_products.on_hand` prefers over the Fishbowl snapshot — so the
 * Sassy and NI stores gate "in stock" on what the warehouse actually holds.
 * The storefronts read with the anon key and can't call Synapse themselves;
 * this table is the bridge. (The Inventory page and Dashboard read Point B
 * live instead — see lib/inventoryOnHand.ts — and the rule is the same.)
 *
 * Each row carries `comparable`: false when Point B counts the part in a
 * different unit from Fishbowl (cases vs eaches), and the view then falls back
 * to Fishbowl for that part. A part that disappears from Synapse is ZEROED,
 * never deleted — deleting would drop the view back to Fishbowl's count and
 * show a sold-out product as in stock.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user (the Inventory
 * page's Refresh inventory button calls it).
 * Schedule: every 15 minutes.
 *   ?dry=1   — read + report, write nothing.
 *   ?force=1 — bypass the shrink guard.
 *
 * Safety: an empty Synapse pull writes nothing, and a pull with fewer than half
 * the parts currently in stock is refused without ?force — a bad response must
 * never zero the stores' inventory.
 *
 * Read-only toward Synapse and Fishbowl; writes only pointb_inventory.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!synapseConfigured()) {
    return NextResponse.json(
      { skipped: true, reason: "Point B isn't connected — set SYNAPSE_API_URL, SYNAPSE_USER, SYNAPSE_PASS." },
      { status: 200 },
    );
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  try {
    // 1) Point B, live.
    const synapse = rollUpSynapseInventory(await getSynapseInventoryRows());
    if (synapse.size === 0) {
      return NextResponse.json(
        { skipped: true, reason: "Synapse returned 0 items — refusing to zero the stores' inventory." },
        { status: 409 },
      );
    }

    // 2) The Fishbowl snapshot, only to judge units (same paging as the
    //    variance report: .range() needs a stable .order() or rows drop).
    const fishbowl: FishbowlStock[] = [];
    const { data: upload } = await supabaseServer
      .from("inventory_uploads")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (upload) {
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
    }

    // 3) One row per Synapse part, with the variance report's unit verdict.
    const now = new Date().toISOString();
    const rows = buildVarianceRows(fishbowl, synapse)
      .filter((r) => r.synapse !== null)
      .map((r) => ({
        part: r.part, // already upper(trim()) by buildVarianceRows
        available: Math.round(r.synapseAvailable ?? 0),
        physical: Math.round(r.synapse ?? 0),
        held: Math.round(r.synapseHeld ?? 0),
        committed: Math.round(r.synapseCommitted ?? 0),
        uom: r.synapseUom,
        comparable: !r.flags.includes("uom-mismatch") && !r.flags.includes("mixed-uom"),
        last_seen_at: now,
        synced_at: now,
      }));

    // 4) Shrink guard against what's currently saved.
    const { data: existing, error: exErr } = await supabaseServer
      .from("pointb_inventory")
      .select("part, available");
    if (exErr) {
      if (/does not exist|schema cache|relation/i.test(exErr.message)) {
        return NextResponse.json(
          {
            error:
              "pointb_inventory isn't there yet — run `supabase db push` to apply migration 20261026000000.",
          },
          { status: 503 },
        );
      }
      throw new Error(exErr.message);
    }
    const inStockBefore = (existing ?? []).filter((r) => Number(r.available) > 0).length;
    const inStockNow = rows.filter((r) => r.available > 0).length;
    if (!force && inStockBefore > 0 && inStockNow < inStockBefore * 0.5) {
      return NextResponse.json(
        {
          skipped: true,
          reason: `Point B shows ${inStockNow} parts in stock but ${inStockBefore} were saved. Refusing to drop >50% without ?force=1.`,
        },
        { status: 409 },
      );
    }

    // 5) Parts saved before but gone from Synapse now → zero, don't delete.
    const present = new Set(rows.map((r) => r.part));
    const vanished = (existing ?? [])
      .map((r) => String(r.part))
      .filter((p) => !present.has(p));

    if (dry) {
      return NextResponse.json({
        dry: true,
        parts: rows.length,
        inStock: inStockNow,
        notComparable: rows.filter((r) => !r.comparable).length,
        wouldZero: vanished,
      });
    }

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseServer
        .from("pointb_inventory")
        .upsert(rows.slice(i, i + 500), { onConflict: "part" });
      if (error) throw new Error(error.message);
    }
    if (vanished.length > 0) {
      const { error } = await supabaseServer
        .from("pointb_inventory")
        .update({ available: 0, physical: 0, held: 0, committed: 0, synced_at: now })
        .in("part", vanished);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      synced: true,
      parts: rows.length,
      inStock: inStockNow,
      notComparable: rows.filter((r) => !r.comparable).length,
      zeroed: vanished.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
