"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Customer, D2CCustomer } from "./types";
import type { CustomerViewMode } from "./constants";
import {
  formatMoney,
  formatDate,
  getCustomerStatus,
} from "./customerDisplay";
import {
  customerEmailFlag,
  flagChip,
  type CustomerEmailFlag,
  type SuppressionMaps,
} from "./hooks/useSuppressionFlags";
import {
  qualityChip,
  type EmailQualityMaps,
} from "./hooks/useEmailQuality";
import { skipChip, type CampaignSkipMaps } from "./hooks/useCampaignSkips";

/** Tiny inline chip flagging a customer's email state.
 *
 *  Suppression wins when both apply: "bounced" is the more actionable fact
 *  than "that's a role address", and two chips on one row is noise. */
function EmailFlagChip({ flag }: { flag: CustomerEmailFlag | null }) {
  if (!flag) return null;
  const chip = flagChip(flag);
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${chip.className}`}
      title={chip.title}
    >
      {chip.label}
    </span>
  );
}

/**
 * One chip per row, most actionable first: a suppression (bounced, opted
 * out), then a bad address, then whatever stopped the last campaign send.
 *
 * The last one is usually explained by the first two — a skip for "no email
 * address" is the same fact the "No email" chip already states — so skipChip
 * returns null for those and only speaks up when it knows something new,
 * like a duplicate address inside the send.
 */
function EmailChip({
  flag,
  quality,
  skips,
  customerRef,
}: {
  flag: CustomerEmailFlag | null;
  quality: EmailQualityMaps;
  skips: CampaignSkipMaps;
  customerRef: string;
}) {
  if (flag) return <EmailFlagChip flag={flag} />;

  const info = quality.byRef.get(customerRef);
  const chip = info ? qualityChip(info) : null;

  const skip = chip ? null : skips.byRef.get(customerRef);
  const resolved = chip ?? (skip ? skipChip(skip) : null);
  if (!resolved) return null;

  return (
    <span
      className={`inline-block shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${resolved.className}`}
      title={resolved.title}
    >
      {resolved.label}
    </span>
  );
}

type SortColumn =
  | "name"
  | "last_order_date"
  | "last_order_amount"
  | "sales_2026"
  | "sales_2025"
  | "sales_2024"
  | "sales_2023";

type Align = "left" | "center" | "right";

const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export default function CustomersTable({
  customers = [],
  loading,
  sortColumn,
  sortDir,
  onSort,
  viewMode = "wholesale",
  selectedIds,
  onToggleSelect,
  onToggleAll,
  suppression,
  quality,
  skips,
}: {
  customers?: (Customer | D2CCustomer)[];
  loading: boolean;
  sortColumn: SortColumn;
  sortDir: "asc" | "desc";
  onSort: (column: SortColumn) => void;
  viewMode?: CustomerViewMode;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  /** Email-suppression maps from the page (shared with its filter). */
  suppression: SuppressionMaps;
  /** Address-quality maps from the page (shared with its filter). */
  quality: EmailQualityMaps;
  /** Last-campaign outcomes from the page (shared with its filter). */
  skips: CampaignSkipMaps;
}) {
  const router = useRouter();
  const safeCustomers = customers ?? [];
  const isD2C = viewMode === "d2c";
  const hasSelection = !!selectedIds && !!onToggleSelect && !!onToggleAll;

  function getRowId(c: Customer | D2CCustomer): string {
    return isD2C ? (c as D2CCustomer).person_key : (c as Customer).customerid;
  }

  const allSelected =
    hasSelection && safeCustomers.length > 0 && safeCustomers.every((c) => selectedIds.has(getRowId(c)));

  /** A column header. Sortable headers carry aria-sort so assistive tech
   *  announces the current sort; the whole header is a button. */
  function Th({
    label,
    column,
    align = "left",
  }: {
    label: string;
    column?: SortColumn;
    align?: Align;
  }) {
    const isSortable = !!column;
    const isActive = column && sortColumn === column;
    const ariaSort: React.AriaAttributes["aria-sort"] = isSortable
      ? isActive
        ? sortDir === "asc"
          ? "ascending"
          : "descending"
        : "none"
      : undefined;

    return (
      <th scope="col" aria-sort={ariaSort} className={`px-2 py-3 font-medium ${alignClass[align]}`}>
        {isSortable ? (
          <button
            type="button"
            onClick={() => onSort(column)}
            className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 transition ${
              align === "right" ? "flex-row-reverse" : ""
            }`}
          >
            {label}
            {isActive && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
        ) : (
          <span className="uppercase tracking-wide">{label}</span>
        )}
      </th>
    );
  }

  function RowCheckbox({ id, name }: { id: string; name: string }) {
    if (!hasSelection) return null;
    return (
      <td
        className="px-2 py-2 text-center align-middle"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selectedIds.has(id)}
          onChange={() => onToggleSelect(id)}
          aria-label={selectedIds.has(id) ? `Unselect ${name}` : `Select ${name}`}
          className="w-3.5 h-3.5 rounded border-slate-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
        />
      </td>
    );
  }

  const selectAllCheckbox = hasSelection ? (
    <th scope="col" className="px-2 py-3 text-center align-middle">
      <input
        type="checkbox"
        checked={allSelected}
        onChange={onToggleAll}
        aria-label={allSelected ? "Unselect all customers on this page" : "Select all customers on this page"}
        className="w-3.5 h-3.5 rounded border-slate-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
      />
    </th>
  ) : null;

  const tableClass = "w-full table-fixed border-collapse text-xs";
  const theadClass = "bg-slate-50/70 text-[11px] text-slate-500 border-b border-slate-200/60";
  const rowClass =
    "border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer transition";

  /* ─── D2C table ─── */
  if (isD2C) {
    const colCount = (hasSelection ? 1 : 0) + 10;
    return (
      /* md and up only — CustomerListCards takes over on phones. The columns
         still need ~860px to stay legible, so tablets scroll horizontally. */
      <div className="hidden md:block bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-x-auto">
        <table className={`min-w-[860px] ${tableClass}`}>
          <caption className="sr-only">Direct-to-consumer customers with status, state, order history and spend.</caption>
          <colgroup>
            {hasSelection && <col style={{ width: "32px" }} />}
            <col style={{ width: "24%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8.25%" }} />
            <col style={{ width: "8.25%" }} />
            <col style={{ width: "8.25%" }} />
            <col style={{ width: "8.25%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              {selectAllCheckbox}
              <Th label="Customer" column="name" />
              <Th label="Status" />
              <Th label="State" />
              <Th label="Last Order" column="last_order_date" align="center" />
              <Th label="Orders" align="right" />
              <Th label="2026" column="sales_2026" align="right" />
              <Th label="2025" column="sales_2025" align="right" />
              <Th label="2024" column="sales_2024" align="right" />
              <Th label="2023" column="sales_2023" align="right" />
              <Th label="Revenue" align="right" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colCount} className="py-6 text-center text-sm text-slate-400">
                  Loading customers…
                </td>
              </tr>
            )}

            {!loading && safeCustomers.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-sm text-slate-400">
                  No customers match your filters.
                </td>
              </tr>
            )}

            {!loading &&
              (safeCustomers as D2CCustomer[]).map((c) => {
                const status = getCustomerStatus(c.last_order_date, c.has_open_order);
                const isSelected = hasSelection && selectedIds.has(c.person_key);
                const href = `/customers/d2c/${encodeURIComponent(c.person_key)}`;
                return (
                  <tr
                    key={c.person_key}
                    onClick={() => router.push(href)}
                    className={`${rowClass} ${isSelected ? "bg-gray-50" : ""}`}
                  >
                    <RowCheckbox id={c.person_key} name={c.name || c.person_key} />
                    <th scope="row" className="px-2 py-2 text-left font-normal align-middle">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="block font-medium text-slate-800 truncate hover:underline focus:outline-none focus:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] text-slate-400 truncate">{c.email ?? "—"}</span>
                        <EmailChip
                          flag={customerEmailFlag(suppression, "d2c", c.person_key, c.email)}
                          quality={quality}
                          skips={skips}
                          customerRef={c.person_key}
                        />
                      </div>
                    </th>
                    <td className="px-2 py-2 align-middle">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-middle">{c.bill_to_state ?? "—"}</td>
                    <td className="px-2 py-2 text-center align-middle">{formatDate(c.last_order_date)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-middle">{c.lifetime_orders}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2026)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2025)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2024)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2023)}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums align-middle">{formatMoney(c.lifetime_revenue)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    );
  }

  /* ─── Wholesale table ─── */
  const colCount = (hasSelection ? 1 : 0) + 10;
  return (
    <div className="hidden md:block bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-x-auto">
      <table className={`min-w-[940px] ${tableClass}`}>
        <caption className="sr-only">Wholesale accounts with agency, status, state, order history and spend by year.</caption>
        <colgroup>
          {hasSelection && <col style={{ width: "32px" }} />}
          <col style={{ width: "23%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
        </colgroup>
        <thead className={theadClass}>
          <tr>
            {selectAllCheckbox}
            <Th label="Customer" column="name" />
            <Th label="Agency" />
            <Th label="Status" />
            <Th label="State" />
            <Th label="Last Order" column="last_order_date" align="center" />
            <Th label="Last $" column="last_order_amount" align="right" />
            <Th label="2026" column="sales_2026" align="right" />
            <Th label="2025" column="sales_2025" align="right" />
            <Th label="2024" column="sales_2024" align="right" />
            <Th label="2023" column="sales_2023" align="right" />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colCount} className="py-6 text-center text-sm text-slate-400">
                Loading customers…
              </td>
            </tr>
          )}

          {!loading && safeCustomers.length === 0 && (
            <tr>
              <td colSpan={colCount} className="py-8 text-center text-sm text-slate-400">
                No customers match your filters.
              </td>
            </tr>
          )}

          {!loading &&
            (safeCustomers as Customer[]).map((c) => {
              const status = getCustomerStatus(c.last_order_date, c.has_open_order);
              const isSelected = hasSelection && selectedIds.has(c.customerid);
              const href = `/customers/${encodeURIComponent(c.customerid)}`;
              return (
                <tr
                  key={c.customerid}
                  onClick={() => router.push(href)}
                  className={`${rowClass} ${isSelected ? "bg-gray-50" : ""}`}
                >
                  <RowCheckbox id={c.customerid} name={c.name || c.customerid} />
                  <th scope="row" className="px-2 py-2 text-left font-normal align-middle">
                    <div className="text-xs text-slate-400">{c.customerid}</div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-800 truncate hover:underline focus:outline-none focus:underline"
                      >
                        {c.name}
                      </Link>
                      <EmailChip
                        flag={customerEmailFlag(suppression, "wholesale", c.customerid)}
                        quality={quality}
                        skips={skips}
                        customerRef={c.customerid}
                      />
                    </div>
                  </th>
                  <td className="px-2 py-2 align-middle">
                    {c.agency_code ? (
                      <div>
                        <div className="text-xs font-medium text-slate-700">{c.agency_code}</div>
                        {c.rep_name && c.rep_name !== "NOT REP ASSIGNED" && (
                          <div className="text-[10px] text-slate-400 truncate">{c.rep_name}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle">{c.bill_to_state ?? "—"}</td>
                  <td className="px-2 py-2 text-center align-middle">{formatDate(c.last_order_date)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums align-middle">{formatMoney(c.last_order_amount)}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2026)}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2025)}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2024)}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-middle">{formatMoney(c.sales_2023)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
