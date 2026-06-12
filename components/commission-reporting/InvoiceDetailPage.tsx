"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Check,
  AlertCircle,
  Package,
  User,
  MapPin,
  FileText,
  Calendar,
  Building2,
  Truck,
  Tag,
  Hash,
  Mail,
  Phone,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

/* ════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════ */

type OrderFull = {
  id: number;
  num: string;
  billtoname: string | null;
  billtoaddress: string | null;
  billtocity: string | null;
  billtostate: string | null;
  billtozip: string | null;
  shiptoname: string | null;
  shiptoaddress: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
  shiptozip: string | null;
  customerid: string | null;
  customercontact: string | null;
  customerpo: string | null;
  datecompleted: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  totalprice: number | null;
  channel: string | null;
  customfields: any;
};

type LineItem = {
  id: number;
  solineitem: number | null;
  productnum: string | null;
  description: string | null;
  typename: string | null;
  qtyfulfilled: number | null;
  qtyordered: number | null;
  totalprice: number | null;
};

type WcStatus = "withheld" | "ar_received" | "approved" | "paid";

type WcRow = {
  status: WcStatus;
  paid_date: string | null;
  ar_received_date: string | null;
  approved_date: string | null;
  commission_period: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  updated_at: string;
};

type RepGroup = {
  id: string;
  name: string;
  agency_code: string | null;
  commission_pct: number;
};

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

// Customfields are stored double-encoded (string inside jsonb); unwrap them.
function unwrapCustomFields(cf: any): Record<string, any> {
  if (cf == null) return {};
  if (typeof cf === "string") {
    try {
      return JSON.parse(cf);
    } catch {
      return {};
    }
  }
  if (typeof cf === "object") return cf;
  return {};
}

function getField(cf: Record<string, any>, key: string): string {
  const entry = cf[key];
  if (entry && typeof entry === "object" && "value" in entry) {
    return String(entry.value ?? "");
  }
  return "";
}

const NET_SALES_TYPES = new Set([
  "Sale",
  "Discount Percentage",
  "Discount Amount",
]);

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */

export default function InvoiceDetailPage({
  orderNum,
}: {
  orderNum: string;
}) {
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [wc, setWc] = useState<WcRow | null>(null);
  const [repGroups, setRepGroups] = useState<RepGroup[]>([]);
  const [defaultRate, setDefaultRate] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [savingAr, setSavingAr] = useState(false);

  /* ---------- load ---------- */

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);

    // Order: match by num exactly. If multiple rows exist for same num
    // (shouldn't, but just in case), take the most recent by id.
    const { data: orderRows, error: orderErr } = await supabase
      .from("sales_orders_current")
      .select("*")
      .eq("num", orderNum)
      .order("id", { ascending: false })
      .limit(1);

    if (orderErr) console.error("order fetch error:", orderErr);

    const o = orderRows?.[0] as OrderFull | undefined;
    if (!o) {
      setOrder(null);
      setItems([]);
      setWc(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setOrder({ ...o, totalprice: Number(o.totalprice) || 0 });

    // Line items
    const { data: itemRows } = await supabase
      .from("so_items_current")
      .select(
        "id, solineitem, productnum, description, typename, qtyfulfilled, qtyordered, totalprice"
      )
      .eq("soid", o.id)
      .order("solineitem", { ascending: true });

    setItems(
      ((itemRows as any[]) ?? []).map((i) => ({
        ...i,
        qtyfulfilled: Number(i.qtyfulfilled) || 0,
        qtyordered: Number(i.qtyordered) || 0,
        totalprice: Number(i.totalprice) || 0,
      }))
    );

    // Commission lifecycle row + rep groups + default rate (parallel)
    const [wcRes, rgRes, settingRes] = await Promise.all([
      supabase
        .from("withheld_commissions")
        .select(
          "status, paid_date, ar_received_date, approved_date, commission_period, commission_rate, commission_amount, updated_at"
        )
        .eq("order_num", orderNum)
        .maybeSingle(),
      supabase
        .from("rep_groups")
        .select("id, name, agency_code, commission_pct"),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "default_commission_rate")
        .maybeSingle(),
    ]);

    setWc((wcRes.data as WcRow | null) ?? null);
    setRepGroups((rgRes.data as RepGroup[]) ?? []);
    if (settingRes.data?.value) {
      const n = parseFloat(settingRes.data.value);
      if (!Number.isNaN(n)) setDefaultRate(n);
    }

    setLoading(false);
  }, [orderNum]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- derived ---------- */

  const cf = useMemo(
    () => unwrapCustomFields(order?.customfields),
    [order]
  );

  const orderAgency = getField(cf, "10"); // Order Agency
  const orderAgencyCode = getField(cf, "13"); // Order Agency Code
  const orderRep = getField(cf, "11"); // Order Rep
  const territoryAgency = getField(cf, "6");
  const territoryCode = getField(cf, "7");
  const territoryRep = getField(cf, "8");
  const orderSource = getField(cf, "12");

  const normalizedAgencyCode = normalizeCode(orderAgencyCode);

  const matchedRg = repGroups.find(
    (rg) => normalizeCode(rg.agency_code) === normalizedAgencyCode
  );
  const rate = matchedRg?.commission_pct ?? defaultRate;
  const agencyDisplay =
    matchedRg?.name || orderAgency?.trim() || "—";

  // Net sales breakdown — Discount Percentage + Discount Amount are
  // combined into a single "Discount" bucket for display.
  const breakdown = useMemo(() => {
    let sale = 0;
    let discount = 0;
    let other = 0;
    for (const i of items) {
      const tn = i.typename || "";
      const v = i.totalprice || 0;
      if (tn === "Sale") sale += v;
      else if (tn === "Discount Percentage" || tn === "Discount Amount")
        discount += v;
      else other += v;
    }
    return {
      sale,
      discount,
      netSales: sale + discount,
      other,
    };
  }, [items]);

  const commission = breakdown.netSales * (rate / 100);
  const status: WcStatus = wc?.status ?? "withheld";
  const isPaid = status === "paid";

  /* ---------- AR toggle (writes directly to withheld_commissions) ----------
     Quick-fix for a single invoice:
       paid → withheld (reopen & clear lifecycle stamps)
       anything → paid (skips the normal approval flow)
     Normal flow runs through Commission Reporting → Upload A/R →
     Approve All → Mark Run Paid. */

  async function togglePaid() {
    if (!order?.num) return;
    setSavingAr(true);
    const nextPaid = !isPaid;
    const nowIso = new Date().toISOString();
    const todayIso = nowIso.slice(0, 10);

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
      .eq("order_num", order.num);

    if (error) {
      console.error("toggle paid error:", error);
    } else {
      setWc((prev) =>
        prev
          ? {
              ...prev,
              ...patch,
              updated_at: nowIso,
            }
          : {
              status: nextPaid ? "paid" : "withheld",
              paid_date: nextPaid ? todayIso : null,
              ar_received_date: null,
              approved_date: null,
              commission_period: null,
              commission_rate: rate,
              commission_amount: commission,
              updated_at: nowIso,
            }
      );
    }
    setSavingAr(false);
  }

  /* ---------- Unapprove (flip approved → ar_received) ---------- */

  async function unapprove() {
    if (!order?.num || status !== "approved") return;
    setSavingAr(true);
    const { error } = await supabase.rpc("unapprove_commission", {
      _order_num: order.num,
    });
    if (error) {
      console.error("unapprove error:", error);
    } else {
      setWc((prev) =>
        prev
          ? {
              ...prev,
              status: "ar_received",
              approved_date: null,
              commission_period: null,
              updated_at: new Date().toISOString(),
            }
          : prev
      );
    }
    setSavingAr(false);
  }

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-xs text-gray-400">
          Loading invoice…
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
        <Link
          href="/commission-reporting"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={12} />
          Back to Commission Reporting
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <FileText size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500 mb-1">
            Invoice not found
          </p>
          <p className="text-xs text-gray-400">
            No order matching #{orderNum} in sales_orders_current.
          </p>
        </div>
      </div>
    );
  }

  const backHref = normalizedAgencyCode
    ? `/commission-reporting/agency/${encodeURIComponent(
        normalizedAgencyCode
      )}`
    : "/commission-reporting";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-3"
      >
        <ArrowLeft size={12} />
        {normalizedAgencyCode
          ? `Back to ${agencyDisplay}`
          : "Back to Commission Reporting"}
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">
              Invoice #{order.num}
            </h1>
            <StatusBadge status={order.status} />
            <CommissionStatusBadge status={status} />
          </div>
          <p className="text-xs text-gray-500">
            {order.billtoname || "—"}
            {order.customerpo && (
              <>
                {" · "}
                PO <span className="font-mono">{order.customerpo}</span>
              </>
            )}
            {order.datecompleted && <> · Shipped {order.datecompleted}</>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "approved" && (
            <button
              onClick={unapprove}
              disabled={savingAr}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition",
                savingAr && "opacity-50 cursor-wait"
              )}
            >
              Unapprove
            </button>
          )}
          <button
            onClick={togglePaid}
            disabled={savingAr}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
              isPaid
                ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
              savingAr && "opacity-50 cursor-wait"
            )}
          >
            {isPaid ? "Mark Unpaid" : "Mark Paid"}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi
          label="Net Sales"
          value={`$${fmtMoney(breakdown.netSales)}`}
          icon={<DollarSign size={13} />}
          subLabel={`Document total $${fmtMoney(order.totalprice ?? 0)}`}
        />
        <Kpi
          label="Commission Rate"
          value={`${rate}%`}
          icon={<Tag size={13} />}
          subLabel={matchedRg ? matchedRg.name : "Default rate"}
        />
        <Kpi
          label="Commission"
          value={`$${fmtMoney(commission)}`}
          icon={<DollarSign size={13} />}
          highlight
        />
        <Kpi
          label="Commission Status"
          value={statusLabel(status)}
          icon={isPaid ? <Check size={13} /> : <AlertCircle size={13} />}
          subLabel={statusSubLabel(status, wc)}
          amber={status === "withheld"}
          emerald={isPaid}
        />
      </div>

      {/* Two-column info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Customer card */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <User size={13} className="text-gray-500" />
            <h2 className="text-xs font-semibold text-gray-900">Customer</h2>
          </div>
          <InfoRow
            label="Name"
            value={order.billtoname}
            icon={<Building2 size={11} />}
          />
          <InfoRow
            label="Customer ID"
            value={order.customerid}
            mono
            icon={<Hash size={11} />}
          />
          <InfoRow
            label="Contact"
            value={order.customercontact}
            icon={<User size={11} />}
          />
          <InfoRow
            label="Email"
            value={order.email}
            icon={<Mail size={11} />}
          />
          <InfoRow
            label="Phone"
            value={order.phone}
            icon={<Phone size={11} />}
          />

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={11} className="text-gray-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Bill To
              </span>
            </div>
            <AddressBlock
              name={order.billtoname}
              address={order.billtoaddress}
              city={order.billtocity}
              state={order.billtostate}
              zip={order.billtozip}
            />
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Truck size={11} className="text-gray-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Ship To
              </span>
            </div>
            <AddressBlock
              name={order.shiptoname}
              address={order.shiptoaddress}
              city={order.shiptocity}
              state={order.shiptostate}
              zip={order.shiptozip}
            />
          </div>
        </div>

        {/* Order/Commission card */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Package size={13} className="text-gray-500" />
            <h2 className="text-xs font-semibold text-gray-900">
              Order & Commission
            </h2>
          </div>
          <InfoRow
            label="Invoice #"
            value={order.num}
            mono
            icon={<FileText size={11} />}
          />
          <InfoRow
            label="PO"
            value={order.customerpo}
            mono
            icon={<Hash size={11} />}
          />
          <InfoRow
            label="Ship Date"
            value={order.datecompleted}
            icon={<Calendar size={11} />}
          />
          <InfoRow label="Status" value={order.status} />
          <InfoRow label="Channel" value={order.channel} />
          <InfoRow
            label="Document Amount"
            value={`$${fmtMoney(order.totalprice ?? 0)}`}
          />

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Sales Agency
            </div>
            <InfoRow label="Order Agency" value={orderAgency} />
            <InfoRow
              label="Order Code"
              value={orderAgencyCode}
              mono
            />
            <InfoRow label="Order Rep" value={orderRep} />
            <InfoRow label="Order Source" value={orderSource} />
            <InfoRow
              label="Territory Agency"
              value={territoryAgency}
            />
            <InfoRow label="Territory Code" value={territoryCode} mono />
            <InfoRow label="Territory Rep" value={territoryRep} />
          </div>
        </div>
      </div>

      {/* Commission breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <DollarSign size={13} className="text-gray-500" />
          <h2 className="text-xs font-semibold text-gray-900">
            Commission Calculation
          </h2>
        </div>
        <div className="space-y-1.5 text-xs">
          <CalcRow label="Sale line items" value={breakdown.sale} />
          <CalcRow label="Discount" value={breakdown.discount} />
          <div className="border-t border-gray-100 pt-1.5">
            <CalcRow label="Net Sales" value={breakdown.netSales} bold />
          </div>
          <CalcRow
            label={`× Commission Rate (${rate}%)`}
            value={null}
            plain
          />
          <div className="border-t border-gray-100 pt-1.5">
            <CalcRow
              label="Commission Owed"
              value={commission}
              bold
              highlight
            />
          </div>
          {breakdown.other !== 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
              Excluded from net sales: $
              {fmtMoney(breakdown.other)} (Shipping, Tax, Subtotal, etc.)
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Line Items
          </h2>
          <p className="text-[10px] text-gray-400">
            {items.length} line
            {items.length === 1 ? "" : "s"} from Spire · items marked with
            ★ contribute to Net Sales
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <Th className="w-8">#</Th>
                <Th>Product #</Th>
                <Th>Description</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-center">Net</Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-6 text-center text-gray-400 text-[11px]"
                  >
                    No line items found for this order.
                  </td>
                </tr>
              ) : (
                items.map((i) => {
                  const counts = i.typename
                    ? NET_SALES_TYPES.has(i.typename)
                    : false;
                  return (
                    <tr
                      key={i.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <Td className="text-gray-400 tabular-nums">
                        {i.solineitem ?? ""}
                      </Td>
                      <Td className="font-mono">{i.productnum || "—"}</Td>
                      <Td className="max-w-[320px] truncate">
                        {i.description || "—"}
                      </Td>
                      <Td>
                        <TypeBadge name={i.typename} />
                      </Td>
                      <Td className="text-right tabular-nums">
                        {i.qtyfulfilled ?? i.qtyordered ?? ""}
                      </Td>
                      <Td
                        className={clsx(
                          "text-right tabular-nums",
                          (i.totalprice ?? 0) < 0 && "text-red-700"
                        )}
                      >
                        ${fmtMoney(i.totalprice ?? 0)}
                      </Td>
                      <Td className="text-center">
                        {counts ? (
                          <span
                            className="text-amber-500"
                            title="Contributes to Net Sales"
                          >
                            ★
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commission lifecycle timeline */}
      {wc && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertCircle size={13} className="text-gray-500" />
            <h2 className="text-xs font-semibold text-gray-900">
              Commission Lifecycle
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                State
              </div>
              <div
                className={clsx(
                  "font-semibold",
                  status === "paid"
                    ? "text-emerald-700"
                    : status === "approved"
                      ? "text-indigo-700"
                      : status === "ar_received"
                        ? "text-sky-700"
                        : "text-amber-700"
                )}
              >
                {statusLabel(status)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                A/R Received
              </div>
              <div className="text-gray-900">
                {wc.ar_received_date || "—"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                Approved
              </div>
              <div className="text-gray-900">{wc.approved_date || "—"}</div>
            </div>
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                Paid Date
              </div>
              <div className="text-gray-900">{wc.paid_date || "—"}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                Commission Period
              </div>
              <div className="text-gray-900">
                {wc.commission_period || "—"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                Snapshot Rate
              </div>
              <div className="text-gray-900">
                {wc.commission_rate != null
                  ? `${wc.commission_rate}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                Last Updated
              </div>
              <div className="text-gray-900">
                {new Date(wc.updated_at).toLocaleDateString("en-US")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SUB-COMPONENTS
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

function InfoRow({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[11px]">
      <div className="flex items-center gap-1.5 text-gray-500">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span>{label}</span>
      </div>
      <div
        className={clsx(
          "text-gray-900 text-right",
          mono && "font-mono"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AddressBlock({
  name,
  address,
  city,
  state,
  zip,
}: {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  const lines: string[] = [];
  if (name) lines.push(name);
  if (address) lines.push(...address.split("\n"));
  const cityLine = [city, state, zip].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (lines.length === 0)
    return <div className="text-[10px] text-gray-400">—</div>;
  return (
    <div className="text-[11px] text-gray-700 leading-relaxed">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function CalcRow({
  label,
  value,
  bold,
  highlight,
  plain,
}: {
  label: string;
  value: number | null;
  bold?: boolean;
  highlight?: boolean;
  plain?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between",
        bold && "font-semibold",
        highlight && "text-gray-900",
        plain && "text-gray-500"
      )}
    >
      <span className={clsx(!bold && !plain && "text-gray-600")}>
        {label}
      </span>
      {value != null && (
        <span
          className={clsx(
            "tabular-nums",
            value < 0 && !bold && "text-amber-700"
          )}
        >
          {value < 0 ? "-" : ""}${fmtMoney(Math.abs(value))}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  const color = lower.includes("fulfill")
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : lower.includes("cancel")
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
        color
      )}
    >
      {status}
    </span>
  );
}

function TypeBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-gray-400">—</span>;
  const isNet = NET_SALES_TYPES.has(name);
  // Display both "Discount Percentage" and "Discount Amount" as just "Discount"
  const display =
    name === "Discount Percentage" || name === "Discount Amount"
      ? "Discount"
      : name;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px]",
        isNet
          ? "bg-amber-50 text-amber-800"
          : "bg-gray-100 text-gray-600"
      )}
    >
      {display}
    </span>
  );
}

function Kpi({
  label,
  value,
  icon,
  subLabel,
  highlight,
  amber,
  emerald,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subLabel?: string;
  highlight?: boolean;
  amber?: boolean;
  emerald?: boolean;
}) {
  const base = "rounded-xl border p-4";
  const theme = highlight
    ? "border-gray-900 bg-white"
    : emerald
      ? "border-emerald-200 bg-emerald-50"
      : amber
        ? "border-amber-200 bg-amber-50"
        : "border-gray-200 bg-white";
  const labelColor = emerald
    ? "text-emerald-700"
    : amber
      ? "text-amber-700"
      : "text-gray-400";
  const iconBg = emerald
    ? "bg-emerald-100 text-emerald-700"
    : amber
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-500";
  const valueColor = emerald
    ? "text-emerald-900"
    : amber
      ? "text-amber-900"
      : "text-gray-900";
  return (
    <div className={clsx(base, theme)}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={clsx(
            "flex items-center justify-center w-6 h-6 rounded-lg",
            iconBg
          )}
        >
          {icon}
        </div>
        <span
          className={clsx(
            "text-[10px] font-medium uppercase tracking-wider",
            labelColor
          )}
        >
          {label}
        </span>
      </div>
      <div className={clsx("text-lg font-semibold tabular-nums", valueColor)}>
        {value}
      </div>
      {subLabel && (
        <div className={clsx("text-[10px] mt-1", labelColor)}>{subLabel}</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Commission lifecycle helpers
   ════════════════════════════════════════════════════════════ */

function statusLabel(status: WcStatus): string {
  switch (status) {
    case "withheld":
      return "Withheld";
    case "ar_received":
      return "A/R Received";
    case "approved":
      return "Approved";
    case "paid":
      return "Paid";
  }
}

function statusSubLabel(
  status: WcStatus,
  wc: WcRow | null
): string | undefined {
  if (!wc) return undefined;
  switch (status) {
    case "paid":
      return wc.paid_date ? `Paid ${wc.paid_date}` : undefined;
    case "approved":
      return wc.approved_date ? `Approved ${wc.approved_date}` : undefined;
    case "ar_received":
      return wc.ar_received_date
        ? `A/R received ${wc.ar_received_date}`
        : undefined;
    case "withheld":
      return "Awaiting A/R";
  }
}

function CommissionStatusBadge({ status }: { status: WcStatus }) {
  const cfg: Record<WcStatus, { label: string; className: string }> = {
    withheld: {
      label: "Withheld",
      className: "bg-amber-100 text-amber-900",
    },
    ar_received: {
      label: "A/R Received",
      className: "bg-sky-100 text-sky-900",
    },
    approved: {
      label: "Approved",
      className: "bg-indigo-100 text-indigo-900",
    },
    paid: {
      label: "Commission Paid",
      className: "bg-emerald-100 text-emerald-900",
    },
  };
  const c = cfg[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
        c.className
      )}
    >
      {status === "paid" ? <Check size={10} /> : <AlertCircle size={10} />}
      {c.label}
    </span>
  );
}
