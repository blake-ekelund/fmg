"use client";

import { useMemo, useState } from "react";
import { Search, X, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isOverstock } from "@/lib/inventoryHealth";
import { addMonths } from "./utils/date";
import { useForecastData } from "./hooks/useForecastData";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import ForecastTable from "./ForecastTable";
import DemandTable from "./DemandTable";
import { invalidateDemandProfiles } from "@/lib/demandClient";
import {
  addMonths as addMonthKeys,
  monthKey,
  withMonthOverride,
  withoutOverrides,
  type DemandProfile,
} from "@/lib/seasonalDemand";
import StatusFilterDropdown from "./StatusFilterDropdown";
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
import { useBrandSettings } from "@/lib/brand-settings";
import { useIsMobile } from "@/lib/useIsMobile";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* Status filtering is a *set* of statuses, with the empty set meaning "all".
   Collapsing cleared and everything into one value keeps them from disagreeing.
   A single multiselect dropdown (all breakpoints) writes this set. The "all"
   member below is only used as a key for the total in the counts record. */
type StatusFilter = "all" | InventoryStatus;

/** Status options for the multiselect dropdown (no synthetic "all" row —
    an empty selection already means "all"). */
const STATUS_OPTIONS: {
  value: InventoryStatus;
  label: string;
  dotClass: string;
}[] = [
  { value: "at risk", label: "At risk", dotClass: "bg-red-500" },
  { value: "needs review", label: "Review", dotClass: "bg-amber-500" },
  { value: "healthy", label: "Healthy", dotClass: "bg-green-500" },
  { value: "no demand", label: "No demand", dotClass: "bg-gray-400" },
];

function shortMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}

function shortMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function ForecastSection({
  initialFilter,
}: {
  /** Seeded from the dashboard's deep-links (?filter=understock|overstock). */
  initialFilter?: string;
}) {
  const router = useRouter();
  const { rows, setRows, reload } = useForecastData();
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  /* "Refresh inventory": pull a fresh Fishbowl snapshot (the same ?now=1 run
     the Integrations "Sync now" button uses, so the shrink guard still
     applies), then save Point B's count for the storefronts (after Fishbowl,
     because that sync judges units against the new snapshot), then reload —
     which re-reads the new snapshot AND Point B live. Nothing is written to
     Fishbowl or Synapse. Each step's failure is reported but doesn't stop the
     next, so the page always ends up as current as it can be. */
  async function handleRefreshInventory() {
    if (refreshState === "running") return;
    setRefreshState("running");
    setRefreshNote(null);
    const notes: string[] = [];
    let failed = false;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const call = async (path: string) => {
      const res = await fetch(path, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    };

    try {
      const fb = await call("/api/cron/fishbowl-inventory-sync?now=1");
      if (fb.ok && fb.json?.synced) notes.push(`Fishbowl re-pulled (${fb.json.parts} parts)`);
      else {
        failed = true;
        notes.push(`Fishbowl not refreshed: ${fb.json?.reason ?? fb.json?.error ?? `HTTP ${fb.status}`}`);
      }
    } catch (e) {
      failed = true;
      notes.push(`Fishbowl not refreshed: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const pb = await call("/api/cron/pointb-inventory-sync");
      if (pb.ok && pb.json?.synced) notes.push(`stores updated from Point B (${pb.json.inStock} in stock)`);
      else {
        failed = true;
        notes.push(`stores not updated: ${pb.json?.reason ?? pb.json?.error ?? `HTTP ${pb.status}`}`);
      }
    } catch (e) {
      failed = true;
      notes.push(`stores not updated: ${e instanceof Error ? e.message : String(e)}`);
    }

    notes.push("Point B re-read live");
    setRefreshState(failed ? "error" : "done");
    setRefreshNote(notes.join(" · "));
    reload();
  }
  const scheduleSave = useDebouncedSave();
  const { brand } = useBrand();
  const { byBrand } = useBrandSettings();

  const [search, setSearch] = useState("");
  /* Deep-links from the dashboard seed the initial view: understock maps to the
     two short-of-cover statuses; overstock flips the slow-mover toggle. Seeded
     via the initializer (from a server-derived prop) rather than an effect, so
     there's no setState-in-effect and no hydration mismatch. */
  const [statusFilter, setStatusFilter] = useState<Set<InventoryStatus>>(() =>
    initialFilter === "understock"
      ? new Set<InventoryStatus>(["at risk", "needs review"])
      : new Set(),
  );
  /* Slow-mover overstock isn't a status (it's a subset of "healthy" refined by
     velocity), so it rides alongside the status filter as its own toggle. */
  const [overstockOnly, setOverstockOnly] = useState(
    initialFilter === "overstock",
  );

  /* Any manual status change clears the overstock toggle — otherwise the
     synthetic filter would silently keep narrowing what the pills claim to show. */
  function applyStatusFilter(next: Set<InventoryStatus>) {
    setStatusFilter(next);
    setOverstockOnly(false);
  }
  const [sortKey, setSortKey] = useState<SortKey>("part");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("monthly");

  /* Phones get a deliberately narrower product: monthly only, sorted by part,
     no uploading. These are forced in JS rather than just hidden in CSS —
     otherwise a desktop user who sorted by "on hand" and then narrowed their
     window would land on a mobile view with no way to undo it. */
  const isMobile = useIsMobile();
  const effectiveView: ViewMode = isMobile ? "monthly" : view;
  const effectiveSortKey: SortKey = isMobile ? "part" : sortKey;
  const effectiveSortDir: SortDir = isMobile ? "asc" : sortDir;

  /* ─── Periods (monthly = 12 cols, quarterly = 4 cols) ─── */

  const periods = useMemo<Period[]>(() => {
    const now = new Date();
    if (effectiveView === "quarterly") {
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
  }, [effectiveView]);

  /* ─── Updates ─── */

  function updateAvg(part: string, value: number) {
    // Seasonal rows are forecast from their own sales history — a typed number
    // wouldn't be used, so the cell is read-only there (ForecastRow/Table).
    if (rows.find((r) => r.part === part)?.demand?.method === "seasonal") return;
    setRows((prev) =>
      prev.map((r) =>
        r.part === part
          ? // A typed number replaces the flat profile, so projections use it now.
            // Hand-set months (Demand view) stay on top of the new flat figure.
            r.demand?.overridden
              ? {
                  ...r,
                  is_auto_avg: false,
                  ...(() => {
                    const d = r.demand!;
                    const base = Array(12).fill(value) as number[];
                    const monthly = base.map((v, i) => (d.overridden![i] ? d.monthly[i] : v));
                    const avg = monthly.reduce((x, y) => x + y, 0) / 12;
                    return {
                      demand: { ...d, method: "manual" as const, base, monthly, avg },
                      avg_monthly_demand: Math.round(avg),
                    };
                  })(),
                }
              : { ...r, avg_monthly_demand: value, is_auto_avg: false, demand: undefined }
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

  /* ─── Demand view: hand-set months ─── */

  const [demandSaving, setDemandSaving] = useState<Set<string>>(new Set());
  const [demandError, setDemandError] = useState<string | null>(null);
  const demandStart = monthKey(new Date());

  /** Swap a row's profile (and the avg / status that follow from it). */
  function putProfile(part: string, profile: DemandProfile) {
    setRows((prev) =>
      prev.map((r) =>
        r.part === part
          ? { ...r, demand: profile, avg_monthly_demand: Math.round(profile.avg) }
          : r,
      ),
    );
  }

  async function demandRequest(method: "PUT" | "DELETE", body: Record<string, unknown>) {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/inventory/demand-overrides", {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Save failed (${res.status})`);
    }
    // The dashboard, Purchasing and product pages re-read on their next load.
    invalidateDemandProfiles();
  }

  function busy(key: string, on: boolean) {
    setDemandSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Set one SKU-month by hand. Optimistic; reverted if the save fails. */
  async function setDemand(part: string, i: number, units: number) {
    const before = rows.find((r) => r.part === part)?.demand;
    if (!before) {
      setDemandError("The forecast for this SKU hasn't loaded yet, so it can't be overridden. Try again in a moment.");
      return;
    }
    setDemandError(null);
    putProfile(part, withMonthOverride(before, i, units));
    busy(`${part}|${i}`, true);
    try {
      await demandRequest("PUT", { part, month: addMonthKeys(before.startMonth, i), units });
    } catch (e) {
      putProfile(part, before);
      setDemandError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      busy(`${part}|${i}`, false);
    }
  }

  /** Back to the forecast: one month, or (no index) every month for the SKU. */
  async function resetDemand(part: string, i?: number) {
    const before = rows.find((r) => r.part === part)?.demand;
    if (!before) return;
    setDemandError(null);
    putProfile(part, i === undefined ? withoutOverrides(before) : withMonthOverride(before, i, null));
    const key = `${part}|${i ?? "*"}`;
    busy(key, true);
    try {
      await demandRequest(
        "DELETE",
        i === undefined ? { part } : { part, month: addMonthKeys(before.startMonth, i) },
      );
    } catch (e) {
      putProfile(part, before);
      setDemandError(e instanceof Error ? e.message : "Couldn't reset that.");
    } finally {
      busy(key, false);
    }
  }

  const overriddenCount = useMemo(
    () => rows.filter((r) => r.demand?.overridden?.some(Boolean)).length,
    [rows],
  );

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
          r.demand,
        );
        const haystack = [r.part, r.display_name, r.fragrance, status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (except !== "status" && statusFilter.size > 0) {
        const status = getInventoryStatus(
          r.on_hand,
          r.on_order,
          r.avg_monthly_demand,
          r.demand,
        );
        if (!statusFilter.has(status)) return false;
      }
      if (overstockOnly && !isOverstock(r)) return false;
      return true;
    };
  }, [search, statusFilter, overstockOnly]);

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
        r.demand,
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
      switch (effectiveSortKey) {
        case "status": {
          const sa =
            STATUS_RANK[
              getInventoryStatus(a.on_hand, a.on_order, a.avg_monthly_demand, a.demand)
            ];
          const sb =
            STATUS_RANK[
              getInventoryStatus(b.on_hand, b.on_order, b.avg_monthly_demand, b.demand)
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
        case "fishbowl_on_hand":
          cmp = (a.fishbowl_on_hand ?? -Infinity) - (b.fishbowl_on_hand ?? -Infinity);
          break;
        case "variance":
          // Lines that can't be compared sort as 0 rather than to one end.
          cmp = (a.variance ?? 0) - (b.variance ?? 0);
          break;
        case "on_order":
          cmp = a.on_order - b.on_order;
          break;
        case "avg_monthly_demand":
          cmp = a.avg_monthly_demand - b.avg_monthly_demand;
          break;
      }
      if (cmp !== 0) return effectiveSortDir === "asc" ? cmp : -cmp;
      return a.part.localeCompare(b.part);
    });
    return sorted;
  }, [rows, passesFilters, effectiveSortKey, effectiveSortDir]);

  /* ─── Render ─── */

  const showBrand = brand === "all";

  return (
    <div className="space-y-3">
      {/* Toolbar — search, status multiselect, view and refresh on one row
          (wraps only when the viewport is too narrow to hold it). */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] max-w-[320px] flex-1">
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

          {/* Status — multiselect dropdown on every breakpoint */}
          <StatusFilterDropdown
            className="w-[190px] shrink-0"
            options={STATUS_OPTIONS}
            selected={statusFilter}
            counts={counts}
            totalCount={counts.all}
            onChange={applyStatusFilter}
          />

          {/* View toggle: monthly / quarterly. Desktop only — a phone shows the
              monthly view and nothing else, so there's no choice to offer. */}
          <div className="hidden shrink-0 rounded-lg border border-gray-200 bg-white p-0.5 text-xs md:inline-flex">
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
            <button
              onClick={() => setView("demand")}
              title="Expected units per SKU per month. Type over a month to set it by hand."
              className={clsx(
                "rounded-md px-2.5 py-1 transition font-medium",
                view === "demand"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              Demand
            </button>
          </div>

          {/* Refresh both systems at once */}
          <button
            onClick={handleRefreshInventory}
            disabled={refreshState === "running"}
            title="Pull a fresh Fishbowl snapshot, update the storefronts from Point B, and re-read Point B live (changes nothing in Fishbowl or Point B)"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-60 disabled:cursor-wait"
          >
            <RefreshCw size={13} className={clsx(refreshState === "running" && "animate-spin")} />
            {refreshState === "running" ? "Refreshing…" : "Refresh inventory"}
          </button>
        </div>

        {/* Slow-mover overstock is a synthetic filter with no matching status,
            so when it's on we surface a dismissible chip — otherwise the
            narrowed list looks unexplained. */}
        {overstockOnly && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700">
              Overstock · slow movers ({visibleRows.length})
              <button
                onClick={() => setOverstockOnly(false)}
                className="rounded-full p-0.5 hover:bg-violet-100"
                aria-label="Clear overstock filter"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        {effectiveView === "demand" && (
          <p className="text-xs text-gray-500">
            Expected units sold each month. Type over a month to set it by hand. Your number is
            used for projections, status, Purchasing and the dashboard, and stays until you reset it
            (hover the cell for ↺, or Reset SKU).
            {overriddenCount > 0 ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                {overriddenCount} SKU{overriddenCount === 1 ? "" : "s"} with hand-set months
              </span>
            ) : null}
          </p>
        )}

        {demandError && <p className="text-xs text-red-600">{demandError}</p>}

        {refreshNote && (
          <p
            className={clsx(
              "text-xs",
              refreshState === "error" ? "text-amber-700" : "text-gray-500",
            )}
          >
            {refreshNote}
          </p>
        )}

      </div>

      {/* Table */}
      {effectiveView === "demand" ? (
        <DemandTable
          rows={visibleRows}
          startMonth={demandStart}
          saving={demandSaving}
          onSet={(part, i, units) => void setDemand(part, i, units)}
          onReset={(part, i) => void resetDemand(part, i)}
          onRowClick={(part) => router.push(`/products/${encodeURIComponent(part)}`)}
        />
      ) : (
      <ForecastTable
        rows={visibleRows}
        periods={periods}
        showBrand={showBrand}
        brandSettings={byBrand}
        sortKey={effectiveSortKey}
        sortDir={effectiveSortDir}
        onSort={handleSort}
        onRowClick={(part) =>
          router.push(`/products/${encodeURIComponent(part)}`)
        }
        onUpdateAvg={updateAvg}
        onUpdateOnOrder={updateOnOrder}
      />
      )}

      {visibleRows.length === 0 && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No products match your filters.
        </div>
      )}
    </div>
  );
}
