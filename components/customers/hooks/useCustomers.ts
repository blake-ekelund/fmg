import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import type { Customer } from "../types";
import {
  orIlikeClauses,
  getStatusCutoffs,
  type CustomerStats,
} from "./queryHelpers";

/**
 * Represents a Supabase PostgREST query builder that supports
 * the filter methods used in applyFilters.
 */
interface FilterableQuery<T> {
  or: (filters: string) => T;
  eq: (column: string, value: string) => T;
  gt: (column: string, value: string | number) => T;
  gte: (column: string, value: string | number) => T;
  lt: (column: string, value: string | number) => T;
  is: (column: string, value: null) => T;
  in: (column: string, values: string[]) => T;
}

export type WholesaleSpendBucket =
  | ""
  | "lt1k"
  | "1kto5k"
  | "5kto25k"
  | "25kto100k"
  | "100kplus";

type Params = {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  channel: string;
  agency: string;
  states: string[];
  repeatOnly: boolean;
  spendBucket: WholesaleSpendBucket;
  sortColumn: string;
  sortDir: "asc" | "desc";
  enabled?: boolean;
};

/* -------------------------------------------------- */
/* Shared Filter Builder */
/* -------------------------------------------------- */

export function applyFilters<T extends FilterableQuery<T>>(
  query: T,
  search: string,
  status: string,
  channel: string,
  agency?: string,
  repeatOnly?: boolean,
  spendBucket?: WholesaleSpendBucket,
  states?: string[],
): T {
  if (search.trim()) {
    query = query.or(
      orIlikeClauses(
        ["name", "customerid", "bill_to_state", "agency_code", "rep_name"],
        search,
      ),
    );
  }

  if (channel) {
    query = query.eq("channel", channel);
  }

  if (agency) {
    query = query.eq("agency_code", agency);
  }

  if (states && states.length > 0) {
    query = query.in("bill_to_state", states);
  }

  if (status) {
    const { active, risk } = getStatusCutoffs();

    if (status === "active") {
      query = query.gte(
        "last_order_date",
        active.toISOString()
      );
    }

    if (status === "at_risk") {
      query = query
        .lt("last_order_date", active.toISOString())
        .gte("last_order_date", risk.toISOString());
    }

    if (status === "churned") {
      query = query.lt("last_order_date", risk.toISOString());
    }

    if (status === "no_orders") {
      query = query.is("last_order_date", null);
    }
  }

  if (repeatOnly) {
    query = query.gt("lifetime_orders", 1);
  }

  switch (spendBucket) {
    case "lt1k":
      query = query.lt("lifetime_revenue", 1000);
      break;
    case "1kto5k":
      query = query.gte("lifetime_revenue", 1000).lt("lifetime_revenue", 5000);
      break;
    case "5kto25k":
      query = query.gte("lifetime_revenue", 5000).lt("lifetime_revenue", 25000);
      break;
    case "25kto100k":
      query = query.gte("lifetime_revenue", 25000).lt("lifetime_revenue", 100000);
      break;
    case "100kplus":
      query = query.gte("lifetime_revenue", 100000);
      break;
  }

  return query;
}

/* -------------------------------------------------- */
/* Hook */
/* -------------------------------------------------- */

export function useCustomers({
  page,
  pageSize,
  search,
  status,
  channel,
  agency,
  states,
  repeatOnly,
  spendBucket,
  sortColumn,
  sortDir,
  enabled = true,
}: Params) {
  const { brand } = useBrand();

  const [customers, setCustomers] =
    useState<Customer[]>([]);
  const [loading, setLoading] =
    useState(false);
  const [totalCount, setTotalCount] =
    useState(0);
  const [channelOptions, setChannelOptions] =
    useState<{ label: string; value: string }[]>([]);
  const [agencyOptions, setAgencyOptions] =
    useState<{ label: string; value: string }[]>([]);
  const [stateOptions, setStateOptions] =
    useState<{ label: string; value: string }[]>([]);
  const [stats, setStats] = useState<CustomerStats>({
    all: 0,
    active: 0,
    atRisk: 0,
    churned: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      /* ---------------------------
         TABLE QUERY (Paginated)
      ---------------------------- */

      let tableQuery = supabase
        .from("customer_summary")
        .select("*", { count: "exact" });

      tableQuery = applyFilters(
        tableQuery,
        search,
        status,
        channel,
        agency,
        repeatOnly,
        spendBucket,
        states,
      );

      if (brand !== "all") {
        tableQuery = tableQuery.ilike("brands_purchased", `%${brand}%`);
      }

      tableQuery = tableQuery
        .order(sortColumn, {
          ascending: sortDir === "asc",
          nullsFirst: false,
        })
        .order("customerid", {
          ascending: false,
        })
        .range(from, to);

      const { data, count, error } =
        await tableQuery;

      /* ---------------------------
         STATS (exact, uncapped)

         One head-only count per status bucket. The previous version pulled
         last_order_date for up to 5,000 matching rows and bucketed them in
         JS, which both transferred a lot of data and silently under-counted
         once a filter matched more than the cap. `head: true` transfers no
         rows at all and the count is exact however large the table gets.

         Counts reflect the rest of the filter selection but ignore the status
         dimension, so the Active / At Risk / Churned numbers stay meaningful
         whichever one is currently selected.
      ---------------------------- */

      function countFor(bucket: "" | "active" | "at_risk" | "churned") {
        let q = supabase
          .from("customer_summary")
          .select("customerid", { count: "exact", head: true });
        q = applyFilters(
          q,
          search,
          bucket,
          channel,
          agency,
          repeatOnly,
          spendBucket,
          states,
        );
        if (brand !== "all") {
          q = q.ilike("brands_purchased", `%${brand}%`);
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
          // Surface the failure instead of leaving the previous page's rows
          // on screen looking like a valid result for the new filters.
          setCustomers([]);
          setTotalCount(0);
          setStats({ all: 0, active: 0, atRisk: 0, churned: 0 });
        } else {
          setCustomers((data as Customer[]) ?? []);
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

    return () => {
      cancelled = true;
    };
  }, [
    page,
    pageSize,
    search,
    status,
    channel,
    agency,
    states,
    repeatOnly,
    spendBucket,
    sortColumn,
    sortDir,
    brand,
    enabled,
  ]);

  /* ---------------------------
     Channel + Agency Options
  ---------------------------- */

  useEffect(() => {
    async function loadChannels() {
      const { data } =
        await supabase
          .from("customer_summary")
          .select("channel")
          .not("channel", "is", null);

      if (!data) return;

      const unique = Array.from(
        new Set(data.map((d) => d.channel))
      ).sort();

      setChannelOptions(
        unique.map((c) => ({
          label: c,
          value: c,
        }))
      );
    }

    async function loadAgencies() {
      const { data } = await supabase
        .from("customer_summary")
        .select("agency_code")
        .not("agency_code", "is", null)
        .neq("agency_code", "");

      if (!data) return;

      const codes = new Set<string>();
      for (const row of data) {
        if (row.agency_code) codes.add(row.agency_code);
      }
      setAgencyOptions(
        Array.from(codes)
          .sort((a, b) => {
            const na = parseInt(a, 10);
            const nb = parseInt(b, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
          })
          .map((n) => ({ label: n, value: n }))
      );
    }

    async function loadStates() {
      const { data } = await supabase
        .from("customer_summary")
        .select("bill_to_state")
        .not("bill_to_state", "is", null)
        .neq("bill_to_state", "");

      if (!data) return;

      const unique = Array.from(
        new Set(data.map((d) => d.bill_to_state as string).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b));

      setStateOptions(unique.map((s) => ({ label: s, value: s })));
    }

    loadChannels();
    loadAgencies();
    loadStates();
  }, []);

  return {
    customers,
    loading,
    totalCount,
    channelOptions,
    agencyOptions,
    stateOptions,
    stats,
  };
}
