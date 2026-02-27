// /modal/hooks/useCustomerSummary.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function useCustomerSummary(customerId: string | null) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data } = await supabase
        .from("customer_summary")
        .select("*")
        .eq("customerid", customerId)
        .maybeSingle();

      if (!cancelled) {
        setSummary(data ?? null);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { summary, loading };
}