import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ForecastRow } from "../types";

export function useForecastData() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: products } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_forecasted", true)
        .order("part");

      const { data: inventory } = await supabase
        .from("inventory_snapshot_items")
        .select("id, part, on_hand, on_order")
        .order("created_at", { ascending: false });

      const inventoryMap = new Map(
        (inventory ?? []).map((r) => [r.part, r])
      );

      const merged =
        products?.map((p) => {
          const inv = inventoryMap.get(p.part);
          return {
            ...p,
            snapshot_id: inv?.id ?? "",
            on_hand: inv?.on_hand ?? 0,
            on_order: inv?.on_order ?? 0,
          };
        }) ?? [];

      setRows(merged);
      setLoading(false);
    }

    load();
  }, []);

  return { rows, setRows, loading };
}
