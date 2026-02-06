import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ForecastRow } from "../types";

type Units90Row = {
  part: string;
  units_last_90_days: number;
};

export function useForecastData() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      /* -------------------------------
         1. Products
      -------------------------------- */
      const { data: products } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_forecasted", true)
        .order("part");

      /* -------------------------------
         2. Latest inventory snapshot
      -------------------------------- */
      const { data: inventory } = await supabase
        .from("inventory_snapshot_items")
        .select("id, part, on_hand, on_order")
        .order("created_at", { ascending: false });

      const inventoryMap = new Map(
        (inventory ?? []).map((r) => [r.part, r])
      );

      /* -------------------------------
         3. Last 90 days units by product
      -------------------------------- */
      const { data: units90 } = await supabase
        .from("units_by_product_last_90_days")
        .select("part, units_last_90_days");

console.log("UNITS 90D RAW FROM DB:", units90?.slice(0, 10));


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

          const avgFromSales = units90 / 3;

          return {
            ...p,

            snapshot_id: inv?.id ?? "",
            on_hand: inv?.on_hand ?? 0,
            on_order: inv?.on_order ?? 0,

            // 🔑 DEFAULT: derived from sales
            avg_monthly_demand:
              p.avg_monthly_demand && p.avg_monthly_demand > 0
                ? p.avg_monthly_demand
                : avgFromSales,
          };
        }) ?? [];

      setRows(merged);
      setLoading(false);
    }

    load();
  }, []);

  return { rows, setRows, loading };
}
