"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addMonths } from "./utils/date";
import { useForecastData } from "./hooks/useForecastData";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import ForecastTable from "./ForecastTable";

/* ---------------- Status Logic (single source of truth) ---------------- */
function getStatusLabel(
  onHand: number,
  onOrder: number,
  avg: number
): "healthy" | "needs review" | "at risk" | "no demand" {
  if (avg <= 0) return "no demand";

  const monthsOfSupply = (onHand + onOrder) / avg;

  if (monthsOfSupply > 3) return "healthy";
  if (monthsOfSupply > 1.5) return "needs review";
  return "at risk";
}

export default function ForecastSection() {
  const { rows, setRows } = useForecastData();
  const scheduleSave = useDebouncedSave();

  /* ---------------- Filters ---------------- */
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "healthy" | "needs review" | "at risk"
  >("all");

  /* ---------------- Months ---------------- */
  const months = useMemo(
    () => Array.from({ length: 6 }).map((_, i) => addMonths(new Date(), i)),
    []
  );

  /* ---------------- Updates ---------------- */
  function updateAvg(part: string, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.part === part ? { ...r, avg_monthly_demand: value } : r
      )
    );

    scheduleSave(`avg-${part}`, async () => {
      await supabase
        .from("inventory_products")
        .update({ avg_monthly_demand: value })
        .eq("part", part);
    });
  }

  function updateOnOrder(part: string, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.part === part ? { ...r, on_order: value } : r
      )
    );

    const row = rows.find((r) => r.part === part);
    if (!row?.snapshot_id) return;

    scheduleSave(`onorder-${part}`, async () => {
      await supabase
        .from("inventory_snapshot_items")
        .update({ on_order: value })
        .eq("id", row.snapshot_id);
    });
  }

  /* ---------------- Filtered Rows ---------------- */
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();

    return rows.filter((r) => {
      const status = getStatusLabel(
        r.on_hand,
        r.on_order,
        r.avg_monthly_demand
      );

      // Status dropdown filter
      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      // Search across part, name, fragrance, AND status text
      if (q) {
        const haystack = [
          r.part,
          r.display_name,
          r.fragrance,
          status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [rows, search, statusFilter]);

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-3">
      {/* Title + Filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-base font-medium">
          Inventory Forecast (Next 6 Months)
        </h2>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search name, fragrance, part, or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              h-8
              w-72
              rounded-md
              bg-blue-50
              text-blue-700
              placeholder-blue-400
              px-3
              text-xs
              outline-none
              ring-1
              ring-blue-100
              focus:ring-2
              focus:ring-blue-400
              focus:bg-white
            "
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as
                  | "all"
                  | "healthy"
                  | "needs review"
                  | "at risk"
              )
            }
            className="
              h-8
              rounded-md
              bg-blue-50
              text-blue-700
              px-2
              text-xs
              outline-none
              ring-1
              ring-blue-100
              focus:ring-2
              focus:ring-blue-400
              focus:bg-white
            "
          >
            <option value="all">All status</option>
            <option value="healthy">Healthy</option>
            <option value="needs review">Needs review</option>
            <option value="at risk">At risk</option>
          </select>
        </div>
      </div>

      <ForecastTable
        rows={filteredRows}
        months={months}
        onUpdateAvg={updateAvg}
        onUpdateOnOrder={updateOnOrder}
      />

      {filteredRows.length === 0 && (
        <div className="p-4 text-xs text-gray-500">
          No products match your filters.
        </div>
      )}
    </div>
  );
}
