/**
 * Server-side twin of the Purchasing page's data loading, so Sage can answer
 * "what should I order?" with exactly the numbers the page shows.
 *
 * Same sources, same rules:
 *  - products: forecasted inventory_products; demand = manual Avg/Mo, else
 *    last-90-days units ÷ 3 (rounded) — as useForecastData.
 *  - product on-hand: Point B AVAILABLE first, Fishbowl snapshot fallback
 *    (resolveOnHand) — as the Inventory page.
 *  - ingredient stock: usableStock() over Fishbowl locations, Point B live for
 *    anything Point B holds — as useBomData.
 *  - rules: purchasing_*_settings (empty if the tables aren't there).
 * Read-only.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { loadBomUniverse, type BomUniverse } from "@/lib/fishbowlBom";
import { getSynapseInventoryRows, rollUpSynapseInventory, synapseConfigured } from "@/lib/pointb";
import { buildVarianceRows, type FishbowlStock, type VarianceRow } from "@/lib/inventoryVariance";
import { normPart, resolveOnHand } from "@/lib/inventoryOnHand";
import {
  bomFamilies,
  usableStock,
  type Family,
  type PartSetting,
  type VendorSetting,
} from "@/lib/bomPlan";
import { toPlanRow, type PlanContext, type PlanRow, type PlanStatus } from "@/lib/purchasingPlan";

export type ServerPlan = {
  universe: BomUniverse;
  rows: PlanRow[];
  families: Family[];
  ctx: PlanContext;
  stockOf: (part: string) => number;
  pointbLive: boolean;
};

export const DEFAULT_PLAN_STATUSES: PlanStatus[] = ["at risk", "needs review"];

export async function loadServerPlan(opts: {
  targetMonths?: number;
  /** Products to plan for; empty = all. Defaults to At risk + Review, like the page. */
  statuses?: PlanStatus[];
} = {}): Promise<ServerPlan> {
  const targetMonths = opts.targetMonths ?? 6;
  const statuses = new Set(opts.statuses ?? DEFAULT_PLAN_STATUSES);

  const universe = await loadBomUniverse();

  // Fishbowl snapshot (paged with a stable order — PostgREST drops rows otherwise).
  const { data: upload } = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snapshot: (FishbowlStock & { on_order?: number | null })[] = [];
  if (upload) {
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error } = await supabaseServer
        .from("inventory_snapshot_items")
        .select("part, description, uom, on_hand, available, allocated, on_order")
        .eq("upload_id", upload.id)
        .order("part", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      snapshot.push(...((data ?? []) as typeof snapshot));
      if ((data ?? []).length < 1000) break;
    }
  }
  const snapOf = new Map(snapshot.map((s) => [s.part, s]));

  // Point B live; a failure leaves Fishbowl's numbers standing.
  let pointb = new Map<string, VarianceRow>();
  let pointbLive = false;
  if (synapseConfigured()) {
    try {
      const rows = buildVarianceRows(
        snapshot.map((s) => ({ ...s })),
        rollUpSynapseInventory(await getSynapseInventoryRows()),
      );
      pointb = new Map(rows.map((r) => [normPart(r.part), r]));
      pointbLive = true;
    } catch {
      /* Fishbowl-only */
    }
  }

  const [{ data: products }, { data: units90 }, partSet, vendorSet] = await Promise.all([
    supabaseServer
      .from("inventory_products")
      .select("part, display_name, avg_monthly_demand")
      .eq("is_forecasted", true),
    supabaseServer.from("units_by_product_last_90_days").select("part, units_last_90_days"),
    supabaseServer.from("purchasing_part_settings").select("*"),
    supabaseServer.from("purchasing_vendor_settings").select("*"),
  ]);
  const u90 = new Map((units90 ?? []).map((r: { part: string; units_last_90_days: number }) => [r.part, r.units_last_90_days]));

  const rows: PlanRow[] = [];
  for (const p of (products ?? []) as { part: string; display_name: string | null; avg_monthly_demand: number | null }[]) {
    if (!universe.boms[p.part]) continue;
    const manual = p.avg_monthly_demand ?? 0;
    const avg = Math.round(manual > 0 ? manual : (u90.get(p.part) ?? 0) / 3);
    const snap = snapOf.get(p.part);
    const onHand = resolveOnHand(snap ? snap.on_hand : null, pointb.get(normPart(p.part))).onHand;
    rows.push(toPlanRow(p.part, p.display_name || p.part, onHand, snap?.on_order ?? 0, avg, targetMonths));
  }
  const rowOf = new Map(rows.map((r) => [r.part, r]));

  const stockOf = (part: string) => {
    const vr = pointb.get(normPart(part));
    const resolved = vr ? resolveOnHand(null, vr) : null;
    return usableStock(universe.parts[part], resolved && resolved.source === "pointb" ? resolved.onHand : null);
  };

  const families = bomFamilies(
    universe.boms,
    universe.parts,
    rows.map((r) => ({ part: r.part, line: r.name.replace(/^TESTER\s+/i, "") })),
  );

  const ctx: PlanContext = {
    boms: universe.boms,
    parts: universe.parts,
    supply: (p) => stockOf(p) + (universe.parts[p]?.onOrder ?? 0),
    rowOf,
    makeFor: (r) => (statuses.size === 0 || statuses.has(r.status) ? r.suggested : 0),
    partSettings: new Map(((partSet.error ? [] : partSet.data) ?? []).map((s: PartSetting) => [s.part, s])),
    vendorSettings: new Map(((vendorSet.error ? [] : vendorSet.data) ?? []).map((s: VendorSetting) => [s.vendor, s])),
  };

  return { universe, rows, families, ctx, stockOf, pointbLive };
}
