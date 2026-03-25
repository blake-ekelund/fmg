import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { D2CCustomer } from "../types";

type Params = {
  page: number;
  pageSize: number;
  search: string;
  status: string;
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

export function useD2CCustomers({
  page,
  pageSize,
  search,
  status,
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

      let tableQuery = supabase
        .from("d2c_customer_summary")
        .select("*", { count: "exact" });

      // Search
      if (search) {
        const q = search.trim();
        tableQuery = tableQuery.or(
          `name.ilike.%${q}%,email.ilike.%${q}%,bill_to_state.ilike.%${q}%`
        );
      }

      // Status
      if (status) {
        const { active, risk } = getDateCutoffs();
        if (status === "active") {
          tableQuery = tableQuery.gte("last_order_date", active.toISOString());
        }
        if (status === "at_risk") {
          tableQuery = tableQuery
            .lt("last_order_date", active.toISOString())
            .gte("last_order_date", risk.toISOString());
        }
        if (status === "churned") {
          tableQuery = tableQuery.lt("last_order_date", risk.toISOString());
        }
      }

      tableQuery = tableQuery
        .order(sortColumn, { ascending: sortDir === "asc", nullsFirst: false })
        .order("person_key", { ascending: false })
        .range(from, to);

      const { data, count, error } = await tableQuery;

      // Stats query
      let statsQuery = supabase
        .from("d2c_customer_summary")
        .select("last_order_date")
        .range(0, 9999);

      if (search) {
        const q = search.trim();
        statsQuery = statsQuery.or(
          `name.ilike.%${q}%,email.ilike.%${q}%,bill_to_state.ilike.%${q}%`
        );
      }

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
  }, [page, pageSize, search, status, sortColumn, sortDir, enabled]);

  return { customers, loading, totalCount, stats };
}
