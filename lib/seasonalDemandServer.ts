import { supabaseServer } from "@/lib/supabaseServer";
import {
  addMonths,
  buildDemandProfiles,
  monthKey,
  type DemandProductInput,
  type DemandProfile,
  type MonthlyUnits,
} from "@/lib/seasonalDemand";

/**
 * Server side of lib/seasonalDemand: load the inputs and build every forecasted
 * product's demand profile. Used directly by the bell and Sage's purchasing
 * planner, and served to the browser by /api/inventory/demand.
 *
 * History comes from `sales_by_product_month_mat` (fast, stored) when it has
 * rows, else the live `sales_by_product_month_channel` view — the same
 * fallback Custom Reports uses (the stored copy is only filled when
 * refresh_sales_rollups() succeeds). Pages are fetched in parallel.
 *
 * Results are cached per server instance for an hour: sales history only
 * changes with the nightly Fishbowl sync, and the forecast page, dashboard and
 * bell all ask for it.
 */

const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; month: string; value: Promise<Map<string, DemandProfile>> } | null = null;

const PAGE = 1000;

type HistRow = { month: string; productnum: string; units_fulfilled: number | string | null };

async function readAllPages(source: string, from: string, order: string[]): Promise<HistRow[] | null> {
  const base = () => {
    let q = supabaseServer
      .from(source)
      .select("month, productnum, units_fulfilled", { count: "exact" })
      .gte("month", from);
    for (const col of order) q = q.order(col, { ascending: true });
    return q;
  };
  const first = await base().range(0, PAGE - 1);
  if (first.error) {
    if (/does not exist|schema cache/i.test(first.error.message)) return null;
    throw new Error(first.error.message);
  }
  const total = first.count ?? (first.data ?? []).length;
  if (total === 0) return null;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => base().range((i + 1) * PAGE, (i + 2) * PAGE - 1)),
  );
  const rows = [...(first.data ?? [])];
  for (const r of rest) {
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data ?? []));
  }
  return rows as HistRow[];
}

async function loadHistory(fromMonth: string): Promise<MonthlyUnits> {
  const from = `${fromMonth}-01`;
  const rows =
    (await readAllPages("sales_by_product_month_mat", from, ["id"])) ??
    (await readAllPages("sales_by_product_month_channel", from, ["month", "productnum", "segment", "typename"])) ??
    [];
  const out: MonthlyUnits = new Map();
  for (const r of rows) {
    const key = String(r.month).slice(0, 7);
    let m = out.get(r.productnum);
    if (!m) out.set(r.productnum, (m = new Map()));
    m.set(key, (m.get(key) ?? 0) + (Number(r.units_fulfilled) || 0));
  }
  return out;
}

async function build(now: Date): Promise<Map<string, DemandProfile>> {
  // 24 months back: the 12-month base, the year-ago trend window, and enough
  // before it to tell an established product from a new one.
  const fromMonth = addMonths(monthKey(now), -24);
  const [products, units90, history] = await Promise.all([
    supabaseServer.from("inventory_products").select("part, brand, avg_monthly_demand").eq("is_forecasted", true),
    supabaseServer.from("units_by_product_last_90_days").select("part, units_last_90_days"),
    loadHistory(fromMonth),
  ]);
  if (products.error) throw new Error(products.error.message);
  const u90 = new Map<string, number>(
    ((units90.data ?? []) as { part: string; units_last_90_days: number }[]).map((r) => [
      r.part,
      Number(r.units_last_90_days) || 0,
    ]),
  );
  return buildDemandProfiles((products.data ?? []) as DemandProductInput[], history, u90, now);
}

/** Every forecasted product's demand profile, keyed by part. Cached for an hour. */
export function getDemandProfiles(now: Date = new Date()): Promise<Map<string, DemandProfile>> {
  const month = monthKey(now);
  if (cache && cache.month === month && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = build(now);
  cache = { at: Date.now(), month, value };
  // A failed build shouldn't stick for an hour.
  value.catch(() => {
    if (cache?.value === value) cache = null;
  });
  return value;
}
