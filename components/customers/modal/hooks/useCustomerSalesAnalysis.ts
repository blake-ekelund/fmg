"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AnalysisRow = {
  customerid: string;
  year: number;
  fragrance: string;
  display_name: string;
  quantity: number;
  revenue: number;
};

export default function useCustomerSalesAnalysis(
  customerId: string | null,
  enabled: boolean
) {
  const [data, setData] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId || !enabled) return;

    async function load() {
      setLoading(true);

      const { data: rows, error } = await supabase
        .from("customer_sales_analysis")
        .select("*")
        .eq("customerid", customerId)
        .in("year", [2024, 2025, 2026])   // 👈 Filter here
        .order("year", { ascending: false });

      if (error) {
        console.error("Sales analysis error:", error);
      }

      setData(rows ?? []);
      setLoading(false);
    }

    load();
  }, [customerId, enabled]);

  return { data, loading };
}