"use client";

import { useMemo, useState } from "react";
import { Search, CalendarClock, ExternalLink } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addMonths } from "./utils/date";
import { useForecastData } from "./hooks/useForecastData";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import ForecastTable from "./ForecastTable";
import {
  ForecastRow as Row,
  Period,
  ViewMode,
  SortKey,
  SortDir,
  InventoryStatus,
  STATUS_RANK,
  getInventoryStatus,
} from "./types";
import { useBrand } from "@/components/BrandContext";
import { useUser } from "@/components/UserContext";
import { useBrandSettings } from "@/lib/brand-settings";

type StatusFilter = "all" | InventoryStatus;

const STATUS_PILLS: { value: StatusFilter; label: string; activeClass: string }[] = [
  {
    value: "all",
    label: "All",
    activeClass: "bg-gray-900 text-white border-gray-900",
  },
  {
    value: "at risk",
    label: "At risk",
    activeClass: "bg-red-50 text-red-700 border-red-200",
  },
  {
    value: "needs review",
    label: "Review",
    activeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "healthy",
    label: "Healthy",
    activeClass: "bg-green-50 text-green-700 border-green-200",
  },
  {
    value: "no demand",
    label: "No demand",
    activeClass: "bg-gray-100 text-gray-700 border-gray-300",
  },
];

const IDLE_CLASS =
  "bg-white text-gray-500 border-gray-200 hover:border-gray-300";

function shortMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}

function shortMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ForecastSection() {
  const router = useRouter();
  const { rows, setRows, snapshotDate } = useForecastData();
  const scheduleSave = useDebouncedSave();
  const { brand } = useBrand();
  const { profile } = useUser();
  const { byBrand } = useBrandSettings();
  const isAdmin = profile?.access === "owner" || profile?.access === "admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("part");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("monthly");

  /* ─── Periods (monthly = 12 cols, quarterly = 4 cols) ─── */

  const periods = useMemo<Period[]>(() => {
    const now = new Date();
    if (view === "quarterly") {
      // End-of-quarter projections, from "now" forward in 3-month chunks.
      return [0, 3, 6, 9].map((startMonth) => {
        const start = addMonths(now, startMonth);
        const end = addMonths(now, startMonth + 2);
        return {
          label: `${shortMonth(start)}–${shortMonth(end)}`,
          index: startMonth + 2,
        };
      });
    }
    return Array.from({ length: 12 }).map((_, i) => ({
      label: shortMonthYear(addMonths(now, i)),
      index: i,
    }));
  }, [view]);

  /* ─── Updates ─── */

  function updateAvg(part: string, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.part === part
          ? { ...r, avg_monthly_demand: value, is_auto_avg: false }
          : r,
      ),
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
      prev.map((r) => (r.part === part ? { ...r, on_order: value } : r)),
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

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  /* ─── Cross-filter helper ───────────────────────────────────────────
     `passesFilters(row, except)` returns true if the row matches every
     active filter *other than* the named dimension. Used to derive pill
     counts that reflect "what would show if you clicked it." */

  const passesFilters = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (r: Row, except: "status" | null): boolean => {
      if (q) {
        const status = getInventoryStatus(
          r.on_hand,
          r.on_order,
          r.avg_monthly_demand,
        );
        const haystack = [r.part, r.display_name, r.fragrance, status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (except !== "status" && statusFilter !== "all") {
        const status = getInventoryStatus(
          r.on_hand,
          r.on_order,
          r.avg_monthly_demand,
        );
        if (status !== statusFilter) return false;
      }
      return true;
    };
  }, [search, statusFilter]);

  /* ─── Pill counts (cross-filtered) ─── */

  const counts = useMemo(() => {
    const pool = rows.filter((r) => passesFilters(r, "status"));
    const c: Record<StatusFilter, number> = {
      all: pool.length,
      healthy: 0,
      "needs review": 0,
      "at risk": 0,
      "no demand": 0,
    };
    for (const r of pool) {
      const s = getInventoryStatus(
        r.on_hand,
        r.on_order,
        r.avg_monthly_demand,
      );
      c[s]++;
    }
    return c;
  }, [rows, passesFilters]);

  /* ─── Filter + sort ─── */

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((r) => passesFilters(r, null));
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "status": {
          const sa =
            STATUS_RANK[
              getInventoryStatus(a.on_hand, a.on_order, a.avg_monthly_demand)
            ];
          const sb =
            STATUS_RANK[
              getInventoryStatus(b.on_hand, b.on_order, b.avg_monthly_demand)
            ];
          cmp = sa - sb;
          break;
        }
        case "part":
          cmp = a.part.localeCompare(b.part);
          break;
        case "display_name":
          cmp = (a.display_name ?? "").localeCompare(b.display_name ?? "");
          break;
        case "fragrance":
          cmp = (a.fragrance ?? "").localeCompare(b.fragrance ?? "");
          break;
        case "on_hand":
          cmp = a.on_hand - b.on_hand;
          break;
        case "on_order":
          cmp = a.on_order - b.on_order;
          break;
        case "avg_monthly_demand":
          cmp = a.avg_monthly_demand - b.avg_monthly_demand;
          break;
      }
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      return a.part.localeCompare(b.part);
    });
    return sorted;
  }, [rows, passesFilters, sortKey, sortDir]);

  /* ─── Snapshot freshness ─── */

  const snapshotMeta = useMemo(() => {
    if (!snapshotDate) {
      return {
        label: "No snapshot uploaded yet",
        days: null as number | null,
        stale: true,
      };
    }
    const days = daysSince(snapshotDate);
    const dateStr = snapshotDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return {
      label: `Snapshot ${dateStr} · ${days === 0 ? "today" : `${days}d ago`}`,
      days,
      stale: days >= 14,
    };
  }, [snapshotDate]);

  /* ─── Render ─── */

  const showBrand = brand === "all";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search part, name, fragrance…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {/* Status pills (cross-filtered counts) */}
        <div className="flex gap-1">
          {STATUS_PILLS.map((opt) => {
            const active = statusFilter === opt.value;
            const count = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition",
                  active ? opt.activeClass : IDLE_CLASS,
                )}
              >
                {opt.label}
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium tabular-nums",
                    active ? "bg-black/10" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View toggle: monthly / quarterly */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setView("monthly")}
            className={clsx(
              "rounded-md px-2.5 py-1 transition font-medium",
              view === "monthly"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setView("quarterly")}
            className={clsx(
              "rounded-md px-2.5 py-1 transition font-medium",
              view === "quarterly"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            Quarterly
          </button>
        </div>

        {/* Snapshot freshness (pushed right) */}
        <div
          className={clsx(
            "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
            snapshotMeta.stale
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-gray-200 bg-white text-gray-500",
          )}
        >
          <CalendarClock size={12} />
          <span>{snapshotMeta.label}</span>
          {isAdmin && (
            <Link
              href="/data"
              className="ml-1 inline-flex items-center gap-0.5 underline hover:text-gray-900"
            >
              Upload
              <ExternalLink size={11} />
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <ForecastTable
        rows={visibleRows}
        periods={periods}
        showBrand={showBrand}
        brandSettings={byBrand}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(part) =>
          router.push(`/products/${encodeURIComponent(part)}`)
        }
        onUpdateAvg={updateAvg}
        onUpdateOnOrder={updateOnOrder}
      />

      {visibleRows.length === 0 && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No products match your filters.
        </div>
      )}
    </div>
  );
}
