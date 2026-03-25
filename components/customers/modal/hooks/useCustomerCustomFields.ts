"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CustomField = {
  key: string;
  name: string;
  type: string;
  value: string;
};

export default function useCustomerCustomFields(customerId: string | null) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      // Get the most recent order's custom fields for this customer
      const { data, error } = await supabase
        .from("sales_orders_current")
        .select("customfields")
        .eq("customerid", customerId)
        .not("customfields", "is", null)
        .order("datecompleted", { ascending: false })
        .limit(1)
        .single();

      if (!cancelled) {
        if (error || !data?.customfields) {
          setFields([]);
        } else {
          // Handle double-encoded JSON string or already-parsed object
          let raw: Record<string, { name: string; type: string; value?: string }>;

          if (typeof data.customfields === "string") {
            try {
              raw = JSON.parse(data.customfields);
            } catch {
              setFields([]);
              setLoading(false);
              return;
            }
          } else {
            raw = data.customfields as Record<
              string,
              { name: string; type: string; value?: string }
            >;
          }

          const HIDDEN_FIELDS = new Set([
            "Order Agency",
            "Order Agency Code",
            "Order Rep",
            "Order Source",
          ]);

          const parsed: CustomField[] = Object.entries(raw)
            .map(([key, entry]) => ({
              key,
              name: entry.name ?? key,
              type: entry.type ?? "Text",
              value: entry.value ?? "",
            }))
            .filter((f) => !HIDDEN_FIELDS.has(f.name))
            .sort((a, b) => a.name.localeCompare(b.name));

          setFields(parsed);
        }
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { fields, loading };
}
