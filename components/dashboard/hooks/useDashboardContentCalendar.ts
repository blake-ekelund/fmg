"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ContentItem } from "@/components/marketing/content-calendar/types";
import type { BrandFilter } from "@/types/brand";

/**
 * Fetches marketing_content for a specific date.
 * `dateOffset` controls which day: 0 = today, 1 = tomorrow, -1 = yesterday, etc.
 */
export function useDashboardContentCalendar(
  brand: BrandFilter,
  dateOffset: number = 0
) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);

      const d = new Date();
      d.setDate(d.getDate() + dateOffset);
      const dateStr = d.toISOString().slice(0, 10);
      setTargetDate(dateStr);

      let q = supabase
        .from("marketing_content")
        .select("*")
        .eq("publish_date", dateStr)
        .order("platform");

      if (brand !== "all") {
        q = q.eq("brand", brand);
      }

      const { data } = await q;
      setItems((data as ContentItem[]) ?? []);
      setLoading(false);
    })();
  }, [brand, dateOffset]);

  return { items, loading, targetDate };
}
