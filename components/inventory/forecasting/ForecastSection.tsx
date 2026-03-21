"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { addMonths } from "./utils/date";
import { useForecastData } from "./hooks/useForecastData";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import ForecastTable from "./ForecastTable";

type StatusFilter = "all" | "healthy" | "needs review" | "at risk";

const STATUS_OPTIONS: { value: StatusFilter; label: string; color: string; activeColor: string }[] = [
  { value: "all", label: "All", color: "bg-white text-gray-500 border-gray-200 hover:border-gray-300", activeColor: "bg-gray-900 text-white border-gray-900" },
  { value: "healthy", label: "Healthy", color: "bg-white text-gray-500 border-gray-200 hover:border-gray-300", activeColor: "bg-green-50 text-green-700 border-green-200" },
  { value: "needs review", label: "Review", color: "bg-white text-gray-500 border-gray-200 hover:border-gray-300", activeColor: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "at risk", label: "At Risk", color: "bg-white text-gray-500 border-gray-200 hover:border-gray-300", activeColor: "bg-red-50 text-red-700 border-red-200" },
];

function getStatusLabel(
  onHand: number,
  onOrder: number,
  avg: number
): "healthy" | "needs review" | "at risk" | "no demand" {
  if (avg <= 0) return "no demand";
  const mos = (onHand + onOrder) / avg;
  if (mos > 3) return "healthy";
  if (mos > 1.5) return "needs review";
  return "at risk";
}

export default function ForecastSection() {
  const { rows, setRows } = useForecastData();
  const scheduleSave = useDebouncedSave();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const months = useMemo(
    () => Array.from({ length: 12 }).map((_, i) => addMonths(new Date(), i)),
    []
  );

  /* ─── Updates ─── */
  function updateAvg(part: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.part === part ? { ...r, avg_monthly_demand: value } : r))
    );
    scheduleSave(`avg-${part}`, async () => {
      await supabase.from("inventory_products").update({ avg_monthly_demand: value }).eq("part", part);
    });
  }

  function updateOnOrder(part: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.part === part ? { ...r, on_order: value } : r))
    );
    const row = rows.find((r) => r.part === part);
    if (!row?.snapshot_id) return;
    scheduleSave(`onorder-${part}`, async () => {
      await supabase.from("inventory_snapshot_items").update({ on_order: value }).eq("id", row.snapshot_id);
    });
  }

  /* ─── Filtered Rows ─── */
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      const status = getStatusLabel(r.on_hand, r.on_order, r.avg_monthly_demand);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (q) {
        const haystack = [r.part, r.display_name, r.fragrance, status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  /* ─── Status counts ─── */
  const counts = useMemo(() => {
    const c = { healthy: 0, "needs review": 0, "at risk": 0 };
    rows.forEach((r) => {
      const s = getStatusLabel(r.on_hand, r.on_order, r.avg_monthly_demand);
      if (s !== "no demand") c[s]++;
    });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search part, name, or fragrance…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
          />
        </div>

        {/* Status pills */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => {
            const count = opt.value === "all" ? rows.length : counts[opt.value as keyof typeof counts] ?? 0;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition",
                  statusFilter === opt.value ? opt.activeColor : opt.color
                )}
              >
                {opt.label}
                <span className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium",
                  statusFilter === opt.value ? "bg-black/10" : "bg-gray-100 text-gray-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <ForecastTable
        rows={filteredRows}
        months={months}
        onUpdateAvg={updateAvg}
        onUpdateOnOrder={updateOnOrder}
      />

      {filteredRows.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No products match your filters.
        </div>
      )}
    </div>
  );
}
