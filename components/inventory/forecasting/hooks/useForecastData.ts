import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import type { VarianceRow } from "@/lib/inventoryVariance";
import { fetchPointBRows, normPart, resolveOnHand } from "@/lib/inventoryOnHand";
import { fetchDemandProfiles } from "@/lib/demandClient";
import { ForecastRow } from "../types";

type Units90Row = {
  part: string;
  units_last_90_days: number;
};

export type PointBStatus = "loading" | "ok" | "error";

/**
 * Lay Point B's live count over a row. The rule — Point B AVAILABLE when it
 * has a comparable count, else Fishbowl — lives in lib/inventoryOnHand.ts so
 * the Dashboard's understock/overstock levers count exactly what this page
 * shows. The variance stays physical-vs-Fishbowl-on-hand (both totals).
 */
function applyPointB(row: ForecastRow, vr: VarianceRow | undefined): ForecastRow {
  const r = resolveOnHand(row.fishbowl_on_hand ?? null, vr);
  return {
    ...row,
    on_hand: r.onHand,
    on_hand_source: r.source,
    // On a fallback the cell still shows Point B's physical figure, if any.
    pointb_on_hand: r.source === "pointb" ? r.pointbAvailable : r.pointbPhysical,
    pointb_physical: r.pointbPhysical,
    pointb_held: r.pointbHeld,
    pointb_committed: r.pointbCommitted,
    pointb_picked: r.pointbPicked,
    variance: r.variance,
    variance_note: r.note,
  };
}

export function useForecastData() {
  const { brand } = useBrand();
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotDate, setSnapshotDate] = useState<Date | null>(null);
  const [pointbStatus, setPointbStatus] = useState<PointBStatus>("loading");
  const [pointbError, setPointbError] = useState<string | null>(null);
  /* Bumped by reload() — re-runs the whole load: the newest Fishbowl snapshot
     from Supabase and a fresh live read of Point B. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    /* Point B is read live from Synapse via the variance endpoint, which takes
       seconds. Start it now, in parallel with the Supabase reads, and overlay
       it when it lands — the table shouldn't wait on the warehouse to draw. */
    const pointbPromise = (async () => {
      await Promise.resolve(); // status resets happen off the effect's sync path
      if (!cancelled) {
        setPointbStatus("loading");
        setPointbError(null);
      }
      return fetchPointBRows();
    })();

    // Seasonal month-by-month demand, in parallel with everything else. An
    // empty map (API down) leaves every row on the flat avg, as before.
    const demandPromise = fetchDemandProfiles();

    async function load() {
      setLoading(true);

      /* -------------------------------
         1. Products
      -------------------------------- */
      let productsQuery = supabase
        .from("inventory_products")
        .select("*")
        .eq("is_forecasted", true)
        .order("part");

      if (brand !== "all") {
        productsQuery = productsQuery.eq("brand", brand);
      }

      const { data: products } = await productsQuery;

      /* -------------------------------
         2. Latest Fishbowl inventory snapshot
      -------------------------------- */
      const { data: latestUpload } = await supabase
        .from("inventory_uploads")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      type InventorySnapshotItem = {
        id: string;
        part: string;
        on_hand: number;
        on_order: number;
      };

      let inventoryMap = new Map<string, InventorySnapshotItem>();

      if (latestUpload) {
        setSnapshotDate(new Date(latestUpload.created_at));
        const { data: inventory } = await supabase
          .from("inventory_snapshot_items")
          .select("id, part, on_hand, on_order")
          .eq("upload_id", latestUpload.id);

        inventoryMap = new Map(
          (inventory ?? []).map((r) => [r.part, r])
        );
      } else {
        setSnapshotDate(null);
      }

      /* -------------------------------
         3. Last 90 days units by product
      -------------------------------- */
      const { data: units90 } = await supabase
        .from("units_by_product_last_90_days")
        .select("part, units_last_90_days");

      const units90Map = new Map<string, number>(
        (units90 as Units90Row[] | null)?.map((r) => [
          r.part,
          r.units_last_90_days,
        ]) ?? []
      );

      const demand = await demandPromise;

      /* -------------------------------
         4. Merge + compute avg / mo
      -------------------------------- */
      const merged: ForecastRow[] =
        products?.map((p) => {
          const inv = inventoryMap.get(p.part);
          const units90 = units90Map.get(p.part) ?? 0;
          const profile = demand.get(p.part);

          const hasManualAvg =
            !!p.avg_monthly_demand && p.avg_monthly_demand > 0;
          const avgFromSales = units90 / 3;

          /* Rounded once, here, rather than at each display site. The
             sales-derived figure is units÷3 and lands fractional, which showed
             up raw on the mobile cards ("8.333333333333334") and in the CSV.
             Rounding at the source keeps the table, the editable field, the
             export and the projection math all quoting the same number —
             units are whole things, so a fractional demand was never real. */
          return {
            ...p,
            snapshot_id: inv?.id ?? "",
            // Fishbowl stands in until Point B answers (see applyPointB).
            on_hand: inv?.on_hand ?? 0,
            on_hand_source: "pending" as const,
            fishbowl_on_hand: inv ? inv.on_hand : null,
            pointb_on_hand: null,
            variance: null,
            on_order: inv?.on_order ?? 0,
            // Seasonal products show their 12-month average; projections and
            // status walk the month-by-month profile (row.demand).
            avg_monthly_demand: Math.round(
              profile ? profile.avg : hasManualAvg ? p.avg_monthly_demand : avgFromSales,
            ),
            is_auto_avg: profile ? profile.method !== "manual" : !hasManualAvg,
            demand: profile,
          };
        }) ?? [];

      if (cancelled) return;
      setRows(merged);
      setLoading(false);

      /* -------------------------------
         5. Overlay Point B (live)
      -------------------------------- */
      try {
        const byPart = await pointbPromise;
        if (cancelled) return;
        // Functional update keyed by part: on-order/avg edits made while Point
        // B was loading survive, because only the on-hand fields are touched.
        setRows((prev) => prev.map((r) => applyPointB(r, byPart.get(normPart(r.part)))));
        setPointbStatus("ok");
      } catch (e) {
        if (cancelled) return;
        // No live read → the whole table runs on Fishbowl, and the toolbar says so.
        setRows((prev) =>
          prev.map((r) => ({ ...r, on_hand_source: "fishbowl" as const })),
        );
        setPointbStatus("error");
        setPointbError(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { rows, setRows, loading, snapshotDate, pointbStatus, pointbError, reload };
}
