import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/portal/inventory — product availability, ranked by the rep's sales.
 *
 * Availability is company-wide (same stock for everyone), but the ORDER is the
 * rep's: best sellers first, by units sold over the trailing 12 months across
 * their agency's accounts. Each product also carries that 12-month volume, a
 * month-by-month trend, and a plain-language seasonality note (busy vs quiet
 * months) computed from up to 24 months of month-of-year demand.
 *
 * Availability is a STATUS band (In stock / Low / Out) from `available`
 * (on-hand minus committed) plus what's on the way — never the raw on-hand
 * count. Sellable finished goods only, from the latest Point B snapshot.
 */

const LOW_UNITS = 24;
const ID_CHUNK = 200;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Band = "in" | "low" | "out";
function band(available: number): Band {
  if (available <= 0) return "out";
  if (available < LOW_UNITS) return "low";
  return "in";
}

/**
 * A short busy/quiet note from 12 month-of-year demand buckets, or null when
 * there isn't enough history to say. Uses the best/worst contiguous 3-month
 * windows; if the peak quarter is barely above an even split, calls it even.
 */
function seasonNote(moy: number[]): string | null {
  const total = moy.reduce((a, b) => a + b, 0);
  if (total < 48) return null;
  const avg = total / 12;
  let bestStart = 0, bestSum = -1, worstStart = 0, worstSum = Infinity;
  for (let i = 0; i < 12; i++) {
    const sum = moy[i] + moy[(i + 1) % 12] + moy[(i + 2) % 12];
    if (sum > bestSum) { bestSum = sum; bestStart = i; }
    if (sum < worstSum) { worstSum = sum; worstStart = i; }
  }
  if (bestSum < avg * 3 * 1.25) return "Sells evenly year-round";
  const busy = `${MONTHS[bestStart]}–${MONTHS[(bestStart + 2) % 12]}`;
  const quiet = `${MONTHS[worstStart]}–${MONTHS[(worstStart + 2) % 12]}`;
  return `Busiest ${busy} · quiet ${quiet}`;
}

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const agency = String(rep.agencyCode);

  // Trailing 24 months. Trailing index 0 = 23 months ago … 23 = this month;
  // the last 12 (index 12–23) drive the 12-month volume + sparkline.
  const now = new Date();
  const baseYM = now.getUTCFullYear() * 12 + now.getUTCMonth() - 23;
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1))
    .toISOString()
    .slice(0, 10);
  const monthLabels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  });

  // 1. The agency's customers.
  const { data: custData, error: custErr } = await supabaseServer
    .from("customer_summary")
    .select("customerid")
    .eq("agency_code", agency);
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  const custIds = ((custData ?? []) as { customerid: string }[]).map((c) => c.customerid).filter(Boolean);

  // 2. Their completed orders in the window → soid → { trailing idx, calendar month }.
  const orderMonth = new Map<number, { t: number; m: number }>();
  for (let i = 0; i < custIds.length; i += ID_CHUNK) {
    const { data, error } = await supabaseServer
      .from("sales_orders_raw")
      .select("id, datecompleted")
      .in("customerid", custIds.slice(i, i + ID_CHUNK))
      .gte("datecompleted", windowStart);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const o of (data ?? []) as { id: number; datecompleted: string | null }[]) {
      if (!o.datecompleted) continue;
      const d = new Date(o.datecompleted);
      const t = d.getUTCFullYear() * 12 + d.getUTCMonth() - baseYM;
      if (t >= 0 && t < 24) orderMonth.set(o.id, { t, m: d.getUTCMonth() });
    }
  }

  // 3. Line items → units + revenue per part: last-12 monthly + volume, plus
  // month-of-year (units) for the seasonality read.
  type Sales = { units12mo: number; revenue12mo: number; monthly: number[]; moy: number[] };
  const salesByPart = new Map<string, Sales>();
  const soids = [...orderMonth.keys()];
  for (let i = 0; i < soids.length; i += ID_CHUNK) {
    const { data, error } = await supabaseServer
      .from("so_items_raw")
      .select("soid, productnum, qtyfulfilled, totalprice, typename")
      .in("soid", soids.slice(i, i + ID_CHUNK))
      .eq("typename", "Sale");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const it of (data ?? []) as {
      soid: number;
      productnum: string | null;
      qtyfulfilled: number | null;
      totalprice: number | null;
    }[]) {
      const part = (it.productnum ?? "").trim();
      const qty = it.qtyfulfilled ?? 0;
      if (!part || qty <= 0) continue;
      const om = orderMonth.get(it.soid);
      if (!om) continue;
      const s =
        salesByPart.get(part) ??
        { units12mo: 0, revenue12mo: 0, monthly: Array(12).fill(0), moy: Array(12).fill(0) };
      s.moy[om.m] += qty;
      if (om.t >= 12) {
        s.monthly[om.t - 12] += qty;
        s.units12mo += qty;
        s.revenue12mo += it.totalprice ?? 0;
      }
      salesByPart.set(part, s);
    }
  }

  // 4. Latest availability snapshot + sellable finished goods.
  const { data: uploads, error: upErr } = await supabaseServer
    .from("inventory_uploads")
    .select("id, pulled_date, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const upload = (uploads ?? [])[0] as
    | { id: string; pulled_date: string | null; created_at: string }
    | undefined;
  if (!upload) return NextResponse.json({ asOf: null, monthLabels, items: [] });

  const [{ data: snapData, error: snapErr }, { data: prodData, error: prodErr }] =
    await Promise.all([
      supabaseServer
        .from("inventory_snapshot_items")
        .select("part, available, on_order")
        .eq("upload_id", upload.id),
      supabaseServer
        .from("inventory_products")
        .select("part, display_name, product_name, product_form, fragrance, size, brand, collection")
        .eq("product_type", "FG")
        .neq("is_tester", true),
    ]);
  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const snapByPart = new Map(
    ((snapData ?? []) as { part: string; available: number | null; on_order: number | null }[]).map(
      (s) => [s.part, s],
    ),
  );

  const items = ((prodData ?? []) as {
    part: string;
    display_name: string | null;
    product_name: string | null;
    product_form: string | null;
    fragrance: string | null;
    size: string | null;
    brand: string | null;
    collection: string | null;
  }[])
    .map((p) => {
      const snap = snapByPart.get(p.part);
      if (!snap) return null;
      const sales = salesByPart.get(p.part);
      return {
        part: p.part,
        name: (p.display_name || p.product_name || p.part) ?? p.part,
        brand: p.brand ?? "",
        fragrance: p.fragrance && p.fragrance !== "N/A" ? p.fragrance : null,
        form: p.product_form,
        size: p.size,
        collection: p.collection,
        productTitle: p.product_name,
        status: band(snap.available ?? 0),
        onOrder: snap.on_order ?? 0,
        units12mo: sales?.units12mo ?? 0,
        revenue12mo: sales?.revenue12mo ?? 0,
        monthly: sales?.monthly ?? Array(12).fill(0),
        seasonNote: sales ? seasonNote(sales.moy) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.units12mo - a.units12mo || a.name.localeCompare(b.name));

  return NextResponse.json({ asOf: upload.pulled_date ?? upload.created_at, monthLabels, items });
}
