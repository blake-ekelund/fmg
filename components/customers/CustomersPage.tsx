"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCustomers, applyFilters } from "./hooks/useCustomers";
import CustomersHeader from "./CustomersHeader";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomersCardGrid from "./CustomersCardGrid";
import { LayoutGrid, List } from "lucide-react";
import clsx from "clsx";

type SortDir = "asc" | "desc";
type SortColumn =
  | "name"
  | "last_order_date"
  | "last_order_amount"
  | "sales_2026"
  | "sales_2025"
  | "sales_2024"
  | "sales_2023";

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");

  const [sortColumn, setSortColumn] =
    useState<SortColumn>("last_order_date");
  const [sortDir, setSortDir] =
    useState<SortDir>("desc");

  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  /* Export column picker state */
  const [exportColumns, setExportColumns] = useState<Record<string, boolean>>({
    Name: true,
    ID: true,
    State: true,
    Channel: true,
    Status: true,
    "Sales 2024": true,
    "Sales 2025": true,
    "Last Order Date": true,
    Email: true,
    Phone: true,
  });

  const {
    customers = [],
    loading = false,
    totalCount = 0,
    channelOptions = [],
    stats = {
      active: 0,
      atRisk: 0,
      churned: 0,
    },
  } = useCustomers({
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
    channel,
    sortColumn,
    sortDir,
  });

  /* Reset page when filters/sort change */
  useEffect(() => {
    setPage(0);
  }, [search, status, channel, sortColumn, sortDir]);

  const totalPages =
    totalCount > 0
      ? Math.ceil(totalCount / PAGE_SIZE)
      : 1;

  const canGoNext = page + 1 < totalPages;
  const canGoPrev = page > 0;

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((prev) =>
        prev === "asc" ? "desc" : "asc"
      );
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  /* -------------------------------------------
     DOWNLOAD (Full Filtered Dataset)
  -------------------------------------------- */

  /* Column key -> DB field mapping */
  const columnFieldMap: Record<string, string> = {
    Name: "name",
    ID: "customerid",
    State: "bill_to_state",
    Channel: "channel",
    Status: "last_order_date",
    "Sales 2024": "sales_2024",
    "Sales 2025": "sales_2025",
    "Last Order Date": "last_order_date",
    Email: "email",
    Phone: "phone",
  };

  async function handleDownload() {
    try {
      setDownloading(true);

      let query = supabase
        .from("customer_summary")
        .select("*")
        .range(0, 4999);

      query = applyFilters(query, search, status, channel);

      const { data, error } = await query;

      if (error) {
        console.error(error);
        return;
      }

      if (!data || data.length === 0) return;

      const selectedCols = Object.entries(exportColumns)
        .filter(([, checked]) => checked)
        .map(([key]) => key);

      if (selectedCols.length === 0) return;

      const headers = selectedCols;

      const csvRows = [
        headers.join(","),
        ...data.map((row: Record<string, unknown>) =>
          selectedCols
            .map((col) => {
              const field = columnFieldMap[col];
              if (!field) return '""';

              if (col === "Status") {
                const d = row["last_order_date"] as string | null;
                if (!d) return '"No Orders"';
                const days =
                  (Date.now() - new Date(d).getTime()) /
                  (1000 * 60 * 60 * 24);
                if (days <= 180) return '"Active"';
                if (days <= 365) return '"At Risk"';
                return '"Churned"';
              }

              return JSON.stringify(row[field] ?? "");
            })
            .join(",")
        ),
      ];

      const blob = new Blob([csvRows.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;

      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `customers_${date}.csv`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">

      {/* Header */}
      <CustomersHeader
        stats={stats}
        onDownload={handleDownload}
        downloading={downloading}
        exportColumns={exportColumns}
        setExportColumns={setExportColumns}
      />

      {/* Filters */}
      <CustomersFilters
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        statusOptions={[
          { label: "Active", value: "active" },
          { label: "At Risk", value: "at_risk" },
          { label: "Churned", value: "churned" },
        ]}
        channel={channel}
        setChannel={setChannel}
        channelOptions={channelOptions}
      />

      {/* View toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setViewMode("table")}
          className={clsx(
            "p-2 rounded-lg border transition",
            viewMode === "table"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
          )}
          title="Table view"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => setViewMode("cards")}
          className={clsx(
            "p-2 rounded-lg border transition",
            viewMode === "cards"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
          )}
          title="Card view"
        >
          <LayoutGrid size={16} />
        </button>
      </div>

      {/* Table / Card Grid */}
      {viewMode === "table" ? (
        <CustomersTable
          customers={customers}
          loading={loading}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ) : (
        <CustomersCardGrid
          customers={customers}
          loading={loading}
        />
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs pt-2">
        <span className="text-gray-400 tabular-nums">
          Page {page + 1} of {totalPages}
        </span>

        <div className="flex gap-1.5">
          <button
            disabled={!canGoPrev}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-default"
          >
            Previous
          </button>
          <button
            disabled={!canGoNext}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-default"
          >
            Next
          </button>
        </div>
      </div>

    </div>
  );
}