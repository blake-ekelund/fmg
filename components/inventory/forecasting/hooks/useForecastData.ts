import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import type { VarianceRow } from "@/lib/inventoryVariance";
import { ForecastRow } from "../types";

type Units90Row = {
  part: string;
  units_last_90_days: number;
};

export type PointBStatus = "loading" | "ok" | "error";

const normPart = (part: string) => part.trim().toUpperCase();

/**
 * Lay Point B's live count over a row.
 *
 * Point B is the building, so its physical count is what the forecast runs on
 * whenever it has one that means the same thing as Fishbowl's. Two cases fall
 * back to the Fishbowl snapshot instead, and say so: the part isn't in Synapse
 * at all, or Synapse counts it in a different unit (24 CS is not 24 eaches —
 * forecasting off it would read as a stock-out that isn't real).
 */
function applyPointB(row: ForecastRow, vr: VarianceRow | undefined): ForecastRow {
  const fishbowl = row.fishbowl_on_hand ?? null;
  const unitClash =
    !!vr && (vr.flags.includes("uom-mismatch") || vr.flags.includes("mixed-uom"));

  if (vr && vr.synapse !== null && !unitClash) {
    return {
      ...row,
      on_hand: vr.synapse,
      on_hand_source: "pointb",
      pointb_on_hand: vr.synapse,
      variance: fishbowl === null ? null : vr.synapse - fishbowl,
      variance_note: fishbowl === null ? "Not in the Fishbowl snapshot" : null,
    };
  }

  return {
    ...row,
    on_hand: fishbowl ?? 0,
    on_hand_source: "fishbowl",
    pointb_on_hand: vr?.synapse ?? null,
    variance: null,
    variance_note: unitClash
      ? `Units differ — Fishbowl ${vr?.fishbowlUom ?? "?"}, Point B ${vr?.synapseUom ?? "?"}. Forecast uses Fishbowl.`
      : "Not on hand at Point B. Forecast uses Fishbowl.",
  };
}

export function useForecastData() {
  const { brand } = useBrand();
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotDate, setSnapshotDate] = useState<Date | null>(null);
  const [pointbStatus, setPointbStatus] = useState<PointBStatus>("loading");
  const [pointbError, setPointbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    /* Point B is read live from Synapse via the variance endpoint, which takes
       seconds. Start it now, in parallel with the Supabase reads, and overlay
       it when it lands — the table shouldn't wait on the warehouse to draw. */
    const pointbPromise = (async () => {
      // Internal API routes authenticate off an Authorization header, not the
      // session cookie.
      const { data: session } = await supabase.auth.getSession();
      if (!cancelled) {
        setPointbStatus("loading");
        setPointbError(null);
      }
      const token = session.session?.access_token;
      const res = await fetch("/api/inventory/variance", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Point B read failed (${res.status})`);
      return (json?.rows ?? []) as VarianceRow[];
    })();

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

      /* -------------------------------
         4. Merge + compute avg / mo
      -------------------------------- */
      const merged: ForecastRow[] =
        products?.map((p) => {
          const inv = inventoryMap.get(p.part);
          const units90 = units90Map.get(p.part) ?? 0;

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
            avg_monthly_demand: Math.round(
              hasManualAvg ? p.avg_monthly_demand : avgFromSales,
            ),
            is_auto_avg: !hasManualAvg,
          };
        }) ?? [];

      if (cancelled) return;
      setRows(merged);
      setLoading(false);

      /* -------------------------------
         5. Overlay Point B (live)
      -------------------------------- */
      try {
        const pointb = await pointbPromise;
        if (cancelled) return;
        const byPart = new Map(pointb.map((r) => [normPart(r.part), r]));
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
  }, [brand]);

  return { rows, setRows, loading, snapshotDate, pointbStatus, pointbError };
}
