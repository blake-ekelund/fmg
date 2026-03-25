"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCustomers, applyFilters } from "./hooks/useCustomers";
import { useD2CCustomers } from "./hooks/useD2CCustomers";
import CustomersHeader from "./CustomersHeader";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomersCardGrid from "./CustomersCardGrid";
import type { CustomerViewMode } from "./constants";

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

export default function CustomersPage({
  viewMode = "wholesale",
}: {
  viewMode?: CustomerViewMode;
}) {
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");

  const [sortColumn, setSortColumn] =
    useState<SortColumn>("last_order_date");
  const [sortDir, setSortDir] =
    useState<SortDir>("desc");

  const [downloading, setDownloading] = useState(false);

  /* Export column picker state */
  const [exportColumns, setExportColumns] = useState<Record<string, boolean>>({
    Name: true,
    ID: true,
    "Bill To Address": true,
    "Bill To City": true,
    "Bill To State": true,
    "Bill To Zip": true,
    "Ship To Address": true,
    "Ship To City": true,
    "Ship To State": true,
    "Ship To Zip": true,
    Channel: true,
    Status: true,
    "Sales 2024": true,
    "Sales 2025": true,
    "Sales 2026": true,
    "Last Order Date": true,
    Email: true,
    Phone: true,
  });

  const [d2cExportColumns, setD2cExportColumns] = useState<Record<string, boolean>>({
    Name: true,
    Email: true,
    State: true,
    Status: true,
    Orders: true,
    Revenue: true,
    "Sales 2024": true,
    "Sales 2025": true,
    "Sales 2026": true,
    "Last Order Date": true,
  });

  /* ─── Wholesale hook ─── */
  const {
    customers: wholesaleCustomers = [],
    loading: wholesaleLoading = false,
    totalCount: wholesaleTotalCount = 0,
    channelOptions = [],
    stats: wholesaleStats = { active: 0, atRisk: 0, churned: 0 },
  } = useCustomers({
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
    channel,
    sortColumn,
    sortDir,
    enabled: viewMode === "wholesale",
  });

  /* ─── D2C hook ─── */
  const {
    customers: d2cCustomers = [],
    loading: d2cLoading = false,
    totalCount: d2cTotalCount = 0,
    stats: d2cStats = { active: 0, atRisk: 0, churned: 0 },
  } = useD2CCustomers({
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
    sortColumn,
    sortDir,
    enabled: viewMode === "d2c",
  });

  /* ─── Active data based on view mode ─── */
  const isD2C = viewMode === "d2c";
  const loading = isD2C ? d2cLoading : wholesaleLoading;
  const totalCount = isD2C ? d2cTotalCount : wholesaleTotalCount;
  const stats = isD2C ? d2cStats : wholesaleStats;

  /* Reset page when filters/sort/view change */
  useEffect(() => {
    setPage(0);
  }, [search, status, channel, sortColumn, sortDir]);

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1;
  const canGoNext = page + 1 < totalPages;
  const canGoPrev = page > 0;

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  /* -------------------------------------------
     DOWNLOAD (Full Filtered Dataset)
  -------------------------------------------- */

  /* Wholesale column mapping */
  const columnFieldMap: Record<string, { source: "summary" | "contact"; field: string }> = {
    Name: { source: "summary", field: "name" },
    ID: { source: "summary", field: "customerid" },
    "Bill To Address": { source: "contact", field: "billto_address" },
    "Bill To City": { source: "contact", field: "billto_city" },
    "Bill To State": { source: "contact", field: "billto_state" },
    "Bill To Zip": { source: "contact", field: "billto_zip" },
    "Ship To Address": { source: "contact", field: "shipto_address" },
    "Ship To City": { source: "contact", field: "shipto_city" },
    "Ship To State": { source: "contact", field: "shipto_state" },
    "Ship To Zip": { source: "contact", field: "shipto_zip" },
    Channel: { source: "summary", field: "channel" },
    Status: { source: "summary", field: "last_order_date" },
    "Sales 2024": { source: "summary", field: "sales_2024" },
    "Sales 2025": { source: "summary", field: "sales_2025" },
    "Sales 2026": { source: "summary", field: "sales_2026" },
    "Last Order Date": { source: "summary", field: "last_order_date" },
    Email: { source: "contact", field: "email" },
    Phone: { source: "contact", field: "phone" },
  };

  /* D2C column mapping */
  const d2cFieldMap: Record<string, string> = {
    Name: "name",
    Email: "email",
    State: "bill_to_state",
    Status: "last_order_date",
    Orders: "lifetime_orders",
    Revenue: "lifetime_revenue",
    "Sales 2024": "sales_2024",
    "Sales 2025": "sales_2025",
    "Sales 2026": "sales_2026",
    "Last Order Date": "last_order_date",
  };

  async function handleDownload() {
    try {
      setDownloading(true);

      if (isD2C) {
        await handleD2CDownload();
      } else {
        await handleWholesaleDownload();
      }
    } finally {
      setDownloading(false);
    }
  }

  async function handleD2CDownload() {
    let query = supabase
      .from("d2c_customer_summary")
      .select("*")
      .range(0, 9999);

    if (search) {
      const q = search.trim();
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,bill_to_state.ilike.%${q}%`);
    }

    if (status) {
      const { active, risk } = getDateCutoffs();
      if (status === "active") query = query.gte("last_order_date", active.toISOString());
      if (status === "at_risk") query = query.lt("last_order_date", active.toISOString()).gte("last_order_date", risk.toISOString());
      if (status === "churned") query = query.lt("last_order_date", risk.toISOString());
    }

    const { data, error } = await query;
    if (error || !data?.length) return;

    const selectedCols = Object.entries(d2cExportColumns)
      .filter(([, checked]) => checked)
      .map(([key]) => key);
    if (selectedCols.length === 0) return;

    const csvRows = [
      selectedCols.join(","),
      ...data.map((row: Record<string, unknown>) =>
        selectedCols.map((col) => {
          if (col === "Status") {
            const d = row["last_order_date"] as string | null;
            if (!d) return '"No Orders"';
            const days = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
            if (days <= 180) return '"Active"';
            if (days <= 365) return '"At Risk"';
            return '"Churned"';
          }
          const field = d2cFieldMap[col];
          return JSON.stringify((row[field] as string) ?? "");
        }).join(",")
      ),
    ];

    downloadCsv(csvRows, "d2c_customers");
  }

  async function handleWholesaleDownload() {
    let query = supabase
      .from("customer_summary")
      .select("*")
      .range(0, 4999);

    query = applyFilters(query, search, status, channel);

    const { data, error } = await query;
    if (error || !data?.length) return;

    const customerIds = data.map((r: Record<string, unknown>) => r.customerid as string);
    const { data: contactData } = await supabase
      .from("customer_contact_summary")
      .select("customerid, email, phone, billto_address, billto_city, billto_state, billto_zip, shipto_address, shipto_city, shipto_state, shipto_zip")
      .in("customerid", customerIds);

    const contactMap = new Map(
      (contactData ?? []).map((c: Record<string, unknown>) => [c.customerid as string, c])
    );

    const selectedCols = Object.entries(exportColumns)
      .filter(([, checked]) => checked)
      .map(([key]) => key);
    if (selectedCols.length === 0) return;

    const csvRows = [
      selectedCols.join(","),
      ...data.map((row: Record<string, unknown>) => {
        const contact = contactMap.get(row.customerid as string) as Record<string, unknown> | undefined;
        return selectedCols.map((col) => {
          const mapping = columnFieldMap[col];
          if (!mapping) return '""';
          if (col === "Status") {
            const d = row["last_order_date"] as string | null;
            if (!d) return '"No Orders"';
            const days = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
            if (days <= 180) return '"Active"';
            if (days <= 365) return '"At Risk"';
            return '"Churned"';
          }
          const source = mapping.source === "contact" ? contact : row;
          return JSON.stringify((source?.[mapping.field] as string) ?? "");
        }).join(",");
      }),
    ];

    downloadCsv(csvRows, "customers");
  }

  function downloadCsv(rows: string[], prefix: string) {
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const date = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `${prefix}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const activeExportColumns = isD2C ? d2cExportColumns : exportColumns;
  const activeSetExportColumns = isD2C ? setD2cExportColumns : setExportColumns;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">

      {/* Header */}
      <CustomersHeader
        stats={stats}
        onDownload={handleDownload}
        downloading={downloading}
        exportColumns={activeExportColumns}
        setExportColumns={activeSetExportColumns}
      />

      {/* Filters */}
      <CustomersFilters
        viewMode={viewMode}
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
        customers={isD2C ? d2cCustomers : wholesaleCustomers}
        loading={loading}
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={handleSort}
        viewMode={viewMode}
      />

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

function getDateCutoffs() {
  const now = new Date();
  const active = new Date(now);
  active.setDate(now.getDate() - 180);
  const risk = new Date(now);
  risk.setDate(now.getDate() - 365);
  return { active, risk };
}
