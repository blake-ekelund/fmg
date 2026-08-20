import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { D2CCustomer } from "../types";
import {
  applyLastOrderWindow,
  orIlikeClauses,
  planStatusFilter,
  type CustomerStats,
  type LastOrderWindow,
} from "./queryHelpers";

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
  /** Selected status buckets. Empty means "All" — no status restriction. */
  statuses: string[];
  states: string[];
  repeatOnly: boolean;
  spendBucket: D2CSpendBucket;
  /** Recency bucket over last_order_date. Empty means no restriction. */
  lastOrder?: LastOrderWindow;
  sortColumn: string;
  sortDir: "asc" | "desc";
  enabled: boolean;
  /** When set, only these person_keys are eligible (email-status filter).
      An empty-match sentinel like ["__none__"] yields zero rows. */
  restrictIds?: string[];
};

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
  is: (column: string, value: null) => T;
  not: (column: string, operator: string, value: string) => T;
  in: (column: string, values: string[]) => T;
}

/**
 * Apply the d2c-specific filters (search, status, repeat, spend bucket) to
 * either the paginated list query or the stats / select-all query. Shared so
 * the two stay in sync.
 */
export function applyD2CFilters<T extends FilterableD2CQuery<T>>(
  q: T,
  args: {
    search: string;
    statuses: string[];
    repeatOnly: boolean;
    spendBucket: D2CSpendBucket;
    lastOrder?: LastOrderWindow;
    states?: string[];
  },
): T {
  let out = q;
  if (args.search.trim()) {
    out = out.or(
      orIlikeClauses(["name", "email", "bill_to_state"], args.search),
    );
  }
  if (args.states && args.states.length > 0) {
    out = out.in("bill_to_state", args.states);
  }
  if (args.statuses.length > 0) {
    // D2C has no open-order concept, so the plan is purely the date-range
    // union; the same helper keeps the two lists' bucket definitions in sync.
    const plan = planStatusFilter(args.statuses, null, "person_key");
    if (plan.or) out = out.or(plan.or);
  }
  if (args.repeatOnly) {
    out = out.gt("lifetime_orders", 1);
  }
  out = applyLastOrderWindow(out, args.lastOrder);
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
  statuses,
  states,
  repeatOnly,
  spendBucket,
  lastOrder,
  sortColumn,
  sortDir,
  enabled,
  restrictIds,
}: Params) {
  const [customers, setCustomers] = useState<D2CCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<CustomerStats>({
    all: 0,
    active: 0,
    atRisk: 0,
    churned: 0,
  });
  const [stateOptions, setStateOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      // Pin the builder to its concrete type before passing it through the
      // generic applyD2CFilters, then chain order/range on the concrete type —
      // chaining on the generic return trips TS2589 ("excessively deep").
      let baseQuery = supabase
        .from("d2c_customer_summary")
        .select("*", { count: "exact" });
      baseQuery = applyD2CFilters(baseQuery, {
        search,
        statuses,
        repeatOnly,
        spendBucket,
        states,
        lastOrder,
      });
      if (restrictIds) {
        baseQuery = baseQuery.in("person_key", restrictIds);
      }
      const tableQuery = baseQuery
        .order(sortColumn, { ascending: sortDir === "asc", nullsFirst: false })
        .order("person_key", { ascending: false })
        .range(from, to);

      const { data, count, error } = await tableQuery;

      // Stats: one head-only count per bucket. Same filters EXCEPT status, so
      // the counts show the distribution across active/at-risk/churned for the
      // rest of the user's selection. `head: true` transfers no rows, so this
      // is exact at any table size — the old version capped at 10,000 matching
      // rows and silently under-counted past that.
      function countFor(bucket: "" | "active" | "at_risk" | "churned") {
        let q = supabase
          .from("d2c_customer_summary")
          .select("person_key", { count: "exact", head: true });
        q = applyD2CFilters(q, {
          search,
          statuses: bucket ? [bucket] : [],
          repeatOnly,
          spendBucket,
          states,
          lastOrder,
        });
        if (restrictIds) {
          q = q.in("person_key", restrictIds);
        }
        return q;
      }

      const [allRes, activeRes, atRiskRes, churnedRes] = await Promise.all([
        countFor(""),
        countFor("active"),
        countFor("at_risk"),
        countFor("churned"),
      ]);

      if (!cancelled) {
        if (error) {
          console.error(error);
          // Don't leave the previous filter's rows on screen as if they were
          // a valid result for the new one.
          setCustomers([]);
          setTotalCount(0);
          setStats({ all: 0, active: 0, atRisk: 0, churned: 0 });
        } else {
          setCustomers((data as D2CCustomer[]) ?? []);
          setTotalCount(count ?? 0);
          setStats({
            all: allRes.count ?? 0,
            active: activeRes.count ?? 0,
            atRisk: atRiskRes.count ?? 0,
            churned: churnedRes.count ?? 0,
          });
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, pageSize, search, statuses, states, repeatOnly, spendBucket, lastOrder, sortColumn, sortDir, enabled, restrictIds]);

  /* Distinct billing states for the filter dropdown (only when this view is
     active, so the wholesale page doesn't query the D2C summary needlessly). */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function loadStates() {
      const { data } = await supabase
        .from("d2c_customer_summary")
        .select("bill_to_state")
        .not("bill_to_state", "is", null)
        .neq("bill_to_state", "");
      if (cancelled || !data) return;
      const unique = Array.from(
        new Set(data.map((d) => d.bill_to_state as string).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b));
      setStateOptions(unique.map((s) => ({ label: s, value: s })));
    }
    loadStates();
    return () => { cancelled = true; };
  }, [enabled]);

  return { customers, loading, totalCount, stats, stateOptions };
}
