"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCustomers } from "./hooks/useCustomers";
import { applyFilters } from "./hooks/useCustomers";
import CustomersHeader from "./CustomersHeader";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomerOrdersModal from "./CustomerOrdersModal";

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

  const [activeCustomerId, setActiveCustomerId] =
    useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);

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

      const headers = Object.keys(data[0]);

      const csvRows = [
        headers.join(","),
        ...data.map(row =>
          headers.map(h =>
            JSON.stringify(row[h] ?? "")
          ).join(",")
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
    <div className="px-4 py-4 md:px-8 md:py-5 space-y-6">

      {/* Header */}
      <CustomersHeader
        stats={stats}
        onDownload={handleDownload}
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

      {/* Table */}
      <CustomersTable
        customers={customers}
        loading={loading}
        onViewLastOrder={(id) =>
          setActiveCustomerId(id)
        }
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm pt-2">
        <div className="text-slate-500">
          Page {page + 1} of {totalPages}
        </div>

        <div className="flex gap-2">
          <button
            disabled={!canGoPrev}
            onClick={() =>
              setPage((p) => Math.max(0, p - 1))
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>

          <button
            disabled={!canGoNext}
            onClick={() =>
              setPage((p) => p + 1)
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <CustomerOrdersModal
        customerId={activeCustomerId}
        onClose={() => setActiveCustomerId(null)}
      />
    </div>
  );
}