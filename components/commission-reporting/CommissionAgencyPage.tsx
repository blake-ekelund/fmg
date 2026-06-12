"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Package,
  Clock,
  AlertCircle,
  Check,
  Download,
  Search,
  X,
  Calendar,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

/* ════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════ */

type Status = "withheld" | "ar_received" | "approved" | "paid";

type CommissionOrderRow = {
  id: number;
  order_num: string;
  ship_date: string;
  customerid: string | null;
  customerpo: string | null;
  customer_name: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  document_amount: number;
  net_sales: number;
  order_agency: string | null;
  order_agency_code: string | null;
  // Legacy derived flag (commission_paid = status === 'paid')
  commission_paid: boolean;
  commission_paid_date: string | null;
  // New lifecycle fields from withheld_commissions
  status: Status;
  commission_rate: number;
  commission_amount: number;
  commission_period: string | null;
  ar_received_date: string | null;
  approved_date: string | null;
};

type RepGroup = {
  id: string;
  name: string;
  agency_code: string | null;
  commission_pct: number;
};

type MonthSummary = {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  label: string;
  orderCount: number;
  netSales: number;
  paidCommissions: number;
  withheldCommissions: number;
  totalCommissions: number;
};

const PAGE_SIZE = 1000;

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

// Code aliases: merge alternate codes into one bucket (e.g. NI House 172 → 100)
const CODE_ALIASES: Record<string, string> = {
  "172": "100",
};

function normalizeCode(code: string | null | undefined) {
  const c = (code ?? "").trim().toUpperCase();
  return CODE_ALIASES[c] ?? c;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number) {
  return n.toLocaleString("en-US");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function stateAbbr(state: string | null): string {
  if (!state) return "";
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  const map: Record<string, string> = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
    california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
    florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
    illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV",
    wisconsin: "WI", wyoming: "WY",
  };
  return map[s.toLowerCase()] || s;
}

function csvEsc(v: unknown) {
  const s = String(v ?? "").replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function downloadCsv(filename: string, rows: string[]) {
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildOrderRows(
  orders: CommissionOrderRow[],
  rate: number,
  headerPrefix?: string[]
): string[] {
  const rows: string[] = [];
  const header = [
    ...(headerPrefix ?? []),
    "Customer Name",
    "Address",
    "City",
    "State",
    "Zip",
    "PO",
    "Ship Date",
    "Invoice #",
    "Net Sales",
    "Commission Rate",
    "Commissions Paid",
    "Commissions Unpaid",
    "Total Commissions",
  ];
  rows.push(header.map(csvEsc).join(","));
  const sorted = [...orders].sort((a, b) =>
    (a.ship_date || "").localeCompare(b.ship_date || "")
  );
  for (const o of sorted) {
    const commission = o.net_sales * (rate / 100);
    const paid = o.commission_paid ? commission : 0;
    const unpaid = o.commission_paid ? 0 : commission;
    rows.push(
      [
        csvEsc(o.customer_name),
        csvEsc((o.ship_address || "").split("\n")[0]),
        csvEsc(o.ship_city),
        csvEsc(o.ship_state),
        csvEsc(o.ship_zip),
        csvEsc(o.customerpo),
        csvEsc(o.ship_date),
        csvEsc(o.order_num),
        csvEsc(o.net_sales.toFixed(2)),
        csvEsc(`${rate}%`),
        csvEsc(paid.toFixed(2)),
        csvEsc(unpaid.toFixed(2)),
        csvEsc(commission.toFixed(2)),
      ].join(",")
    );
  }
  return rows;
}

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */

export default function CommissionAgencyPage({
  agencyCode,
  initialYear,
  initialMonth,
}: {
  agencyCode: string;
  initialYear?: number;
  initialMonth?: number;
}) {
  const now = new Date();
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1);

  const [orders, setOrders] = useState<CommissionOrderRow[]>([]);
  const [repGroup, setRepGroup] = useState<RepGroup | null>(null);
  const [defaultRate, setDefaultRate] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [savingPaid, setSavingPaid] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const normalizedCode = normalizeCode(agencyCode);

  /* ---------- load data ---------- */

  const load = useCallback(async () => {
    setLoading(true);

    // Window: 12 months ending this month
    const twelveMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1
    );
    const twelveIso = iso(twelveMonthsAgo);

    async function fetchPage(
      build: (qb: any) => any
    ): Promise<any[]> {
      const rows: any[] = [];
      let page = 0;
      while (true) {
        const q = build(supabase.from("withheld_commissions"))
          .order("ship_date", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        const { data, error } = await q;
        if (error) {
          console.error("agency load error:", error);
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        page += 1;
      }
      return rows;
    }

    // 1) Last 12 months of orders (any status)
    // 2) Older orders that are still withheld/ar_received/approved (carry-over)
    const [lastYearRaw, olderUnpaidRaw, rgRes, settingRes] = await Promise.all([
      fetchPage((qb) => qb.select("*").gte("ship_date", twelveIso)),
      fetchPage((qb) =>
        qb
          .select("*")
          .lt("ship_date", twelveIso)
          .in("status", ["withheld", "ar_received", "approved"])
      ),
      supabase
        .from("rep_groups")
        .select("id, name, agency_code, commission_pct"),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "default_commission_rate")
        .maybeSingle(),
    ]);

    const allRepGroups = (rgRes.data as RepGroup[]) || [];
    const matchedRg = allRepGroups.find(
      (rg) => normalizeCode(rg.agency_code) === normalizedCode
    );
    setRepGroup(matchedRg ?? null);

    if (settingRes.data?.value) {
      const n = parseFloat(settingRes.data.value);
      if (!Number.isNaN(n)) setDefaultRate(n);
    }

    // Translate withheld_commissions rows → the legacy CommissionOrderRow
    // shape this page was written against.
    let synthId = 0;
    const seen = new Set<string>();
    const filterToAgency = (rows: any[]): CommissionOrderRow[] =>
      rows
        .filter((r) => normalizeCode(r.agency_code) === normalizedCode)
        .filter((r) => {
          if (seen.has(r.order_num)) return false;
          seen.add(r.order_num);
          return true;
        })
        .map((r) => ({
          id: ++synthId,
          order_num: r.order_num,
          ship_date: r.ship_date,
          customerid: null,
          customerpo: r.customerpo,
          customer_name: r.customer_name,
          ship_address: r.ship_address,
          ship_city: r.ship_city,
          ship_state: r.ship_state,
          ship_zip: r.ship_zip,
          document_amount: Number(r.net_sales) || 0,
          net_sales: Number(r.net_sales) || 0,
          order_agency: r.agency_name,
          order_agency_code: r.agency_code,
          commission_paid: r.status === "paid",
          commission_paid_date: r.paid_date,
          status: r.status as Status,
          commission_rate: Number(r.commission_rate) || 0,
          commission_amount: Number(r.commission_amount) || 0,
          commission_period: r.commission_period,
          ar_received_date: r.ar_received_date,
          approved_date: r.approved_date,
        }));

    const merged = [
      ...filterToAgency(lastYearRaw),
      ...filterToAgency(olderUnpaidRaw),
    ];
    setOrders(merged);
    setLoading(false);
  }, [normalizedCode, now]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCode]);

  /* ---------- derived ---------- */

  const rate = repGroup?.commission_pct ?? defaultRate;

  const displayName =
    repGroup?.name ||
    orders.find((o) => o.order_agency)?.order_agency?.trim() ||
    `Agency ${normalizedCode}`;

  /* ---------- search filter ---------- */

  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return orders
      .filter((o) => {
        const name = (o.customer_name || "").toLowerCase();
        const po = (o.customerpo || "").toLowerCase();
        const num = (o.order_num || "").toLowerCase();
        return (
          name.includes(trimmedSearch) ||
          po.includes(trimmedSearch) ||
          num.includes(trimmedSearch)
        );
      })
      .sort((a, b) =>
        (b.ship_date || "").localeCompare(a.ship_date || "")
      );
  }, [orders, trimmedSearch, isSearching]);

  /* ---------- 12-month roll-up ----------
     Rows cover the last 12 complete months ending at "now".
     Only orders whose ship_date is in the 12-month window count.
     Orders older than 12 months (but still unpaid) only contribute to carry-over math,
     not to the monthly roll-up. */

  const monthlySummaries = useMemo(() => {
    const months: MonthSummary[] = [];
    const base = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      months.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        year: y,
        month: m,
        label: d.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        }),
        orderCount: 0,
        netSales: 0,
        paidCommissions: 0,
        withheldCommissions: 0,
        totalCommissions: 0,
      });
    }

    const byKey = new Map<string, MonthSummary>();
    months.forEach((m) => byKey.set(m.key, m));

    for (const o of orders) {
      if (!o.ship_date) continue;
      const key = o.ship_date.slice(0, 7);
      const row = byKey.get(key);
      if (!row) continue; // older than 12 months
      const commission = o.net_sales * (rate / 100);
      row.orderCount += 1;
      row.netSales += o.net_sales;
      row.totalCommissions += commission;
      if (o.commission_paid) row.paidCommissions += commission;
      else row.withheldCommissions += commission;
    }
    return months;
  }, [orders, rate, now]);

  const twelveMonthTotals = useMemo(() => {
    return monthlySummaries.reduce(
      (acc, m) => {
        acc.orders += m.orderCount;
        acc.netSales += m.netSales;
        acc.paid += m.paidCommissions;
        acc.withheld += m.withheldCommissions;
        acc.total += m.totalCommissions;
        return acc;
      },
      { orders: 0, netSales: 0, paid: 0, withheld: 0, total: 0 }
    );
  }, [monthlySummaries]);

  /* ---------- orders for the open-month expand ---------- */

  const ordersForOpenMonth = useMemo(() => {
    if (!openMonth) return [];
    return orders
      .filter((o) => (o.ship_date || "").slice(0, 7) === openMonth)
      .sort((a, b) => (a.ship_date || "").localeCompare(b.ship_date || ""));
  }, [orders, openMonth]);

  /* ---------- AR toggle ----------
     Quick-fix toggle for individual invoices:
       paid      → withheld (reopen)
       anything  → paid     (skip the full approval flow — used for
                              one-off corrections only)
     The normal flow runs through Commission Reporting → Upload A/R →
     Approve All → Mark Run Paid. */

  async function togglePaid(order: CommissionOrderRow) {
    const orderNum = order.order_num;
    if (!orderNum) return;
    setSavingPaid((s) => new Set(s).add(orderNum));

    const nextPaid = !order.commission_paid;
    const todayIso = new Date().toISOString().slice(0, 10);

    const patch = nextPaid
      ? { status: "paid" as const, paid_date: todayIso }
      : {
          status: "withheld" as const,
          paid_date: null,
          approved_date: null,
          approved_by: null,
          commission_period: null,
          ar_received_date: null,
        };

    const { error } = await supabase
      .from("withheld_commissions")
      .update(patch)
      .eq("order_num", orderNum);

    if (error) {
      console.error("toggle paid error:", error);
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.order_num === orderNum
            ? {
                ...o,
                commission_paid: nextPaid,
                commission_paid_date: nextPaid ? todayIso : null,
                status: nextPaid ? "paid" : "withheld",
              }
            : o
        )
      );
    }

    setSavingPaid((s) => {
      const next = new Set(s);
      next.delete(orderNum);
      return next;
    });
  }

  /* ---------- Unapprove single invoice ----------
     Flips an 'approved' row back to 'ar_received' and clears the
     commission_period so it can be re-handled on a later run. */

  async function unapproveOne(order: CommissionOrderRow) {
    const orderNum = order.order_num;
    if (!orderNum || order.status !== "approved") return;
    setSavingPaid((s) => new Set(s).add(orderNum));
    const { error } = await supabase.rpc("unapprove_commission", {
      _order_num: orderNum,
    });
    if (error) {
      console.error("unapprove error:", error);
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.order_num === orderNum
            ? {
                ...o,
                status: "ar_received",
                approved_date: null,
                commission_period: null,
              }
            : o
        )
      );
    }
    setSavingPaid((s) => {
      const next = new Set(s);
      next.delete(orderNum);
      return next;
    });
  }

  /* ---------- downloads ---------- */

  function downloadMonthReport(m: MonthSummary) {
    const monthOrders = orders.filter(
      (o) => (o.ship_date || "").slice(0, 7) === m.key
    );
    if (monthOrders.length === 0) return;
    const rows = buildOrderRows(monthOrders, rate);
    downloadCsv(
      `commission-${normalizedCode}-${m.key}.csv`,
      rows
    );
  }

  function downloadFullHistory() {
    const rows = buildOrderRows(orders, rate, ["Period"]);
    // Prepend a "Period" tag (This Month / Older)
    // Rebuild because buildOrderRows doesn't inject Period values; do it manually:
    const header = [
      "Period",
      "Customer Name",
      "Address",
      "City",
      "State",
      "Zip",
      "PO",
      "Ship Date",
      "Invoice #",
      "Net Sales",
      "Commission Rate",
      "Commissions Paid",
      "Commissions Unpaid",
      "Total Commissions",
    ];
    const outRows: string[] = [];
    outRows.push(header.map(csvEsc).join(","));
    const sorted = [...orders].sort((a, b) =>
      (a.ship_date || "").localeCompare(b.ship_date || "")
    );
    for (const o of sorted) {
      const commission = o.net_sales * (rate / 100);
      const paid = o.commission_paid ? commission : 0;
      const unpaid = o.commission_paid ? 0 : commission;
      const periodLabel = o.commission_paid
        ? "Paid"
        : "Unpaid";
      outRows.push(
        [
          csvEsc(periodLabel),
          csvEsc(o.customer_name),
          csvEsc((o.ship_address || "").split("\n")[0]),
          csvEsc(o.ship_city),
          csvEsc(o.ship_state),
          csvEsc(o.ship_zip),
          csvEsc(o.customerpo),
          csvEsc(o.ship_date),
          csvEsc(o.order_num),
          csvEsc(o.net_sales.toFixed(2)),
          csvEsc(`${rate}%`),
          csvEsc(paid.toFixed(2)),
          csvEsc(unpaid.toFixed(2)),
          csvEsc(commission.toFixed(2)),
        ].join(",")
      );
    }
    downloadCsv(
      `commission-${normalizedCode}-full-history.csv`,
      outRows
    );
    void rows; // quiet the unused-var lint if present
  }

  function downloadSearch() {
    if (searchResults.length === 0) return;
    const rows = buildOrderRows(searchResults, rate);
    downloadCsv(
      `commission-${normalizedCode}-search-${trimmedSearch.replace(
        /[^a-z0-9]+/gi,
        "_"
      )}.csv`,
      rows
    );
  }

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto">
      <Link
        href={`/commission-reporting?year=${year}&month=${month}`}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-3"
      >
        <ArrowLeft size={12} />
        Back to Commission Reporting
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-gray-900">
              {displayName}
            </h1>
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-700">
              Code {normalizedCode}
            </span>
            <span className="inline-flex items-center rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">
              {rate}% commission
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Last 12 months · {fmtInt(twelveMonthTotals.orders)} orders · $
            {fmtMoney(twelveMonthTotals.netSales)} net sales
            {!repGroup && (
              <>
                {" · "}
                <span className="text-amber-700">
                  Using default rate — no rep_groups row for code{" "}
                  {normalizedCode}
                </span>
              </>
            )}
          </p>
        </div>

        <button
          onClick={downloadFullHistory}
          disabled={loading || orders.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed self-start"
        >
          <Download size={13} />
          Download Full History
        </button>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xl">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, PO, or invoice #…"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {isSearching && (
            <>
              <div className="text-[11px] text-gray-500">
                {searchResults.length} match
                {searchResults.length === 1 ? "" : "es"}
              </div>
              <button
                onClick={downloadSearch}
                disabled={searchResults.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
              >
                <Download size={12} />
                Download Results
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-xs text-gray-400">
          Loading agency history…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Calendar size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500 mb-1">
            No commission activity
          </p>
          <p className="text-xs text-gray-400">
            {displayName} has no orders in the last 12 months.
          </p>
        </div>
      ) : isSearching ? (
        /* ---------- SEARCH RESULTS ---------- */
        <SearchResultsTable
          results={searchResults}
          rate={rate}
          onTogglePaid={togglePaid}
          onUnapprove={unapproveOne}
          saving={savingPaid}
        />
      ) : (
        /* ---------- 12-MONTH REPORT + DETAIL EXPAND ---------- */
        <>
          <div className="rounded-xl border border-gray-200 bg-white mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Monthly Reports
                </h2>
                <p className="text-[10px] text-gray-400">
                  Click a month to view invoices · download any month's CSV
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <Th className="w-8"></Th>
                    <Th>Month</Th>
                    <Th className="text-right">Orders</Th>
                    <Th className="text-right">Net Sales</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Withheld</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-center">Download</Th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummaries.map((m) => {
                    const open = openMonth === m.key;
                    const hasOrders = m.orderCount > 0;
                    return (
                      <React.Fragment key={m.key}>
                        <tr
                          onClick={() =>
                            hasOrders &&
                            setOpenMonth((k) => (k === m.key ? null : m.key))
                          }
                          className={clsx(
                            "border-t border-gray-100",
                            hasOrders
                              ? "hover:bg-gray-50 cursor-pointer"
                              : "text-gray-400"
                          )}
                        >
                          <Td>
                            {hasOrders ? (
                              open ? (
                                <ChevronDown
                                  size={14}
                                  className="text-gray-500"
                                />
                              ) : (
                                <ChevronRight
                                  size={14}
                                  className="text-gray-300"
                                />
                              )
                            ) : null}
                          </Td>
                          <Td className="font-medium text-gray-900">
                            {m.label}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {fmtInt(m.orderCount)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {hasOrders ? `$${fmtMoney(m.netSales)}` : "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-emerald-700">
                            {hasOrders
                              ? `$${fmtMoney(m.paidCommissions)}`
                              : "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-amber-700">
                            {hasOrders
                              ? `$${fmtMoney(m.withheldCommissions)}`
                              : "—"}
                          </Td>
                          <Td className="text-right tabular-nums font-semibold">
                            {hasOrders ? `$${fmtMoney(m.totalCommissions)}` : "—"}
                          </Td>
                          <Td className="text-center">
                            {hasOrders && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadMonthReport(m);
                                }}
                                title="Download this month as CSV"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
                              >
                                <Download size={13} />
                              </button>
                            )}
                          </Td>
                        </tr>

                        {open && hasOrders && (
                          <tr>
                            <td colSpan={8} className="bg-gray-50 p-4">
                              <MonthDetailTable
                                orders={ordersForOpenMonth}
                                rate={rate}
                                onTogglePaid={togglePaid}
                                onUnapprove={unapproveOne}
                                saving={savingPaid}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <Td></Td>
                    <Td className="font-semibold">12-Month Total</Td>
                    <Td className="text-right tabular-nums font-semibold">
                      {fmtInt(twelveMonthTotals.orders)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">
                      ${fmtMoney(twelveMonthTotals.netSales)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-emerald-700">
                      ${fmtMoney(twelveMonthTotals.paid)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-amber-700">
                      ${fmtMoney(twelveMonthTotals.withheld)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">
                      ${fmtMoney(twelveMonthTotals.total)}
                    </Td>
                    <Td></Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Hidden vars to quiet ESLint about unused year/month setters */}
          <span className="sr-only">
            {year}-{month}
          </span>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SEARCH RESULTS TABLE
   ════════════════════════════════════════════════════════════ */

function SearchResultsTable({
  results,
  rate,
  onTogglePaid,
  onUnapprove,
  saving,
}: {
  results: CommissionOrderRow[];
  rate: number;
  onTogglePaid: (o: CommissionOrderRow) => void;
  onUnapprove?: (o: CommissionOrderRow) => void;
  saving: Set<string>;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
        <Search size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500 mb-1">
          No matching invoices
        </p>
        <p className="text-xs text-gray-400">
          Try a different customer name, PO, or invoice number.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Search Results</h2>
        <p className="text-[10px] text-gray-400">
          Showing {results.length} invoice{results.length === 1 ? "" : "s"} ·
          sorted by ship date (newest first)
        </p>
      </div>
      <div className="overflow-x-auto">
        <InvoiceTable
          orders={results}
          rate={rate}
          onTogglePaid={onTogglePaid}
          onUnapprove={onUnapprove}
          saving={saving}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MONTH DETAIL TABLE (rendered when a month row is expanded)
   ════════════════════════════════════════════════════════════ */

function MonthDetailTable({
  orders,
  rate,
  onTogglePaid,
  onUnapprove,
  saving,
}: {
  orders: CommissionOrderRow[];
  rate: number;
  onTogglePaid: (o: CommissionOrderRow) => void;
  onUnapprove?: (o: CommissionOrderRow) => void;
  saving: Set<string>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <InvoiceTable
        orders={orders}
        rate={rate}
        onTogglePaid={onTogglePaid}
        onUnapprove={onUnapprove}
        saving={saving}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   INVOICE TABLE (shared between month detail + search results)
   ════════════════════════════════════════════════════════════ */

function InvoiceTable({
  orders,
  rate,
  onTogglePaid,
  onUnapprove,
  saving,
}: {
  orders: CommissionOrderRow[];
  rate: number;
  onTogglePaid: (o: CommissionOrderRow) => void;
  onUnapprove?: (o: CommissionOrderRow) => void;
  saving: Set<string>;
}) {
  const subtotalNet = orders.reduce((s, o) => s + o.net_sales, 0);
  const subtotalPaid = orders
    .filter((o) => o.commission_paid)
    .reduce((s, o) => s + o.net_sales * (rate / 100), 0);
  const subtotalWithheld = orders
    .filter((o) => !o.commission_paid)
    .reduce((s, o) => s + o.net_sales * (rate / 100), 0);
  const subtotalTotal = subtotalPaid + subtotalWithheld;

  return (
    <table className="w-full text-[11px]">
      <thead className="bg-gray-50 text-gray-500">
        <tr>
          <Th>Customer</Th>
          <Th>Address</Th>
          <Th>City</Th>
          <Th>ST</Th>
          <Th>Zip</Th>
          <Th>PO</Th>
          <Th>Ship Date</Th>
          <Th>Invoice #</Th>
          <Th>Status</Th>
          <Th className="text-right">Net Sales</Th>
          <Th className="text-right">Rate</Th>
          <Th className="text-right">Paid</Th>
          <Th className="text-right">Unpaid</Th>
          <Th className="text-right">Total</Th>
          <Th className="text-center">AR</Th>
          <Th className="text-center"></Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const commission = o.net_sales * (rate / 100);
          const paid = o.commission_paid ? commission : 0;
          const unpaid = o.commission_paid ? 0 : commission;
          const isSaving = saving.has(o.order_num);
          return (
            <tr
              key={o.id}
              className="border-t border-gray-100 hover:bg-gray-50"
            >
              <Td className="whitespace-nowrap max-w-[180px] truncate">
                {o.customer_name}
              </Td>
              <Td className="max-w-[180px] truncate">
                {(o.ship_address || "").split("\n")[0]}
              </Td>
              <Td>{o.ship_city}</Td>
              <Td>{stateAbbr(o.ship_state)}</Td>
              <Td>{(o.ship_zip || "").slice(0, 5)}</Td>
              <Td>{o.customerpo || "—"}</Td>
              <Td>{o.ship_date}</Td>
              <Td className="font-mono">
                <Link
                  href={`/commission-reporting/invoice/${encodeURIComponent(
                    o.order_num
                  )}`}
                  className="text-gray-900 hover:text-blue-600 hover:underline"
                >
                  {o.order_num}
                </Link>
              </Td>
              <Td>
                <StatusBadge status={o.status} />
              </Td>
              <Td className="text-right tabular-nums">
                ${fmtMoney(o.net_sales)}
              </Td>
              <Td className="text-right tabular-nums">{rate}%</Td>
              <Td className="text-right tabular-nums text-emerald-700">
                ${fmtMoney(paid)}
              </Td>
              <Td className="text-right tabular-nums text-amber-700">
                ${fmtMoney(unpaid)}
              </Td>
              <Td className="text-right tabular-nums font-semibold">
                ${fmtMoney(commission)}
              </Td>
              <Td className="text-center">
                <button
                  disabled={isSaving}
                  onClick={() => onTogglePaid(o)}
                  title={
                    o.commission_paid
                      ? "Paid — click to mark unpaid"
                      : "Unpaid — click to mark paid"
                  }
                  className={clsx(
                    "inline-flex items-center justify-center w-5 h-5 rounded border transition",
                    o.commission_paid
                      ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-white border-gray-300 text-transparent hover:border-gray-400",
                    isSaving && "opacity-50 cursor-wait"
                  )}
                >
                  <Check size={12} />
                </button>
              </Td>
              <Td className="text-center">
                {onUnapprove && o.status === "approved" && (
                  <button
                    disabled={isSaving}
                    onClick={() => onUnapprove(o)}
                    title="Unapprove — move back to A/R received"
                    className={clsx(
                      "inline-flex items-center justify-center w-5 h-5 rounded border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition",
                      isSaving && "opacity-50 cursor-wait"
                    )}
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
      <tfoot className="bg-gray-50 border-t border-gray-200">
        <tr>
          <Td colSpan={9} className="font-semibold">
            Subtotal
          </Td>
          <Td className="text-right tabular-nums font-semibold">
            ${fmtMoney(subtotalNet)}
          </Td>
          <Td></Td>
          <Td className="text-right tabular-nums font-semibold text-emerald-700">
            ${fmtMoney(subtotalPaid)}
          </Td>
          <Td className="text-right tabular-nums font-semibold text-amber-700">
            ${fmtMoney(subtotalWithheld)}
          </Td>
          <Td className="text-right tabular-nums font-semibold">
            ${fmtMoney(subtotalTotal)}
          </Td>
          <Td></Td>
          <Td></Td>
        </tr>
      </tfoot>
    </table>
  );
}

/* ════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ════════════════════════════════════════════════════════════ */

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={clsx(
        "text-left font-medium uppercase tracking-wider text-[10px] px-2 py-2",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={clsx("px-2 py-2", className)}>
      {children}
    </td>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<
    Status,
    { label: string; className: string }
  > = {
    withheld: {
      label: "Withheld",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    ar_received: {
      label: "A/R Received",
      className: "bg-sky-50 text-sky-700 border-sky-200",
    },
    approved: {
      label: "Approved",
      className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    paid: {
      label: "Paid",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  };
  const c = cfg[status] ?? cfg.withheld;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap",
        c.className
      )}
    >
      {c.label}
    </span>
  );
}
