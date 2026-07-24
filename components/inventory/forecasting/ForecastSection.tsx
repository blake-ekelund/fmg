"use client";

import { useMemo, useState } from "react";
import {
  Search,
  CalendarClock,
  ExternalLink,
  Download,
  Mail,
  Loader2,
  Check,
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addMonths } from "./utils/date";
import { project } from "./utils/forecast";
import { useForecastData } from "./hooks/useForecastData";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import ForecastTable from "./ForecastTable";
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
import { useUser } from "@/components/UserContext";
import { useBrandSettings } from "@/lib/brand-settings";
import { useIsMobile } from "@/lib/useIsMobile";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* Status filtering is a *set* of statuses, with the empty set meaning "all".
   Collapsing cleared and everything into one value keeps them from disagreeing.
   Desktop pills still write single-element sets, so their behaviour is
   unchanged; only the mobile dropdown writes more than one. */
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

/** The same statuses for the mobile dropdown, minus the synthetic "all" row. */
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

/** Quote-escape a single CSV cell value. */
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const [statusFilter, setStatusFilter] = useState<Set<InventoryStatus>>(
    () => new Set(),
  );
  const [sortKey, setSortKey] = useState<SortKey>("part");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("monthly");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailNote, setEmailNote] = useState<string | null>(null);

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

  /* ─── CSV export ─────────────────────────────────────────────────────
     Always exports 12 monthly columns regardless of the view toggle — the
     user came here for a monthly format. Respects the current search +
     status filters so the export matches what's on screen. */

  function buildCsv(): string {
    const now = new Date();
    const months = Array.from({ length: 12 }).map((_, i) => addMonths(now, i));
    const monthLabels = months.map((m) =>
      m.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    );

    const headers = [
      "Status",
      "Part",
      "Display Name",
      "Brand",
      "Fragrance",
      "Size",
      "Product Type",
      "On Hand",
      "On Order",
      "Avg Monthly Demand",
      "Lead Time (Months)",
      ...monthLabels,
    ];

    const lines: string[] = [headers.join(",")];
    for (const row of visibleRows) {
      const status = getInventoryStatus(
        row.on_hand,
        row.on_order,
        row.avg_monthly_demand,
      );
      const projections: number[] = [];
      for (let i = 0; i < 12; i++) {
        projections.push(Math.round(project(row, i, now)));
      }
      const cells: unknown[] = [
        status,
        row.part,
        row.display_name ?? "",
        row.brand,
        row.fragrance ?? "",
        row.size ?? "",
        row.product_type ?? "",
        row.on_hand,
        row.on_order,
        row.avg_monthly_demand,
        row.lead_time_months ?? 0,
        ...projections,
      ];
      lines.push(cells.map(csvCell).join(","));
    }

    return lines.join("\n");
  }

  function csvFilename(): string {
    return `inventory_forecast_${new Date().toISOString().split("T")[0]}.csv`;
  }

  /** Plain-English note of what the export was filtered to, for the email body. */
  function exportScope(): string {
    const parts: string[] = [];
    if (statusFilter.size > 0) {
      parts.push(`status ${[...statusFilter].map((s) => `"${s}"`).join(", ")}`);
    }
    if (search.trim()) parts.push(`search "${search.trim()}"`);
    if (brand !== "all") parts.push(`brand ${brand}`);
    return parts.length ? parts.join(", ") : "all products";
  }

  function handleDownload() {
    const blob = new Blob([buildCsv()], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", csvFilename());
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* Emails the same CSV to the signed-in user. On a phone a downloaded file is
     effectively gone, so this is the only export that actually lands. */
  async function handleEmailReport() {
    if (emailState === "sending") return;
    setEmailState("sending");
    setEmailNote(null);
    try {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;

      const res = await fetch("/api/inventory/email-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          csv: buildCsv(),
          filename: csvFilename(),
          scope: exportScope(),
          rowCount: visibleRows.length,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setEmailState("error");
        setEmailNote(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setEmailState("sent");
      setEmailNote(json?.sentTo ? `Sent to ${json.sentTo}` : "Sent");
    } catch (e) {
      setEmailState("error");
      setEmailNote(e instanceof Error ? e.message : String(e));
    }
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
      if (except !== "status" && statusFilter.size > 0) {
        const status = getInventoryStatus(
          r.on_hand,
          r.on_order,
          r.avg_monthly_demand,
        );
        if (!statusFilter.has(status)) return false;
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
      switch (effectiveSortKey) {
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
      if (cmp !== 0) return effectiveSortDir === "asc" ? cmp : -cmp;
      return a.part.localeCompare(b.part);
    });
    return sorted;
  }, [rows, passesFilters, effectiveSortKey, effectiveSortDir]);

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
      {/* Toolbar.

          Laid out as stacked rows rather than one wrapping line: on a phone a
          single row put the search box, five pills, a segmented toggle, Export
          and the snapshot chip into an unpredictable stack, and the pill group
          itself couldn't wrap — five pills need ~490px against ~343px of usable
          width, so the whole page scrolled sideways. */}
      <div className="space-y-2">
        {/* Row 1 — search. Mobile has no sort control by design: cards are
            always part-ascending, which is the order people scan for a SKU. */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-[260px]">
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
        </div>

        {/* Row 2 — status filter, with "Email to me" to its right.
            Mobile gets one multi-select dropdown; desktop keeps the pill row. */}
        <div className="flex items-start gap-2">
          <StatusFilterDropdown
            className="min-w-0 flex-1 md:hidden"
            options={STATUS_OPTIONS}
            selected={statusFilter}
            counts={counts}
            totalCount={counts.all}
            onChange={setStatusFilter}
          />

          <button
            onClick={handleEmailReport}
            disabled={visibleRows.length === 0 || emailState === "sending"}
            title="Email this report to yourself as a CSV attachment"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
          >
            {emailState === "sending" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : emailState === "sent" ? (
              <Check size={13} className="text-green-600" />
            ) : (
              <Mail size={13} />
            )}
            {emailState === "sending"
              ? "Sending…"
              : emailState === "sent"
                ? "Emailed"
                : "Email to me"}
          </button>

          <div className="hidden flex-wrap gap-1 md:flex">
          {STATUS_PILLS.map((opt) => {
            /* Pills stay single-select: clicking one replaces the selection.
               Only the mobile dropdown builds multi-status sets. */
            const active =
              statusFilter.size === 0
                ? opt.value === "all"
                : opt.value !== "all" &&
                  statusFilter.has(opt.value as InventoryStatus);
            const count = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() =>
                  setStatusFilter(
                    opt.value === "all"
                      ? new Set()
                      : new Set([opt.value as InventoryStatus]),
                  )
                }
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
        </div>

        {/* Row 3 — view, export, snapshot freshness */}
        <div className="flex flex-wrap items-center gap-2">
        {/* View toggle: monthly / quarterly. Desktop only — a phone shows the
            monthly view and nothing else, so there's no choice to offer. */}
        <div className="hidden md:inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
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

        {/* Export. Desktop downloads the CSV; a download on a phone lands
            somewhere the user can't get at, so mobile mails it instead. */}
        <button
          onClick={handleDownload}
          disabled={visibleRows.length === 0}
          title="Download visible rows as CSV with 12-month forecast"
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={13} />
          Export
        </button>

        <button
          onClick={handleEmailReport}
          disabled={visibleRows.length === 0 || emailState === "sending"}
          title="Email this report to yourself as a CSV attachment"
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {emailState === "sending" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : emailState === "sent" ? (
            <Check size={13} className="text-green-600" />
          ) : (
            <Mail size={13} />
          )}
          {emailState === "sending"
            ? "Sending…"
            : emailState === "sent"
              ? "Emailed"
              : "Email to me"}
        </button>

        {/* Snapshot freshness — pinned to the far right of its own row. On a
            phone it's the only thing on that row, sitting under the filter. */}
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
          {/* Uploading a snapshot is a desktop job — it means picking a file
              off a machine that has one. Hidden on mobile entirely. */}
          {isAdmin && !isMobile && (
            <Link
              href="/integrations"
              className="ml-1 inline-flex items-center gap-0.5 underline hover:text-gray-900"
            >
              Upload
              <ExternalLink size={11} />
            </Link>
          )}
        </div>
        </div>

        {emailNote && (
          <p
            className={clsx(
              "text-xs",
              emailState === "error" ? "text-red-600" : "text-gray-500",
            )}
          >
            {emailNote}
          </p>
        )}
      </div>

      {/* Table */}
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

      {visibleRows.length === 0 && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No products match your filters.
        </div>
      )}
    </div>
  );
}
