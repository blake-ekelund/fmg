"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import { ym, type SalesChannel } from "./constants";

export type SalesMatrixRow = {
  month: string;
  productnum: string;
  display_name: string | null;
  fragrance: string | null;
  revenue: number;
};

const PAGE_SIZE = 1000;

/** Channel-aware source. Falls back to the channel-less view when absent. */
const CHANNEL_VIEW = "sales_by_product_month_channel";
const ALL_VIEW = "sales_by_product_month_enriched";

const SEGMENT: Record<Exclude<SalesChannel, "all">, string> = {
  wholesale: "Wholesale",
  d2c: "D2C",
};

/**
 * Loads sales for the 12-month window ending at (endYear, endMonth), plus the
 * 12 months before it so the page can show year-over-year context.
 *
 * The two windows come back in ONE paginated scan of a 24-month range and are
 * split client-side — a second round-trip per filter change would double the
 * latency for data we're already streaming past.
 *
 * Search filtering is deliberately NOT in this hook — it's applied client-side
 * so every keystroke doesn't refetch from the server.
 *
 * Source: `sales_by_product_month_channel`, which carries the channel segment
 * and follows the dashboard's revenue rules. Until that view is created, the
 * "all" view still answers — `channelUnavailable` tells the channel-specific
 * pages to say so rather than render an empty chart that looks like zero sales.
 */
export function useSalesTTM(
  endYear: number,
  endMonth: number, // 1–12
  channel: SalesChannel = "all"
) {
  const { brand } = useBrand();
  const [rows, setRows] = useState<SalesMatrixRow[]>([]);
  const [priorRows, setPriorRows] = useState<SalesMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelUnavailable, setChannelUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setChannelUnavailable(false);

      const endJsMonth = endMonth - 1;
      const endAnchor = new Date(endYear, endJsMonth, 1);

      // Start of the CURRENT window (end - 11 months) and of the PRIOR one
      // (end - 23 months). Everything from priorStart..end is fetched at once.
      const currentStart = new Date(
        endAnchor.getFullYear(),
        endAnchor.getMonth() - 11,
        1
      );
      const priorStart = new Date(
        endAnchor.getFullYear(),
        endAnchor.getMonth() - 23,
        1
      );

      const currentStartKey = ym(
        currentStart.getFullYear(),
        currentStart.getMonth()
      );
      const priorStartKey = ym(priorStart.getFullYear(), priorStart.getMonth());
      const endKey = ym(endAnchor.getFullYear(), endAnchor.getMonth());

      // One scan of the channel view; if it isn't there yet, one of the old one.
      const fetchFrom = async (view: string, withSegment: boolean) => {
        const out: SalesMatrixRow[] = [];
        let page = 0;

        while (true) {
          // Deterministic order first, then filters, then the page window.
          let query = supabase
            .from(view)
            .select(
              `
              month,
              productnum,
              display_name,
              fragrance,
              revenue
            `
            )
            .gte("month", priorStartKey)
            .lte("month", endKey)
            // Ordering by month alone leaves rows within a month unordered,
            // and an unstable order across a paginated scan lets pages overlap
            // while other rows never come back. Ordering by the view's full
            // grouping key makes each page deterministic.
            .order("month", { ascending: true })
            .order("productnum", { ascending: true })
            .order("typename", { ascending: true });

          if (withSegment) {
            query = query.order("segment", { ascending: true });
            if (channel !== "all") query = query.eq("segment", SEGMENT[channel]);
          }
          if (brand !== "all") query = query.eq("brand", brand);

          query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

          const { data, error } = await query;
          if (error) return { rows: null, error };
          if (!data || data.length === 0) break;

          out.push(
            ...data
              .filter((r) => {
                const pnum = (r.productnum || "").toUpperCase();
                const name = (r.display_name || "").toUpperCase();
                return (
                  pnum !== "SUBTOTAL" && pnum !== "SHIPPING" &&
                  name !== "SUBTOTAL" && name !== "SHIPPING"
                );
              })
              .map((r) => ({
                ...r,
                revenue: Number(r.revenue) || 0,
              }))
          );

          if (data.length < PAGE_SIZE) break;
          page += 1;
        }

        return { rows: out, error: null };
      };

      let result = await fetchFrom(CHANNEL_VIEW, true);
      if (result.error) {
        // The channel view isn't in this database yet.
        if (channel === "all") {
          result = await fetchFrom(ALL_VIEW, false);
        } else {
          if (!cancelled) {
            setRows([]);
            setPriorRows([]);
            setChannelUnavailable(true);
            setLoading(false);
          }
          return;
        }
      }

      if (cancelled) return;

      const fetched = result.rows ?? [];
      // Month keys are zero-padded ISO dates, so a lexicographic compare is
      // also a chronological one.
      setRows(fetched.filter((r) => r.month >= currentStartKey));
      setPriorRows(fetched.filter((r) => r.month < currentStartKey));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endYear, endMonth, brand, channel]);

  return { rows, priorRows, loading, channelUnavailable };
}
