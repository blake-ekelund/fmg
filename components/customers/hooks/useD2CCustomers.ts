import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { D2CCustomer } from "../types";

export type D2CSpendBucket =
  | ""
  | "lt50"
  | "50to100"
  | "100to250"
  | "250to1000"
  | "1000plus";

type Params = {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  repeatOnly: boolean;
  spendBucket: D2CSpendBucket;
  sortColumn: string;
  sortDir: "asc" | "desc";
  enabled: boolean;
};

function getDateCutoffs() {
  const now = new Date();
  const active = new Date(now);
  active.setDate(now.getDate() - 180);
  const risk = new Date(now);
  risk.setDate(now.getDate() - 365);
  return { active, risk };
}

/**
 * Structural type covering the chain methods applyD2CFilters needs. Used
 * instead of a concrete PostgrestFilterBuilder so callers can pass either
 * a freshly-selected query (PostgrestFilterBuilder) or any other compatible
 * builder, without TypeScript chasing the generic parameters of supabase-js.
 */
interface FilterableD2CQuery<T> {
  or: (filters: string) => T;
  gt: (column: string, value: string | number) => T;
  gte: (column: string, value: string | number) => T;
  lt: (column: string, value: string | number) => T;
}

/**
 * Apply the d2c-specific filters (search, status, repeat, spend bucket) to
 * either the paginated list query or the stats / select-all query. Shared so
 * the two stay in sync.
 */
export function applyD2CFilters<T extends FilterableD2CQuery<T>>(
  q: T,
  args: { search: string; status: string; repeatOnly: boolean; spendBucket: D2CSpendBucket },
): T {
  let out = q;
  if (args.search) {
    const s = args.search.trim();
    out = out.or(`name.ilike.%${s}%,email.ilike.%${s}%,bill_to_state.ilike.%${s}%`);
  }
  if (args.status) {
    const { active, risk } = getDateCutoffs();
    if (args.status === "active") {
      out = out.gte("last_order_date", active.toISOString());
    } else if (args.status === "at_risk") {
      out = out
        .lt("last_order_date", active.toISOString())
        .gte("last_order_date", risk.toISOString());
    } else if (args.status === "churned") {
      out = out.lt("last_order_date", risk.toISOString());
    }
  }
  if (args.repeatOnly) {
    out = out.gt("lifetime_orders", 1);
  }
  switch (args.spendBucket) {
    case "lt50":
      out = out.lt("lifetime_revenue", 50);
      break;
    case "50to100":
      out = out.gte("lifetime_revenue", 50).lt("lifetime_revenue", 100);
      break;
    case "100to250":
      out = out.gte("lifetime_revenue", 100).lt("lifetime_revenue", 250);
      break;
    case "250to1000":
      out = out.gte("lifetime_revenue", 250).lt("lifetime_revenue", 1000);
      break;
    case "1000plus":
      out = out.gte("lifetime_revenue", 1000);
      break;
  }
  return out;
}

export function useD2CCustomers({
  page,
  pageSize,
  search,
  status,
  repeatOnly,
  spendBucket,
  sortColumn,
  sortDir,
  enabled,
}: Params) {
  const [customers, setCustomers] = useState<D2CCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ active: 0, atRisk: 0, churned: 0 });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      const tableQuery = applyD2CFilters(
        supabase.from("d2c_customer_summary").select("*", { count: "exact" }),
        { search, status, repeatOnly, spendBucket },
      )
        .order(sortColumn, { ascending: sortDir === "asc", nullsFirst: false })
        .order("person_key", { ascending: false })
        .range(from, to);

      const { data, count, error } = await tableQuery;

      // Stats query: same filters EXCEPT status, so the status counts reflect
      // the rest of the user's filter selection but show distribution across
      // active/at-risk/churned.
      const statsQuery = applyD2CFilters(
        supabase.from("d2c_customer_summary").select("last_order_date"),
        { search, status: "", repeatOnly, spendBucket },
      ).range(0, 9999);

      const { data: statsData } = await statsQuery;

      if (!cancelled) {
        if (error) {
          console.error(error);
        } else {
          setCustomers((data as D2CCustomer[]) ?? []);
          setTotalCount(count ?? 0);

          const full = statsData ?? [];
          const now = new Date();
          const activeCutoff = new Date(now);
          activeCutoff.setDate(now.getDate() - 180);
          const riskCutoff = new Date(now);
          riskCutoff.setDate(now.getDate() - 365);

          let activeCount = 0, atRiskCount = 0, churnedCount = 0;
          for (const c of full) {
            if (!c.last_order_date) continue;
            const d = new Date(c.last_order_date);
            if (d >= activeCutoff) activeCount++;
            else if (d >= riskCutoff) atRiskCount++;
            else churnedCount++;
          }
          setStats({ active: activeCount, atRisk: atRiskCount, churned: churnedCount });
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, pageSize, search, status, repeatOnly, spendBucket, sortColumn, sortDir, enabled]);

  return { customers, loading, totalCount, stats };
}
