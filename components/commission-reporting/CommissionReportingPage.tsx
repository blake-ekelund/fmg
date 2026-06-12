"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  ChevronRight,
  Download,
  AlertCircle,
  Clock,
  Upload,
  Package,
  Check,
  History,
  CheckCircle2,
  Circle,
  FileCheck,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import {
  generatePayoutPacketZip,
  generateSingleAgencyWorkbook,
  type PayoutAgency,
  type PayoutOrder,
} from "./payoutPacket";

/* ════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════ */

type Status = "withheld" | "ar_received" | "approved" | "paid";

type CommissionRow = {
  order_num: string;
  customer_name: string | null;
  customerpo: string | null;
  ship_date: string;
  ship_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  agency_code: string | null;
  agency_name: string | null;
  order_rep: string | null;
  net_sales: number;
  commission_rate: number;
  commission_amount: number;
  status: Status;
  ar_received_date: string | null;
  approved_date: string | null;
  paid_date: string | null;
  commission_period: string | null;
};

type RepGroup = {
  id: string;
  name: string;
  agency_code: string | null;
  commission_pct: number;
};

type AgencyKey = string;

type AgencyGroup = {
  key: AgencyKey;
  code: string;
  displayName: string;
  rate: number;
  orders: CommissionRow[];

  orderCount: number;
  netSales: number;
  commissionAmount: number;

  // Status split (used in "Current Run" view)
  arReceivedCount: number;
  arReceivedAmount: number;
  approvedCount: number;
  approvedAmount: number;
  paidCount: number;
  paidAmount: number;
};

type ViewMode = "current_run" | "withheld" | "historical";

const PAGE_SIZE = 1000;

// Code aliases: merge certain agency codes into one bucket for reporting.
// NI HOUSE is the in-house catch-all (0% rate) and is represented by
// multiple codes in Spire depending on historical context.
const CODE_ALIASES: Record<string, string> = {
  "172": "100",
};

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

function normalizeCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
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

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return { startIso: iso(start), endIso: iso(end) };
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function daysSince(iso: string | null) {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════ */

export default function CommissionReportingPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [repGroups, setRepGroups] = useState<RepGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("current_run");

  // Mutation state
  const [approving, setApproving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [packetBusy, setPacketBusy] = useState(false);
  const [packetDownloaded, setPacketDownloaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<
    "approve" | "mark_paid" | null
  >(null);

  const router = useRouter();

  /* ---------- load data ---------- */

  const load = useCallback(async () => {
    setLoading(true);
    const { startIso } = monthRange(year, month);

    async function fetchPage(
      build: () => ReturnType<typeof supabase.from>
    ): Promise<any[]> {
      const out: any[] = [];
      let page = 0;
      while (true) {
        const base = build();
        const { data, error } = await (base as any)
          .order("ship_date", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) {
          console.error("withheld_commissions query error:", error);
          break;
        }
        if (!data || data.length === 0) break;
        out.push(...data);
        if (data.length < PAGE_SIZE) break;
        page += 1;
      }
      return out;
    }

    let fetched: any[] = [];

    if (viewMode === "current_run") {
      // Rows relevant to the current run:
      //   (a) status='ar_received' (not yet approved — need owner approval)
      //   (b) status='approved' or 'paid' AND commission_period = selected month
      // Fetch both and merge.
      const [arReceived, approvedPaid] = await Promise.all([
        fetchPage(
          () =>
            supabase
              .from("withheld_commissions")
              .select("*")
              .eq("status", "ar_received") as any
        ),
        fetchPage(
          () =>
            supabase
              .from("withheld_commissions")
              .select("*")
              .in("status", ["approved", "paid"])
              .eq("commission_period", startIso) as any
        ),
      ]);
      fetched = [...arReceived, ...approvedPaid];
    } else if (viewMode === "withheld") {
      fetched = await fetchPage(
        () =>
          supabase
            .from("withheld_commissions")
            .select("*")
            .eq("status", "withheld") as any
      );
    } else {
      // historical — approved + paid rows tied to the selected commission_period
      fetched = await fetchPage(
        () =>
          supabase
            .from("withheld_commissions")
            .select("*")
            .in("status", ["approved", "paid"])
            .eq("commission_period", startIso) as any
      );
    }

    // Normalize numerics
    const normalized: CommissionRow[] = fetched.map((r: any) => ({
      ...r,
      net_sales: Number(r.net_sales) || 0,
      commission_rate: Number(r.commission_rate) || 0,
      commission_amount: Number(r.commission_amount) || 0,
    }));

    const { data: rgData } = await supabase
      .from("rep_groups")
      .select("id, name, agency_code, commission_pct");

    setRows(normalized);
    setRepGroups((rgData as RepGroup[]) || []);
    setLoading(false);
  }, [year, month, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset packetDownloaded flag when the period or view changes
  useEffect(() => {
    setPacketDownloaded(false);
  }, [year, month, viewMode]);

  /* ---------- group by agency ---------- */

  const { groups, summary, stats } = useMemo(() => {
    const nameByCode = new Map<string, string>();
    repGroups.forEach((rg) => {
      const code = normalizeCode(rg.agency_code);
      if (code && rg.name) nameByCode.set(code, rg.name);
    });

    const map = new Map<AgencyKey, AgencyGroup>();

    for (const r of rows) {
      const rawCode = normalizeCode(r.agency_code);
      const code = CODE_ALIASES[rawCode] ?? rawCode;
      const key = code || "UNASSIGNED";
      if (!map.has(key)) {
        const displayName =
          (code && nameByCode.get(code)) ||
          r.agency_name?.trim() ||
          (code ? `Agency ${code}` : "Unassigned");
        map.set(key, {
          key,
          code: code || "—",
          displayName,
          rate: r.commission_rate,
          orders: [],
          orderCount: 0,
          netSales: 0,
          commissionAmount: 0,
          arReceivedCount: 0,
          arReceivedAmount: 0,
          approvedCount: 0,
          approvedAmount: 0,
          paidCount: 0,
          paidAmount: 0,
        });
      }
      const g = map.get(key)!;
      g.orders.push(r);
      g.orderCount += 1;
      g.netSales += r.net_sales;
      g.commissionAmount += r.commission_amount;

      if (r.status === "ar_received") {
        g.arReceivedCount += 1;
        g.arReceivedAmount += r.commission_amount;
      } else if (r.status === "approved") {
        g.approvedCount += 1;
        g.approvedAmount += r.commission_amount;
      } else if (r.status === "paid") {
        g.paidCount += 1;
        g.paidAmount += r.commission_amount;
      }
    }

    // Sort by commission amount desc (biggest payout first)
    const groups = Array.from(map.values()).sort(
      (a, b) => b.commissionAmount - a.commissionAmount
    );

    const summary = groups.reduce(
      (acc, g) => {
        acc.orderCount += g.orderCount;
        acc.netSales += g.netSales;
        acc.commissionAmount += g.commissionAmount;
        acc.arReceivedCount += g.arReceivedCount;
        acc.arReceivedAmount += g.arReceivedAmount;
        acc.approvedCount += g.approvedCount;
        acc.approvedAmount += g.approvedAmount;
        acc.paidCount += g.paidCount;
        acc.paidAmount += g.paidAmount;
        return acc;
      },
      {
        orderCount: 0,
        netSales: 0,
        commissionAmount: 0,
        arReceivedCount: 0,
        arReceivedAmount: 0,
        approvedCount: 0,
        approvedAmount: 0,
        paidCount: 0,
        paidAmount: 0,
      }
    );

    const stats = {
      arReceivedCount: summary.arReceivedCount,
      approvedCount: summary.approvedCount,
      paidCount: summary.paidCount,
    };

    return { groups, summary, stats };
  }, [rows, repGroups]);

  /* ---------- checklist state (Current Run only) ---------- */

  const checklist = useMemo(() => {
    const anyRun =
      stats.arReceivedCount > 0 ||
      stats.approvedCount > 0 ||
      stats.paidCount > 0;
    const step1 = anyRun; // A/R uploaded (rows exist in this run)
    const step2 =
      stats.arReceivedCount === 0 &&
      (stats.approvedCount > 0 || stats.paidCount > 0);
    const step3 = step2 && (packetDownloaded || stats.paidCount > 0);
    const step4 = stats.paidCount > 0 && stats.arReceivedCount === 0;
    return { step1, step2, step3, step4 };
  }, [stats, packetDownloaded]);

  const canApprove = stats.arReceivedCount > 0 && !approving;
  const canGeneratePacket =
    (stats.approvedCount > 0 || stats.paidCount > 0) &&
    stats.arReceivedCount === 0 &&
    groups.length > 0 &&
    !packetBusy;
  const canMarkPaid =
    stats.approvedCount > 0 &&
    stats.arReceivedCount === 0 &&
    !markingPaid;

  /* ---------- actions ---------- */

  async function approveAll() {
    setApproving(true);
    const { startIso } = monthRange(year, month);
    const { error } = await supabase.rpc("approve_commissions_for_period", {
      _period: startIso,
      _approver: "owner",
    });
    setApproving(false);
    setConfirmOpen(null);
    if (error) {
      console.error("approve error:", error);
      return;
    }
    load();
  }

  async function markRunPaid() {
    setMarkingPaid(true);
    const { startIso } = monthRange(year, month);
    const { error } = await supabase.rpc("mark_commissions_paid", {
      _period: startIso,
    });
    setMarkingPaid(false);
    setConfirmOpen(null);
    if (error) {
      console.error("mark paid error:", error);
      return;
    }
    load();
  }

  /* ---------- row navigation ---------- */

  function openAgency(code: string) {
    const encoded = encodeURIComponent(code);
    router.push(
      `/commission-reporting/agency/${encoded}?year=${year}&month=${month}`
    );
  }

  /* ---------- CSV export ---------- */

  function exportCsv() {
    const rowsOut: string[] = [];
    rowsOut.push(
      [
        "Status",
        "Agency Code",
        "Agency",
        "Customer Name",
        "Address",
        "City",
        "State",
        "Zip",
        "PO",
        "Ship Date",
        "Invoice #",
        "Net Sales",
        "Rate",
        "Commission",
        "A/R Received",
        "Approved",
        "Paid",
        "Run Period",
      ].join(",")
    );
    const esc = (v: unknown) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    for (const g of groups) {
      const ordered = [...g.orders].sort((a, b) =>
        (a.customer_name || "").localeCompare(b.customer_name || "") ||
        (a.ship_date || "").localeCompare(b.ship_date || "")
      );
      for (const o of ordered) {
        rowsOut.push(
          [
            esc(o.status),
            esc(g.code),
            esc(g.displayName),
            esc(o.customer_name),
            esc((o.ship_address || "").split("\n")[0]),
            esc(o.ship_city),
            esc(o.ship_state),
            esc(o.ship_zip),
            esc(o.customerpo),
            esc(o.ship_date),
            esc(o.order_num),
            esc(o.net_sales.toFixed(2)),
            esc(`${o.commission_rate}%`),
            esc(o.commission_amount.toFixed(2)),
            esc(o.ar_received_date || ""),
            esc(o.approved_date || ""),
            esc(o.paid_date || ""),
            esc(o.commission_period || ""),
          ].join(",")
        );
      }
    }
    const blob = new Blob([rowsOut.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const modeTag =
      viewMode === "current_run"
        ? `current-run-${year}-${String(month).padStart(2, "0")}`
        : viewMode === "withheld"
        ? "withheld-backlog"
        : `historical-${year}-${String(month).padStart(2, "0")}`;
    a.download = `commissions-${modeTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- helper: AgencyGroup → PayoutAgency ----------
     The payoutPacket generator still uses the old "current/carryover"
     + commission_paid shape. We translate here:
       - Rows in the current run (ar_received/approved/paid for period) →
         "current" period. commission_paid = (status === 'paid').
       - Rows in the backlog view (status='withheld') →
         "carryover", commission_paid = false.
  -------------------------------------------------------- */

  function toPayoutAgency(g: AgencyGroup, backlog: CommissionRow[]): PayoutAgency {
    const backlogForAgency = backlog.filter(
      (r) =>
        (CODE_ALIASES[normalizeCode(r.agency_code)] ??
          normalizeCode(r.agency_code)) === g.code
    );

    const currentOrders: PayoutOrder[] = g.orders.map((o, idx) => ({
      id: idx,
      order_num: o.order_num,
      ship_date: o.ship_date,
      customer_name: o.customer_name,
      ship_address: o.ship_address,
      ship_city: o.ship_city,
      ship_state: o.ship_state,
      ship_zip: o.ship_zip,
      customerpo: o.customerpo,
      order_rep: o.order_rep,
      net_sales: o.net_sales,
      commission_paid: o.status === "paid",
      period: "current",
    }));

    const backlogOrders: PayoutOrder[] = backlogForAgency.map((o, idx) => ({
      id: 10_000_000 + idx,
      order_num: o.order_num,
      ship_date: o.ship_date,
      customer_name: o.customer_name,
      ship_address: o.ship_address,
      ship_city: o.ship_city,
      ship_state: o.ship_state,
      ship_zip: o.ship_zip,
      customerpo: o.customerpo,
      order_rep: o.order_rep,
      net_sales: o.net_sales,
      commission_paid: false,
      period: "carryover",
    }));

    const currentOrderCount = g.orderCount;
    const currentNetSales = g.netSales;
    const currentPaidCommissions = g.approvedAmount + g.paidAmount;
    const currentWithheldCommissions = 0; // ar_received rows shouldn't exist when generating packet
    const currentCommissions = g.commissionAmount;

    const carryoverOrderCount = backlogForAgency.length;
    const carryoverNetSales = backlogForAgency.reduce(
      (s, o) => s + o.net_sales,
      0
    );
    const carryoverCommissions = backlogForAgency.reduce(
      (s, o) => s + o.commission_amount,
      0
    );

    return {
      code: g.code,
      displayName: g.displayName,
      rate: g.rate,
      orders: [...currentOrders, ...backlogOrders],
      currentOrderCount,
      currentNetSales,
      currentPaidCommissions,
      currentWithheldCommissions,
      currentCommissions,
      carryoverOrderCount,
      carryoverNetSales,
      carryoverCommissions,
      totalWithheld: carryoverCommissions,
      totalOwedAndPaid: currentCommissions + carryoverCommissions,
    };
  }

  /* ---------- fetch backlog on demand (for packet generation) ---------- */

  async function fetchBacklog(): Promise<CommissionRow[]> {
    const out: CommissionRow[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from("withheld_commissions")
        .select("*")
        .eq("status", "withheld")
        .order("ship_date", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) {
        console.error("backlog fetch error:", error);
        break;
      }
      if (!data || data.length === 0) break;
      out.push(
        ...data.map((r: any) => ({
          ...r,
          net_sales: Number(r.net_sales) || 0,
          commission_rate: Number(r.commission_rate) || 0,
          commission_amount: Number(r.commission_amount) || 0,
        }))
      );
      if (data.length < PAGE_SIZE) break;
      page += 1;
    }
    return out;
  }

  /* ---------- quick download: single rep group ---------- */

  async function downloadAgencyWorkbook(g: AgencyGroup) {
    try {
      const backlog = await fetchBacklog();
      const payoutAgency = toPayoutAgency(g, backlog);
      const { blob, filename } = await generateSingleAgencyWorkbook(
        payoutAgency,
        year,
        month
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("single-agency download error:", err);
    }
  }

  /* ---------- payout packet: zip of per-agency xlsx ---------- */

  async function generatePayoutPacket() {
    if (groups.length === 0) return;
    setPacketBusy(true);
    try {
      const backlog = await fetchBacklog();
      const payoutAgencies = groups.map((g) => toPayoutAgency(g, backlog));

      const blob = await generatePayoutPacketZip(
        payoutAgencies,
        year,
        month
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payout-packet-${year}-${String(month).padStart(
        2,
        "0"
      )}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setPacketDownloaded(true);
    } catch (err) {
      console.error("payout packet error:", err);
    } finally {
      setPacketBusy(false);
    }
  }

  /* ---------- render ---------- */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Commission Reporting
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {viewMode === "current_run" && (
              <>
                {monthLabel(year, month)} run ·{" "}
                {fmtInt(summary.orderCount)} invoice
                {summary.orderCount === 1 ? "" : "s"}
              </>
            )}
            {viewMode === "withheld" && (
              <>
                Withheld backlog · {fmtInt(summary.orderCount)} invoice
                {summary.orderCount === 1 ? "" : "s"} waiting on customer
                payment
              </>
            )}
            {viewMode === "historical" && (
              <>
                Historical run · {monthLabel(year, month)} ·{" "}
                {fmtInt(summary.orderCount)} invoice
                {summary.orderCount === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(viewMode === "current_run" || viewMode === "historical") && (
            <>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleString("en-US", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>

              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
              >
                {Array.from(
                  { length: 6 },
                  (_, i) => now.getFullYear() - i
                ).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          )}

          <Link
            href="/commission-reporting/import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Upload size={13} />
            Upload A/R
          </Link>

          {viewMode === "current_run" && (
            <>
              <button
                onClick={() => setConfirmOpen("approve")}
                disabled={!canApprove}
                title={
                  canApprove
                    ? `Approve ${fmtInt(stats.arReceivedCount)} pending invoice${
                        stats.arReceivedCount === 1 ? "" : "s"
                      } for the ${monthLabel(year, month)} run`
                    : "No pending A/R items to approve"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldCheck size={13} />
                {approving ? "Approving…" : "Approve All"}
              </button>

              <button
                onClick={generatePayoutPacket}
                disabled={!canGeneratePacket}
                title={
                  canGeneratePacket
                    ? "Download one polished xlsx per rep group, zipped"
                    : "Approve the run before generating the packet"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Package size={13} />
                {packetBusy ? "Zipping…" : "Payout Packet"}
              </button>

              <button
                onClick={() => setConfirmOpen("mark_paid")}
                disabled={!canMarkPaid}
                title={
                  canMarkPaid
                    ? "Mark this run's approved invoices as paid"
                    : "Approve the run first"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} />
                {markingPaid ? "Marking…" : "Mark Run Paid"}
              </button>
            </>
          )}

          {viewMode === "historical" && (
            <button
              onClick={generatePayoutPacket}
              disabled={loading || packetBusy || groups.length === 0}
              title="Re-download this historical run's packet"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Package size={13} />
              {packetBusy ? "Zipping…" : "Re-download Packet"}
            </button>
          )}

          <button
            onClick={exportCsv}
            disabled={loading || groups.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 mb-5">
        <button
          onClick={() => setViewMode("current_run")}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition",
            viewMode === "current_run"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <FileCheck size={11} />
          Current Run
        </button>
        <button
          onClick={() => setViewMode("withheld")}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition",
            viewMode === "withheld"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <Clock size={11} />
          Withheld Backlog
        </button>
        <button
          onClick={() => setViewMode("historical")}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition",
            viewMode === "historical"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          <History size={11} />
          Historical
        </button>
      </div>

      {/* Checklist (Current Run only) */}
      {viewMode === "current_run" && (
        <div className="rounded-xl border border-gray-200 bg-white mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {monthLabel(year, month)} Run Checklist
            </h2>
            <span className="text-[11px] text-gray-400">
              Complete each step before generating the payout packet
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-gray-100">
            <ChecklistStep
              num={1}
              label="Upload A/R"
              done={checklist.step1}
              detail={
                checklist.step1
                  ? `${fmtInt(
                      stats.arReceivedCount +
                        stats.approvedCount +
                        stats.paidCount
                    )} invoices pulled`
                  : "Import paid receivables"
              }
            />
            <ChecklistStep
              num={2}
              label="Owner Approval"
              done={checklist.step2}
              detail={
                stats.arReceivedCount > 0
                  ? `${fmtInt(stats.arReceivedCount)} awaiting approval`
                  : stats.approvedCount > 0 || stats.paidCount > 0
                  ? `${fmtInt(
                      stats.approvedCount + stats.paidCount
                    )} approved`
                  : "Approve the run"
              }
            />
            <ChecklistStep
              num={3}
              label="Generate Packet"
              done={checklist.step3}
              detail={
                checklist.step3
                  ? "Packet downloaded"
                  : "Download the payout zip"
              }
            />
            <ChecklistStep
              num={4}
              label="Mark Run Paid"
              done={checklist.step4}
              detail={
                checklist.step4
                  ? `${fmtInt(stats.paidCount)} marked paid`
                  : "Close out the run"
              }
            />
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {viewMode === "current_run" && (
          <>
            <KpiCard
              label="Payment Due This Run"
              value={`$${fmtMoney(
                summary.approvedAmount + summary.paidAmount
              )}`}
              icon={<DollarSign size={13} />}
              subLabel={`${fmtInt(
                stats.approvedCount + stats.paidCount
              )} approved invoice${
                stats.approvedCount + stats.paidCount === 1 ? "" : "s"
              }`}
              highlight
            />
            <KpiCard
              label="Pending Approval"
              value={`$${fmtMoney(summary.arReceivedAmount)}`}
              icon={<AlertCircle size={13} />}
              subLabel={`${fmtInt(stats.arReceivedCount)} awaiting your sign-off`}
              amber={stats.arReceivedCount > 0}
            />
            <KpiCard
              label="Rep Groups"
              value={fmtInt(groups.length)}
              icon={<FileCheck size={13} />}
              subLabel="Agencies on this run"
            />
          </>
        )}
        {viewMode === "withheld" && (
          <>
            <KpiCard
              label="Total Withheld"
              value={`$${fmtMoney(summary.commissionAmount)}`}
              icon={<AlertCircle size={13} />}
              subLabel={`${fmtInt(
                summary.orderCount
              )} invoices still waiting on customer payment`}
              highlight
            />
            <KpiCard
              label="Net Sales (Backlog)"
              value={`$${fmtMoney(summary.netSales)}`}
              icon={<DollarSign size={13} />}
              subLabel="Sales value of withheld invoices"
            />
            <KpiCard
              label="Rep Groups"
              value={fmtInt(groups.length)}
              icon={<Clock size={13} />}
              subLabel="Agencies with unpaid invoices"
            />
          </>
        )}
        {viewMode === "historical" && (
          <>
            <KpiCard
              label="Paid on This Run"
              value={`$${fmtMoney(summary.commissionAmount)}`}
              icon={<Check size={13} />}
              subLabel={`${monthLabel(year, month)} commission run`}
              highlight
            />
            <KpiCard
              label="Net Sales"
              value={`$${fmtMoney(summary.netSales)}`}
              icon={<DollarSign size={13} />}
              subLabel={`${fmtInt(summary.orderCount)} invoice${
                summary.orderCount === 1 ? "" : "s"
              }`}
            />
            <KpiCard
              label="Rep Groups"
              value={fmtInt(groups.length)}
              icon={<History size={13} />}
              subLabel="Agencies paid this run"
            />
          </>
        )}
      </div>

      {/* Summary Table */}
      <div className="rounded-xl border border-gray-200 bg-white mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {viewMode === "current_run" &&
              `Summary — ${monthLabel(year, month)} Run`}
            {viewMode === "withheld" && "Summary — Withheld Backlog"}
            {viewMode === "historical" &&
              `Historical Run — ${monthLabel(year, month)}`}
          </h2>
          <span className="text-[11px] text-gray-400">
            Click a rep group to open its detail page
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <Th className="w-8"></Th>
                <Th>Rep Group</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Net Sales</Th>
                <Th className="text-right">Rate</Th>
                {viewMode === "current_run" && (
                  <>
                    <Th className="text-right">Pending</Th>
                    <Th className="text-right">Approved</Th>
                  </>
                )}
                <Th className="text-right">
                  {viewMode === "current_run"
                    ? "Run Total"
                    : viewMode === "withheld"
                    ? "Withheld"
                    : "Paid"}
                </Th>
                <Th className="w-10"></Th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={viewMode === "current_run" ? 9 : 7}
                    className="py-10 text-center text-gray-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td
                    colSpan={viewMode === "current_run" ? 9 : 7}
                    className="py-10 text-center text-gray-400"
                  >
                    {viewMode === "current_run" &&
                      `No commissions in the ${monthLabel(year, month)} run yet. Upload an A/R file to get started.`}
                    {viewMode === "withheld" &&
                      "No withheld invoices — everything is caught up."}
                    {viewMode === "historical" &&
                      `No historical run for ${monthLabel(year, month)}`}
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr
                    key={g.key}
                    onClick={() => openAgency(g.code)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer group"
                  >
                    <Td>
                      <ChevronRight
                        size={14}
                        className="text-gray-300 group-hover:text-gray-600 transition"
                      />
                    </Td>
                    <Td>
                      <div className="font-medium text-gray-900 group-hover:text-gray-700">
                        {g.displayName}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        Code {g.code}
                        {viewMode === "current_run" && g.arReceivedCount > 0 && (
                          <>
                            {" · "}
                            <span className="text-amber-600">
                              {g.arReceivedCount} pending
                            </span>
                          </>
                        )}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {fmtInt(g.orderCount)}
                    </Td>
                    <Td className="text-right tabular-nums">
                      ${fmtMoney(g.netSales)}
                    </Td>
                    <Td className="text-right tabular-nums">{g.rate}%</Td>
                    {viewMode === "current_run" && (
                      <>
                        <Td className="text-right tabular-nums text-amber-700">
                          {g.arReceivedAmount > 0
                            ? `$${fmtMoney(g.arReceivedAmount)}`
                            : "—"}
                        </Td>
                        <Td className="text-right tabular-nums text-emerald-700">
                          {g.approvedAmount + g.paidAmount > 0
                            ? `$${fmtMoney(g.approvedAmount + g.paidAmount)}`
                            : "—"}
                        </Td>
                      </>
                    )}
                    <Td
                      className={clsx(
                        "text-right tabular-nums font-semibold",
                        viewMode === "withheld"
                          ? "text-amber-700"
                          : "text-gray-900"
                      )}
                    >
                      ${fmtMoney(g.commissionAmount)}
                    </Td>
                    <Td className="text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadAgencyWorkbook(g);
                        }}
                        title="Download this rep group's report (.xlsx)"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
                      >
                        <Download size={13} />
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>

            {groups.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <Td></Td>
                  <Td className="font-semibold text-gray-900">Total</Td>
                  <Td className="text-right tabular-nums font-semibold">
                    {fmtInt(summary.orderCount)}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold">
                    ${fmtMoney(summary.netSales)}
                  </Td>
                  <Td></Td>
                  {viewMode === "current_run" && (
                    <>
                      <Td className="text-right tabular-nums font-semibold text-amber-700">
                        ${fmtMoney(summary.arReceivedAmount)}
                      </Td>
                      <Td className="text-right tabular-nums font-semibold text-emerald-700">
                        $
                        {fmtMoney(
                          summary.approvedAmount + summary.paidAmount
                        )}
                      </Td>
                    </>
                  )}
                  <Td
                    className={clsx(
                      "text-right tabular-nums font-semibold",
                      viewMode === "withheld"
                        ? "text-amber-700"
                        : "text-gray-900"
                    )}
                  >
                    ${fmtMoney(summary.commissionAmount)}
                  </Td>
                  <Td></Td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Confirmation modal — Approve */}
      {confirmOpen === "approve" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !approving && setConfirmOpen(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                Approve {monthLabel(year, month)} Run
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-xs text-gray-700">
              <p>
                You&apos;re about to approve{" "}
                <strong>{fmtInt(stats.arReceivedCount)}</strong> invoice
                {stats.arReceivedCount === 1 ? "" : "s"} totaling{" "}
                <strong>${fmtMoney(summary.arReceivedAmount)}</strong> in
                commissions.
              </p>
              <p className="text-gray-500 text-[11px]">
                Every approved invoice will be stamped with{" "}
                <code className="text-gray-700">
                  commission_period = {monthRange(year, month).startIso}
                </code>
                . You can still unapprove individual invoices from the rep
                group detail page before generating the packet.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(null)}
                disabled={approving}
                className="px-3 py-2 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={approveAll}
                disabled={approving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-40"
              >
                <ShieldCheck size={13} />
                {approving ? "Approving…" : "Approve All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal — Mark Paid */}
      {confirmOpen === "mark_paid" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !markingPaid && setConfirmOpen(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                Close Out {monthLabel(year, month)} Run
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-xs text-gray-700">
              <p>
                Mark{" "}
                <strong>{fmtInt(stats.approvedCount)}</strong> approved
                invoice{stats.approvedCount === 1 ? "" : "s"} as paid?
              </p>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total being paid</span>
                  <span className="font-semibold tabular-nums">
                    ${fmtMoney(summary.approvedAmount)}
                  </span>
                </div>
              </div>
              <p className="text-gray-500 text-[11px]">
                These invoices will be stamped with today&apos;s date as the
                payment date and will move into the Historical view.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(null)}
                disabled={markingPaid}
                className="px-3 py-2 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={markRunPaid}
                disabled={markingPaid}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition disabled:opacity-40"
              >
                <Check size={13} />
                {markingPaid ? "Marking…" : "Mark Run Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

function KpiCard({
  label,
  value,
  icon,
  subLabel,
  highlight,
  amber,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subLabel?: string;
  highlight?: boolean;
  amber?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-4",
        highlight && "border-gray-900 bg-white",
        amber && !highlight && "border-amber-200 bg-amber-50",
        !highlight && !amber && "border-gray-200 bg-white"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={clsx(
            "flex items-center justify-center w-6 h-6 rounded-lg",
            amber ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
          )}
        >
          {icon}
        </div>
        <span
          className={clsx(
            "text-[10px] font-medium uppercase tracking-wider",
            amber ? "text-amber-700" : "text-gray-400"
          )}
        >
          {label}
        </span>
      </div>
      <div
        className={clsx(
          "text-lg font-semibold tabular-nums",
          amber ? "text-amber-900" : "text-gray-900"
        )}
      >
        {value}
      </div>
      {subLabel && (
        <div
          className={clsx(
            "text-[10px] mt-1",
            amber ? "text-amber-700" : "text-gray-400"
          )}
        >
          {subLabel}
        </div>
      )}
    </div>
  );
}

function ChecklistStep({
  num,
  label,
  done,
  detail,
}: {
  num: number;
  label: string;
  done: boolean;
  detail: string;
}) {
  return (
    <div
      className={clsx(
        "bg-white px-4 py-3 flex items-start gap-3",
        done && "bg-emerald-50/40"
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5",
          done
            ? "bg-emerald-600 text-white"
            : "bg-gray-100 text-gray-400"
        )}
      >
        {done ? <CheckCircle2 size={14} /> : <span className="text-[10px] font-semibold">{num}</span>}
      </div>
      <div className="min-w-0">
        <div
          className={clsx(
            "text-xs font-semibold",
            done ? "text-emerald-900" : "text-gray-700"
          )}
        >
          {label}
        </div>
        <div
          className={clsx(
            "text-[10px] mt-0.5",
            done ? "text-emerald-700" : "text-gray-500"
          )}
        >
          {detail}
        </div>
      </div>
    </div>
  );
}
