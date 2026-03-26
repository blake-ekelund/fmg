import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import type { Customer } from "../types";

/**
 * Represents a Supabase PostgREST query builder that supports
 * the filter methods used in applyFilters (.or, .eq, .gte, .lt, .is).
 */
interface FilterableQuery<T> {
  or: (filters: string) => T;
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lt: (column: string, value: string) => T;
  is: (column: string, value: null) => T;
}

type Params = {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  channel: string;
  sortColumn: string;
  sortDir: "asc" | "desc";
  enabled?: boolean;
};

function getDateCutoffs() {
  const now = new Date();

  const active = new Date(now);
  active.setDate(now.getDate() - 180);

  const risk = new Date(now);
  risk.setDate(now.getDate() - 365);

  return { active, risk };
}

/* -------------------------------------------------- */
/* Shared Filter Builder */
/* -------------------------------------------------- */

export function applyFilters<T extends FilterableQuery<T>>(
  query: T,
  search: string,
  status: string,
  channel: string
): T {
  if (search) {
    const q = search.trim();

    query = query.or(
      [
        `name.ilike.%${q}%`,
        `customerid.ilike.%${q}%`,
        `bill_to_state.ilike.%${q}%`,
      ].join(",")
    );
  }

  if (channel) {
    query = query.eq("channel", channel);
  }

  if (status) {
    const { active, risk } = getDateCutoffs();

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
  const [agencyMap, setAgencyMap] =
    useState<Record<string, { agency_name: string; rep_name: string }>>({});
  const [stats, setStats] = useState({
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
        channel
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
         STATS QUERY (Full Dataset)
      ---------------------------- */

      let statsQuery = supabase
        .from("customer_summary")
        .select("last_order_date")
        .range(0, 4999); // covers your stated max

      statsQuery = applyFilters(
        statsQuery,
        search,
        status,
        channel
      );

      if (brand !== "all") {
        statsQuery = statsQuery.ilike("brands_purchased", `%${brand}%`);
      }

      const { data: statsData } =
        await statsQuery;

      if (!cancelled) {
        if (error) {
          console.error(error);
        } else {
          setCustomers((data as Customer[]) ?? []);
          setTotalCount(count ?? 0);

          const full = statsData ?? [];

          const now = new Date();

          const activeCutoff = new Date(now);
          activeCutoff.setDate(now.getDate() - 180);

          const riskCutoff = new Date(now);
          riskCutoff.setDate(now.getDate() - 365);

          let activeCount = 0;
          let atRiskCount = 0;
          let churnedCount = 0;

          for (const c of full) {
            if (!c.last_order_date) {
              // decide: separate bucket or treat as churn?
              continue;
            }

            const d = new Date(c.last_order_date);

            if (d >= activeCutoff) {
              activeCount++;
            } else if (d >= riskCutoff) {
              atRiskCount++;
            } else {
              churnedCount++;
            }
          }

          setStats({
            active: activeCount,
            atRisk: atRiskCount,
            churned: churnedCount,
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
        .from("customer_agency")
        .select("customerid, agency_name, rep_name");

      if (!data) return;

      // Build lookup map
      const map: Record<string, { agency_name: string; rep_name: string }> = {};
      for (const row of data) {
        map[row.customerid] = {
          agency_name: row.agency_name ?? "",
          rep_name: row.rep_name ?? "",
        };
      }
      setAgencyMap(map);

      // Build unique agency options
      const names = new Set<string>();
      for (const row of data) {
        if (row.agency_name) names.add(row.agency_name);
      }
      setAgencyOptions(
        Array.from(names).sort().map((n) => ({ label: n, value: n }))
      );
    }

    loadChannels();
    loadAgencies();
  }, []);

  return {
    customers,
    loading,
    totalCount,
    channelOptions,
    agencyOptions,
    agencyMap,
    stats,
  };
}