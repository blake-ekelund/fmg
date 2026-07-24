import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, getSalesSnapshot } from "@/lib/fishbowl";
import {
  FISHBOWL_SYNC_ORDERS_LABEL,
  FISHBOWL_SYNC_ITEMS_LABEL,
} from "@/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/fishbowl-sales-sync
 *
 * Automated replacement for the manual "Orders.xls + Items.csv" upload. Pulls
 * Blake's sales-orders + line-items data views from Fishbowl and full-replaces
 * the same snapshot tables the upload writes (sales_orders_raw / so_items_raw),
 * then runs the same `sync_withheld_commissions` RPC. Writes a sales_uploads
 * audit row so the sync surfaces on the /integrations page.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user (so ?dry / ?force
 * are testable from the browser).
 * Schedule: 3 AM / 11 AM / 7 PM Eastern, DST-aware (cron fires the UTC hours
 * covering EST+EDT, handler gates to the exact local hours).
 *   ?dry=1   — pull + report counts, write nothing (works any hour).
 *   ?now=1   — run now regardless of hour, but KEEP the shrink guard
 *              (this is what the "Sync now" button on /integrations uses).
 *   ?force=1 — run now regardless of hour; also bypasses the shrink guard.
 *
 * Safety: a pull of 0 orders aborts before touching the tables, and a pull
 * that's <50% of the current snapshot is refused without ?force — so a bad or
 * partial Fishbowl response can never wipe the data the dashboards depend on.
 */

// Sync runs at 3 AM / 11 AM / 7 PM Eastern. Vercel crons fire in UTC and
// Eastern shifts with DST, so vercel.json fires at the six UTC hours that cover
// those local times across the year (0,7,8,15,16,23); this gate then does real
// work only at the exact Eastern hours — no seasonal maintenance. Same approach
// as the fishbowl-digest cron.
const SYNC_TZ = "America/New_York";
const SYNC_HOURS = new Set([3, 11, 19]); // 3 AM, 11 AM, 7 PM Eastern

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

function parseDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  // Fishbowl returns dates like "2021-06-06T23:00:00.000-05" — a malformed tz
  // offset (no minutes) that new Date() rejects, which silently nulled every
  // date and zeroed the dashboards. Take the leading YYYY-MM-DD directly (also
  // preserves Fishbowl's local calendar date instead of shifting to UTC).
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
  const hour = hourInTz(SYNC_TZ);
  if (!dry && !now && !force && !SYNC_HOURS.has(hour)) {
    return NextResponse.json({ skipped: true, hour, tz: SYNC_TZ });
  }

  // 1) Pull both views from Fishbowl (one login/seat for both).
  let orders: Record<string, unknown>[];
  let items: Record<string, unknown>[];
  try {
    ({ orders, items } = await getSalesSnapshot());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2) Hard guard: an empty pull must never reach the delete step.
  if (orders.length === 0) {
    return NextResponse.json(
      { skipped: true, reason: "Fishbowl returned 0 sales orders — refusing to replace the snapshot." },
      { status: 409 },
    );
  }

  if (dry) {
    return NextResponse.json({ dry: true, orders: orders.length, items: items.length });
  }

  // 3) Shrink guard: don't let a partial pull wipe most of the snapshot.
  const { count: currentCount } = await supabaseServer
    .from("sales_orders_raw")
    .select("*", { count: "exact", head: true });
  if (!force && currentCount && orders.length < currentCount * 0.5) {
    return NextResponse.json(
      {
        skipped: true,
        reason: `Pulled ${orders.length} orders but the current snapshot has ${currentCount}. Refusing to shrink >50% without ?force=1.`,
      },
      { status: 409 },
    );
  }

  // 4) Audit row (mirrors the manual upload so /integrations shows the sync).
  const today = new Date().toISOString().split("T")[0];
  const { data: upload, error: upErr } = await supabaseServer
    .from("sales_uploads")
    .insert({
      pulled_date: today,
      original_filename_orders: FISHBOWL_SYNC_ORDERS_LABEL,
      original_filename_items: FISHBOWL_SYNC_ITEMS_LABEL,
      status: "processing",
    })
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const uploadId = upload.id as string;

  try {
    // 5) Map the views onto the raw-table columns (same shape as the upload).
    const ordersToInsert = orders.map((r) => ({
      id: parseNumber(r.id),
      billtoname: r.billToName ?? null,
      billtoaddress: r.billToAddress ?? null,
      billtocity: r.billToCity ?? null,
      billtostate: r.billToState ?? null,
      billtozip: r.billToZip ?? null,
      billtocountry: r.billToCountry ?? null,
      customercontact: r.customerContact ?? null,
      customerid: r.customerId ?? null,
      customerpo: r.customerPO ?? null,
      /* Open orders (estimate / issued / in progress) have no dateCompleted —
         these are the only dates they carry, and what the portal sorts them by. */
      datecreated: parseDate(r.dateCreated),
      dateissued: parseDate(r.dateIssued),
      datecompleted: parseDate(r.dateCompleted),
      email: r.email ?? null,
      num: r.num ?? null,
      phone: r.phone ?? null,
      shiptoname: r.shipToName ?? null,
      shiptoaddress: r.shipToAddress ?? null,
      shiptocity: r.shipToCity ?? null,
      shiptostate: r.shipToState ?? null,
      shiptozip: r.shipToZip ?? null,
      shiptocountry: r.shipToCountry ?? null,
      status: r.status ?? null,
      totalprice: parseNumber(r.totalPrice),
      customfields: r.customFields ?? null,
      channel: r.Channel ?? r.channel ?? null,
      upload_id: uploadId,
    }));

    const itemsToInsert = items.map((r) => ({
      id: parseNumber(r.id),
      description: r.description ?? null,
      productid: parseNumber(r.productId),
      productnum: r.productNum ?? null,
      qtyfulfilled: parseNumber(r.qtyFulfilled),
      qtyordered: parseNumber(r.qtyOrdered),
      soid: parseNumber(r.soId),
      solineitem: parseNumber(r.soLineItem),
      statusid: parseNumber(r.statusId),
      totalcost: parseNumber(r.totalCost),
      totalprice: parseNumber(r.totalPrice),
      typename: r.typeName ?? null,
      upload_id: uploadId,
    }));

    // 6) Insert the fresh snapshot, then drop every prior upload's rows.
    await insertInChunks("sales_orders_raw", ordersToInsert, 1000);
    await insertInChunks("so_items_raw", itemsToInsert, 1000);

    const { error: delO } = await supabaseServer
      .from("sales_orders_raw")
      .delete()
      .neq("upload_id", uploadId);
    if (delO) throw delO;
    const { error: delI } = await supabaseServer
      .from("so_items_raw")
      .delete()
      .neq("upload_id", uploadId);
    if (delI) throw delI;

    // 7) Refresh commissions off the new raw data (same RPC as the upload).
    const { error: rpcErr } = await supabaseServer.rpc("sync_withheld_commissions");
    if (rpcErr) throw rpcErr;

    // 8) Mark the audit row complete.
    await supabaseServer
      .from("sales_uploads")
      .update({
        status: "complete",
        orders_rows: ordersToInsert.length,
        items_rows: itemsToInsert.length,
        error_text: null,
      })
      .eq("id", uploadId);

    return NextResponse.json({
      synced: true,
      orders: ordersToInsert.length,
      items: itemsToInsert.length,
      uploadId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await supabaseServer
      .from("sales_uploads")
      .update({ status: "failed", error_text: message })
      .eq("id", uploadId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
