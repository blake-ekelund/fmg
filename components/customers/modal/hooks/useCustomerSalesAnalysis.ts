"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AnalysisRow = {
  customerid?: string;
  person_key?: string;
  year: number;
  fragrance: string;
  display_name: string;
  quantity: number;
  revenue: number;
};

export default function useCustomerSalesAnalysis(
  customerId: string | null,
  enabled: boolean,
  isD2C = false
) {
  const [data, setData] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId || !enabled) return;

    async function load() {
      setLoading(true);

      const table = isD2C ? "d2c_customer_sales_analysis" : "customer_sales_analysis";
      const filterField = isD2C ? "person_key" : "customerid";

      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .eq(filterField, customerId)
        .in("year", [2024, 2025, 2026])
        .order("year", { ascending: false });

      if (error) {
        console.error("Sales analysis error:", error);
      }

      setData(rows ?? []);
      setLoading(false);
    }

    load();
  }, [customerId, enabled, isD2C]);

  return { data, loading };
}
