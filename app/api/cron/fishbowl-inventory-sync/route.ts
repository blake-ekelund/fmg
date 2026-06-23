import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, getInventoryAvailability } from "@/lib/fishbowl";
import {
  FISHBOWL_SYNC_INVENTORY_LABEL,
  FISHBOWL_INVENTORY_SYNC_HOURS_ET,
  FISHBOWL_TZ,
} from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/fishbowl-inventory-sync
 *
 * Automated replacement for the manual "Inventory Availability" (inv.xls)
 * upload. Pulls the Point B Solutions availability data view from Fishbowl and
 * writes a fresh `inventory_uploads` + `inventory_snapshot_items` snapshot — the
 * same tables the manual upload writes and the dashboard / forecasting read
 * (both take the single newest upload). After inserting, it prunes older *sync*
 * snapshots so the table can't grow unbounded; manual uploads are never touched.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user (so ?dry / ?force
 * are testable from the browser).
 * Schedule: 4 AM / 12 PM / 8 PM Eastern, offset ~1h after the sales sync so the
 * two never hold Fishbowl license seats at once. DST-aware (cron fires the UTC
 * hours covering EST+EDT, handler gates to the exact local hours).
 *   ?dry=1   — pull + report counts, write nothing (works any hour).
 *   ?now=1   — run now regardless of hour, but KEEP the shrink guard
 *              (this is what the "Sync now" button on /integrations uses).
 *   ?force=1 — run now regardless of hour; also bypasses the shrink guard.
 *
 * Safety: a pull of 0 parts aborts before touching the tables, and a pull
 * that's <50% of the current snapshot is refused without ?force — so a bad or
 * partial Fishbowl response can never wipe the inventory the dashboards read.
 */

const SYNC_HOURS = new Set<number>(FISHBOWL_INVENTORY_SYNC_HOURS_ET);

// The snapshot's warehouse label. Matches the manual upload's "Point B" so
// synced rows read as a continuation of the manual Point B history.
const WAREHOUSE = "Point B";

/** Current hour (0–23) in a named timezone, DST-aware. */
function hourInTz(tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return Number(h) % 24;
}

function parseNumber(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

async function insertInChunks(
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 1000,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabaseServer.from(table).insert(rows.slice(i, i + chunkSize));
    if (error) throw error;
  }
}

export async function GET(request: Request) {
  // Auth: Vercel cron (Bearer CRON_SECRET) or a signed-in portal user.
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl not connected — set FISHBOWL_API_URL / FISHBOWL_USER / FISHBOWL_PASS." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const now = url.searchParams.get("now") === "1";
  const force = url.searchParams.get("force") === "1";

  // Only do real work at the scheduled Eastern hours — the cron fires more
  // often to cover DST. ?dry / ?now / ?force bypass this so manual runs work
  // anytime. (?now keeps the shrink guard below; only ?force overrides it.)
  const hour = hourInTz(FISHBOWL_TZ);
  if (!dry && !now && !force && !SYNC_HOURS.has(hour)) {
    return NextResponse.json({ skipped: true, hour, tz: FISHBOWL_TZ });
  }

  // 1) Pull the availability view (one login/seat).
  let rows: Record<string, unknown>[];
  try {
    rows = await getInventoryAvailability();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2) Map to the snapshot-item columns, dropping any row missing a part number.
  const items = rows
    .filter((r) => String(r.part ?? "").trim() !== "")
    .map((r) => ({
      warehouse: WAREHOUSE,
      part: String(r.part).trim(),
      description: r.description ?? "",
      uom: r.uom ?? "",
      on_hand: parseNumber(r.onHand),
      allocated: parseNumber(r.allocated),
      not_available: parseNumber(r.notAvailable),
      drop_ship: parseNumber(r.dropShip),
      available: parseNumber(r.available),
      on_order: parseNumber(r.onOrder),
      committed: parseNumber(r.committed),
      short: parseNumber(r.shortQty),
    }));

  // 3) Hard guard: an empty pull must never become the "latest" snapshot.
  if (items.length === 0) {
    return NextResponse.json(
      { skipped: true, reason: "Fishbowl returned 0 inventory parts — refusing to write an empty snapshot." },
      { status: 409 },
    );
  }

  if (dry) {
    return NextResponse.json({ dry: true, parts: items.length });
  }

  // 4) Shrink guard: don't let a partial pull replace a much larger snapshot.
  const { data: lastSync } = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .ilike("original_filename", "Fishbowl sync%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!force && lastSync?.id) {
    const { count: currentCount } = await supabaseServer
      .from("inventory_snapshot_items")
      .select("*", { count: "exact", head: true })
      .eq("upload_id", lastSync.id);
    if (currentCount && items.length < currentCount * 0.5) {
      return NextResponse.json(
        {
          skipped: true,
          reason: `Pulled ${items.length} parts but the current snapshot has ${currentCount}. Refusing to shrink >50% without ?force=1.`,
        },
        { status: 409 },
      );
    }
  }

  // 5) Insert the new snapshot (audit row + items).
  const today = new Date().toISOString().split("T")[0];
  const { data: upload, error: upErr } = await supabaseServer
    .from("inventory_uploads")
    .insert({
      warehouse: WAREHOUSE,
      pulled_date: today,
      original_filename: FISHBOWL_SYNC_INVENTORY_LABEL,
    })
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const uploadId = upload.id as string;

  try {
    await insertInChunks(
      "inventory_snapshot_items",
      items.map((it) => ({ ...it, upload_id: uploadId })),
      1000,
    );

    // 6) Prune older *sync* snapshots (keep the one just written). Manual
    // uploads — anything not stamped with the sync filename — are left alone.
    const { data: oldSyncs } = await supabaseServer
      .from("inventory_uploads")
      .select("id")
      .ilike("original_filename", "Fishbowl sync%")
      .neq("id", uploadId);
    const oldIds = (oldSyncs ?? []).map((r) => r.id as string);
    if (oldIds.length > 0) {
      // Delete items first (no FK cascade assumed), then the upload rows.
      await supabaseServer.from("inventory_snapshot_items").delete().in("upload_id", oldIds);
      await supabaseServer.from("inventory_uploads").delete().in("id", oldIds);
    }

    return NextResponse.json({
      synced: true,
      parts: items.length,
      uploadId,
      pruned: oldIds.length,
    });
  } catch (e) {
    // Roll back this snapshot so a partial write can't shadow the last good one.
    await supabaseServer.from("inventory_snapshot_items").delete().eq("upload_id", uploadId);
    await supabaseServer.from("inventory_uploads").delete().eq("id", uploadId);
    const message = e instanceof Error ? e.message : "Inventory sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
