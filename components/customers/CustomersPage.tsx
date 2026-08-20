"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Mail, Workflow, X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import {
  useCustomers,
  applyFilters,
  type WholesaleSpendBucket,
} from "./hooks/useCustomers";
import {
  useD2CCustomers,
  applyD2CFilters,
  type D2CSpendBucket,
} from "./hooks/useD2CCustomers";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomerListCards from "./CustomerListCards";
import type { CustomerViewMode } from "./constants";
import type { Customer, D2CCustomer } from "./types";
import AssignWorkflowModal from "./AssignWorkflowModal";
import ComposeEmailModal from "./ComposeEmailModal";
import { useSuppressionFlags } from "./hooks/useSuppressionFlags";
import { useEmailQuality, QUALITY_FILTERS } from "./hooks/useEmailQuality";
import { useCampaignSkips } from "./hooks/useCampaignSkips";
import { LAST_ORDER_OPTIONS, type LastOrderWindow } from "./hooks/queryHelpers";
import { fetchOpenOrderCustomerIds } from "@/lib/orderStage";

/** Email-status filter values. The first three come from the suppression list
 *  (addresses that went bad after we mailed them); the rest from the address
 *  itself (nothing to mail, or nothing worth mailing). */
const EMAIL_FLAG_OPTIONS = [
  { label: "Email bounced", value: "bounced" },
  { label: "Unsubscribed / complained", value: "unsubscribed" },
  { label: "New email on file", value: "changed" },
  { label: "No email on file", value: "no_email" },
  { label: "Invalid / likely typo", value: "bad_address" },
  { label: "Role address (info@, sales@…)", value: "role_address" },
  { label: "Last campaign didn't send", value: "campaign_blocked" },
];

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

const D2C_SPEND_OPTIONS = [
  { label: "Any spend", value: "" },
  { label: "Less than $50", value: "lt50" },
  { label: "$50 – $100", value: "50to100" },
  { label: "$100 – $250", value: "100to250" },
  { label: "$250 – $1,000", value: "250to1000" },
  { label: "$1,000+", value: "1000plus" },
];

const WHOLESALE_SPEND_OPTIONS = [
  { label: "Any spend", value: "" },
  { label: "Less than $1k", value: "lt1k" },
  { label: "$1k – $5k", value: "1kto5k" },
  { label: "$5k – $25k", value: "5kto25k" },
  { label: "$25k – $100k", value: "25kto100k" },
  { label: "$100k+", value: "100kplus" },
];

export default function CustomersPage({
  viewMode = "wholesale",
}: {
  viewMode?: CustomerViewMode;
}) {
  // The wholesale list is brand-scoped (see useCustomers). Export and
  // select-all-matching have to honour the same scope or they reach outside
  // the rows the user can actually see.
  const { brand } = useBrand();

  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  /* Status is a multi-select: empty array = "All". The buckets are date
     ranges over last_order_date, so selecting several is a plain union. */
  const [statuses, setStatuses] = useState<string[]>([]);
  const [channel, setChannel] = useState("");
  const [agency, setAgency] = useState("");
  const [states, setStates] = useState<string[]>([]);

  /* Repeat-customer + lifetime-spend filters. The spend bucket string values
     differ between D2C (lt50, 50to100, …) and wholesale (lt1k, 1kto5k, …);
     each route mounts its own CustomersPage so the values don't leak across. */
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [spendBucket, setSpendBucket] = useState<string>("");

  /* Email-status filter: bounced / unsubscribed / address-changed. The
     matching customer ids come from the suppression list (small), and ride
     into the server query as an .in() restriction so pagination, counts and
     select-all stay exact. */
  const [emailFlag, setEmailFlag] = useState("");
  const suppression = useSuppressionFlags();
  const quality = useEmailQuality(viewMode);
  const skips = useCampaignSkips(viewMode);

  /* Recency + open-order filters. Open orders are a wholesale idea only:
     every D2C shopper shares one storefront account in Fishbowl, so an
     open-order lookup by customerid would flag all of them at once. */
  const [lastOrder, setLastOrder] = useState<LastOrderWindow>("");
  const [openOnly, setOpenOnly] = useState(false);

  const emailFlagIds = useMemo(() => {
    if (!emailFlag) return undefined;

    // Whatever happened on the last send, straight from the recipient rows.
    if (emailFlag === "campaign_blocked") {
      if (!skips.loaded) return undefined;
      const ids = [...skips.byRef.keys()];
      return ids.length > 0 ? ids : ["__none__"];
    }

    // Address-quality filters read the contact view, not the suppression list.
    const issues = QUALITY_FILTERS[emailFlag];
    if (issues) {
      if (!quality.loaded) return undefined;
      const ids: string[] = [];
      for (const [ref, info] of quality.byRef) {
        if (issues.includes(info.issue)) ids.push(ref);
      }
      return ids.length > 0 ? ids : ["__none__"];
    }

    if (!suppression.loaded) return undefined;
    const prefix = `${viewMode === "d2c" ? "d2c" : "wholesale"}:`;
    const ids: string[] = [];
    for (const [key, info] of suppression.byCustomer) {
      if (!key.startsWith(prefix)) continue;
      const matches =
        emailFlag === "changed"
          ? info.addressChanged
          : emailFlag === "bounced"
            ? info.source === "bounce" && !info.addressChanged
            : (info.source === "link" || info.source === "manual" || info.source === "complaint") &&
              !info.addressChanged;
      if (matches) ids.push(key.slice(prefix.length));
    }
    // Filter active but nothing matches → impossible id so the query returns
    // zero rows instead of silently dropping the restriction.
    return ids.length > 0 ? ids : ["__none__"];
  }, [emailFlag, suppression, quality, skips, viewMode]);

  const [sortColumn, setSortColumn] =
    useState<SortColumn>("last_order_date");
  const [sortDir, setSortDir] =
    useState<SortDir>("desc");

  const [downloading, setDownloading] = useState(false);

  /* ─── Multi-select ─── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // handleToggleAll is defined below hooks (needs customer data)

  // Clear selection on page / filter / view change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, statuses, channel, agency, states, repeatOnly, spendBucket, emailFlag, lastOrder, openOnly, viewMode]);

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
    agencyOptions = [],
    stateOptions: wholesaleStateOptions = [],
    stats: wholesaleStats = { all: 0, active: 0, atRisk: 0, churned: 0 },
  } = useCustomers({
    page,
    pageSize: PAGE_SIZE,
    search,
    statuses,
    channel,
    agency,
    states,
    repeatOnly,
    spendBucket: spendBucket as WholesaleSpendBucket,
    lastOrder,
    openOnly,
    sortColumn,
    sortDir,
    enabled: viewMode === "wholesale",
    restrictIds: emailFlagIds,
  });

  /* ─── D2C hook ─── */
  const {
    customers: d2cCustomers = [],
    loading: d2cLoading = false,
    totalCount: d2cTotalCount = 0,
    stateOptions: d2cStateOptions = [],
    stats: d2cStats = { all: 0, active: 0, atRisk: 0, churned: 0 },
  } = useD2CCustomers({
    page,
    pageSize: PAGE_SIZE,
    search,
    statuses,
    states,
    repeatOnly,
    spendBucket: spendBucket as D2CSpendBucket,
    lastOrder,
    sortColumn,
    sortDir,
    enabled: viewMode === "d2c",
    restrictIds: emailFlagIds,
  });

  /* ─── Active data based on view mode ─── */
  const isD2C = viewMode === "d2c";
  const loading = isD2C ? d2cLoading : wholesaleLoading;
  const totalCount = isD2C ? d2cTotalCount : wholesaleTotalCount;
  const stats = isD2C ? d2cStats : wholesaleStats;
  const stateOptions = isD2C ? d2cStateOptions : wholesaleStateOptions;

  const handleToggleAll = useCallback(() => {
    const currentCustomers = isD2C ? d2cCustomers : wholesaleCustomers;
    const allIds = (currentCustomers ?? []).map((c) =>
      isD2C ? (c as D2CCustomer).person_key : (c as Customer).customerid
    );
    setSelectedIds((prev) => {
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [isD2C, d2cCustomers, wholesaleCustomers]);

  /* Select every customer that matches the current filter — not just the
     visible page. Caps at 5,000 so a runaway filter can't lock up the UI. */
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const handleSelectAllMatching = useCallback(async () => {
    setSelectAllLoading(true);
    try {
      if (isD2C) {
        // Pin the builder to its concrete type before passing it through the
        // generic applyD2CFilters, then chain range — chaining on the generic
        // return trips TS2589 ("excessively deep").
        let q = supabase.from("d2c_customer_summary").select("person_key");
        q = applyD2CFilters(q, {
          search,
          statuses,
          repeatOnly,
          spendBucket: spendBucket as D2CSpendBucket,
          states,
          lastOrder,
        });
        const { data } = await q.range(0, 4999);
        let ids = (data ?? []).map((r: { person_key: string }) => r.person_key);
        if (emailFlagIds) {
          const allowed = new Set(emailFlagIds);
          ids = ids.filter((id: string) => allowed.has(id));
        }
        setSelectedIds(new Set(ids));
      } else {
        let q = supabase
          .from("customer_summary")
          .select("customerid")
          .range(0, 4999);
        q = applyFilters(
          q,
          search,
          statuses,
          channel,
          agency,
          repeatOnly,
          spendBucket as WholesaleSpendBucket,
          states,
          // The open-order id list isn't fetched for this query; when the
          // filter is on, the returned ids are intersected with it below.
          undefined,
          lastOrder,
        );
        if (brand !== "all") {
          q = q.ilike("brands_purchased", `%${brand}%`);
        }
        const { data } = await q;
        let ids = (data ?? []).map((r: { customerid: string }) => r.customerid);
        if (openOnly) {
          const open = await fetchOpenOrderCustomerIds(supabase);
          ids = ids.filter((id: string) => open.has(id));
        }
        if (emailFlagIds) {
          const allowed = new Set(emailFlagIds);
          ids = ids.filter((id: string) => allowed.has(id));
        }
        setSelectedIds(new Set(ids));
      }
    } finally {
      setSelectAllLoading(false);
    }
  }, [isD2C, search, statuses, channel, agency, states, repeatOnly, spendBucket, brand, emailFlagIds, lastOrder, openOnly]);

  /* ─── Customer name map for workflow modal ─── */
  const customerNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (isD2C) {
      (d2cCustomers ?? []).forEach((c) => {
        const dc = c as D2CCustomer;
        map[dc.person_key] = dc.name || dc.person_key;
      });
    } else {
      (wholesaleCustomers ?? []).forEach((c) => {
        const wc = c as Customer;
        map[wc.customerid] = wc.name || wc.customerid;
      });
    }
    return map;
  }, [isD2C, d2cCustomers, wholesaleCustomers]);

  /* Reset page when filters/sort/view change */
  useEffect(() => {
    setPage(0);
  }, [search, statuses, channel, agency, states, repeatOnly, spendBucket, emailFlag, lastOrder, openOnly, sortColumn, sortDir]);

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
    // Route through the shared builder rather than re-deriving the filters
    // here: the hand-rolled copy dropped repeatOnly/spendBucket and used an
    // unescaped search term in .or().
    let query = supabase
      .from("d2c_customer_summary")
      .select("*")
      .range(0, 9999);

    query = applyD2CFilters(query, {
      search,
      statuses,
      repeatOnly,
      spendBucket: spendBucket as D2CSpendBucket,
      states,
    });

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

    // Every filter the user set has to reach the export — repeatOnly and
    // spendBucket used to be dropped here, so a filtered view exported a
    // wider set of customers than it displayed.
    query = applyFilters(
      query,
      search,
      statuses,
      channel,
      agency,
      repeatOnly,
      spendBucket as WholesaleSpendBucket,
      states,
    );

    if (brand !== "all") {
      query = query.ilike("brands_purchased", `%${brand}%`);
    }

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
    <div className="px-4 md:px-8 py-4 md:py-5 space-y-3">

      {/* Single-row toolbar: search · status multi-select · more filters · export */}
      <CustomersFilters
        viewMode={viewMode}
        search={search}
        setSearch={setSearch}
        statuses={statuses}
        setStatuses={setStatuses}
        channel={channel}
        setChannel={setChannel}
        channelOptions={channelOptions}
        agency={agency}
        setAgency={setAgency}
        agencyOptions={agencyOptions}
        states={states}
        setStates={setStates}
        stateOptions={stateOptions}
        repeatOnly={repeatOnly}
        setRepeatOnly={setRepeatOnly}
        spendBucket={spendBucket}
        setSpendBucket={setSpendBucket}
        spendBucketOptions={isD2C ? D2C_SPEND_OPTIONS : WHOLESALE_SPEND_OPTIONS}
        emailFlag={emailFlag}
        setEmailFlag={setEmailFlag}
        emailFlagOptions={EMAIL_FLAG_OPTIONS}
        lastOrder={lastOrder}
        setLastOrder={(v) => setLastOrder(v as LastOrderWindow)}
        lastOrderOptions={LAST_ORDER_OPTIONS}
        openOnly={openOnly}
        setOpenOnly={viewMode === "wholesale" ? setOpenOnly : undefined}
        stats={stats}
        onDownload={handleDownload}
        downloading={downloading}
        exportColumns={activeExportColumns}
        setExportColumns={activeSetExportColumns}
      />

      {/* Table (md+) */}
      <CustomersTable
        customers={isD2C ? d2cCustomers : wholesaleCustomers}
        loading={loading}
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={handleSort}
        viewMode={viewMode}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleAll={handleToggleAll}
        suppression={suppression}
        quality={quality}
        skips={skips}
      />

      {/* Cards (phones) */}
      <div className="md:hidden">
        <CustomerListCards
          customers={isD2C ? d2cCustomers : wholesaleCustomers}
          loading={loading}
          viewMode={viewMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />
      </div>

      {/* Pagination. Extra bottom padding on phones keeps the last row clear of
          the floating action bar when a selection is active. */}
      <div
        className={clsx(
          "flex items-center justify-between gap-3 pt-2 text-xs",
          selectedIds.size > 0 && "pb-24 md:pb-0",
        )}
      >
        <span className="shrink-0 text-gray-400 tabular-nums">
          Page {page + 1} of {totalPages}
        </span>

        <div className="flex gap-2">
          <button
            disabled={!canGoPrev}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="min-h-[40px] rounded-lg border border-gray-200 bg-white px-4 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-default disabled:opacity-30 md:min-h-0 md:py-1.5"
          >
            Previous
          </button>
          <button
            disabled={!canGoNext}
            onClick={() => setPage((p) => p + 1)}
            className="min-h-[40px] rounded-lg border border-gray-200 bg-white px-4 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-default disabled:opacity-30 md:min-h-0 md:py-1.5"
          >
            Next
          </button>
        </div>
      </div>

      {/* ─── Floating Action Bar ─── */}
      {/* On phones this is a full-width bar pinned to the bottom edge (five
          controls in a centred row overflowed a 375px screen); from md up it
          returns to the floating centred pill. */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-4 pt-3 shadow-lg backdrop-blur-sm [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:left-1/2 md:w-auto md:-translate-x-1/2 md:rounded-2xl md:border md:px-5 md:py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-700 tabular-nums">
                {selectedIds.size} selected
              </span>

              {selectedIds.size < totalCount && (
                <button
                  onClick={handleSelectAllMatching}
                  disabled={selectAllLoading}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  title={`Replace selection with all ${totalCount.toLocaleString()} customers matching the current filter.`}
                >
                  {selectAllLoading
                    ? "Loading…"
                    : `Select all ${totalCount.toLocaleString()}`}
                </button>
              )}

              <button
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 md:hidden"
                title="Clear selection"
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            </div>

            <div className="hidden h-5 w-px bg-gray-200 md:block" />

            <div className="flex gap-2">
              <button
                onClick={() => setEmailModalOpen(true)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-gray-800 md:min-h-0 md:flex-none md:py-2"
              >
                <Mail size={13} />
                Send Email
              </button>

              <button
                onClick={() => setWorkflowModalOpen(true)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 md:min-h-0 md:flex-none md:py-2"
              >
                <Workflow size={13} />
                Assign Workflow
              </button>
            </div>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="hidden items-center gap-1 rounded-lg px-2 py-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 md:inline-flex"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Assign Workflow Modal ─── */}
      <AssignWorkflowModal
        open={workflowModalOpen}
        onClose={() => setWorkflowModalOpen(false)}
        selectedIds={selectedIds}
        customerType={isD2C ? "d2c" : "wholesale"}
        customerNames={customerNames}
        onComplete={() => setSelectedIds(new Set())}
      />

      {/* ─── Compose Email Modal ─── */}
      <ComposeEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        selectedIds={selectedIds}
        customerType={isD2C ? "d2c" : "wholesale"}
        customerNames={customerNames}
        onComplete={() => setSelectedIds(new Set())}
      />
    </div>
  );
}

