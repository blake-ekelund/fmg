"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  ShoppingCart,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

import InventoryUploadModal from "@/components/inventory/current/InventoryUploadModal";
import SalesUploadModal from "@/components/inventory/current/SalesUploadModal";

type UploadType = "inventory" | "sales";
type UploadFilter = "all" | UploadType;

const PAGE_SIZE = 15;

type Row = {
  id: string;
  type: UploadType;
  filename: string;
  records: number | null;
  status: "complete" | "processing" | "failed";
  errorText: string | null;
  createdAt: string;
  warehouse?: string | null;
};

export default function DataPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UploadFilter>("all");
  const [page, setPage] = useState(0);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [pickerOpen]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [invRes, salesRes] = await Promise.all([
      supabase
        .from("inventory_uploads")
        .select("id, warehouse, original_filename, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("sales_uploads")
        .select(
          "id, original_filename_orders, original_filename_items, status, orders_rows, items_rows, error_text, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (invRes.error) {
      setError(invRes.error.message);
      setLoading(false);
      return;
    }
    if (salesRes.error) {
      setError(salesRes.error.message);
      setLoading(false);
      return;
    }

    // Inventory row counts — one query per upload would be wasteful; do one
    // aggregate query and bucket client-side.
    const invIds = (invRes.data ?? []).map((r) => r.id as string);
    const invCounts = new Map<string, number>();
    if (invIds.length > 0) {
      // Pull just upload_id for matching rows, count client-side. Bounded by
      // total inventory rows across recent uploads — fine at our scale.
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("inventory_snapshot_items")
          .select("upload_id")
          .in("upload_id", invIds)
          .range(offset, offset + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) {
          const id = (r as { upload_id: string }).upload_id;
          invCounts.set(id, (invCounts.get(id) ?? 0) + 1);
        }
        if (data.length < PAGE) break;
        offset += PAGE;
      }
    }

    const invRows: Row[] = (invRes.data ?? []).map((r) => {
      const row = r as {
        id: string;
        warehouse: string | null;
        original_filename: string | null;
        created_at: string;
      };
      return {
        id: row.id,
        type: "inventory" as const,
        filename: row.original_filename ?? "—",
        records: invCounts.get(row.id) ?? 0,
        status: "complete" as const,
        errorText: null,
        createdAt: row.created_at,
        warehouse: row.warehouse,
      };
    });

    const salesRows: Row[] = (salesRes.data ?? []).map((r) => {
      const row = r as {
        id: string;
        original_filename_orders: string | null;
        original_filename_items: string | null;
        status: "complete" | "processing" | "failed" | null;
        orders_rows: number | null;
        items_rows: number | null;
        error_text: string | null;
        created_at: string;
      };
      const orders = row.original_filename_orders ?? "Orders";
      const items = row.original_filename_items ?? "Items";
      const ordersCount = row.orders_rows ?? 0;
      const itemsCount = row.items_rows ?? 0;
      return {
        id: row.id,
        type: "sales" as const,
        filename: `${orders} + ${items}`,
        records:
          ordersCount || itemsCount ? ordersCount + itemsCount : null,
        status: (row.status ?? "complete") as Row["status"],
        errorText: row.error_text,
        createdAt: row.created_at,
      };
    });

    const merged = [...invRows, ...salesRows].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );

    setRows(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.type === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    return {
      all: rows.length,
      inventory: rows.filter((r) => r.type === "inventory").length,
      sales: rows.filter((r) => r.type === "sales").length,
    };
  }, [rows]);

  // Reset to first page whenever the filter changes
  useEffect(() => {
    setPage(0);
  }, [filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const paginated = filtered.slice(pageStart, pageEnd);

  function pickType(t: UploadType) {
    setPickerOpen(false);
    if (t === "inventory") setShowInventoryModal(true);
    else setShowSalesModal(true);
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter pills */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(
            [
              { v: "all", label: `All (${counts.all})` },
              { v: "inventory", label: `Inventory (${counts.inventory})` },
              { v: "sales", label: `Sales (${counts.sales})` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setFilter(opt.v)}
              className={clsx(
                "px-4 py-2 rounded-md transition font-medium",
                filter === opt.v
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Upload picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
          >
            <Upload size={14} />
            Upload data
            <ChevronDown size={12} className="opacity-70" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
              <button
                onClick={() => pickType("inventory")}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
              >
                <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    Inventory snapshot
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Current stock + on-order by warehouse
                  </div>
                </div>
              </button>
              <button
                onClick={() => pickType("sales")}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-t border-gray-100"
              >
                <div className="h-7 w-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShoppingCart size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    Sales orders + items
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Orders.xls + Items.csv from Fishbowl
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_120px_140px_180px] gap-3 px-5 py-2.5 border-b border-gray-100 text-[11px] font-medium uppercase tracking-wider text-gray-500 bg-gray-50/60">
          <div>Type</div>
          <div>File</div>
          <div className="text-right">Records</div>
          <div>Status</div>
          <div>Uploaded</div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="px-5 py-4 text-sm text-red-700 bg-red-50 border-t border-red-100">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Database size={20} className="mx-auto text-gray-300 mb-2" />
            <div className="text-sm text-gray-500">No uploads yet</div>
            <div className="text-[11px] text-gray-400 mt-1">
              Click <span className="font-medium">Upload data</span> to add
              your first file.
            </div>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {paginated.map((r) => (
                <DataRow key={r.id} row={r} />
              ))}
            </div>
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
                <div>
                  Showing{" "}
                  <span className="font-medium text-gray-700 tabular-nums">
                    {pageStart + 1}–{pageEnd}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-700 tabular-nums">
                    {filtered.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft size={12} />
                    Prev
                  </button>
                  <span className="px-2 tabular-nums">
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(pageCount - 1, p + 1))
                    }
                    disabled={safePage >= pageCount - 1}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <InventoryUploadModal
        open={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        onUploaded={fetchRows}
      />
      <SalesUploadModal
        open={showSalesModal}
        onClose={() => setShowSalesModal(false)}
        onUploaded={fetchRows}
      />
    </div>
  );
}

function DataRow({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-[140px_1fr_120px_140px_180px] gap-3 px-5 py-3 items-center hover:bg-gray-50/50 transition">
      <div>
        <TypeBadge type={row.type} />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-gray-900 truncate" title={row.filename}>
          {row.filename}
        </div>
        {row.warehouse && (
          <div className="text-[11px] text-gray-500 mt-0.5">
            Warehouse: {row.warehouse}
          </div>
        )}
        {row.errorText && (
          <div
            className="text-[11px] text-red-600 mt-0.5 truncate"
            title={row.errorText}
          >
            {row.errorText}
          </div>
        )}
      </div>
      <div className="text-sm text-gray-700 tabular-nums text-right">
        {row.records != null ? row.records.toLocaleString() : "—"}
      </div>
      <div>
        <StatusBadge status={row.status} />
      </div>
      <div className="text-xs text-gray-500">{fmtDate(row.createdAt)}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: UploadType }) {
  if (type === "inventory") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
        <FileSpreadsheet size={11} />
        Inventory
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
      <ShoppingCart size={11} />
      Sales
    </span>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle2 size={12} />
        Complete
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Clock size={12} />
        Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700">
      <AlertTriangle size={12} />
      Failed
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
