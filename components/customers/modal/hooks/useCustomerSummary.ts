// /modal/hooks/useCustomerSummary.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CustomerSummary } from "../tabs/DetailsTab";

export default function useCustomerSummary(customerId: string | null, isD2C = false) {
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const table = isD2C ? "d2c_customer_summary" : "customer_summary";
      const filterField = isD2C ? "person_key" : "customerid";

      const { data } = await supabase
        .from(table)
        .select("*")
        .eq(filterField, customerId)
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
  }, [customerId, isD2C]);

  return { summary, loading };
}
