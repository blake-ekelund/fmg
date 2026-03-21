"use client";

import { useRouter } from "next/navigation";
import { Customer } from "./types";

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function getCustomerStatus(lastOrderDate: string | null) {
  if (!lastOrderDate) {
    return {
      label: "No Orders",
      color: "bg-slate-100 text-slate-600",
    };
  }

  const now = new Date();
  const last = new Date(lastOrderDate);
  const diffDays =
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= 180)
    return { label: "Active", color: "bg-emerald-50 text-emerald-700" };

  if (diffDays <= 365)
    return { label: "At Risk", color: "bg-amber-50 text-amber-700" };

  return { label: "Churned", color: "bg-rose-50 text-rose-700" };
}

type SortColumn =
  | "name"
  | "last_order_date"
  | "last_order_amount"
  | "sales_2026"
  | "sales_2025"
  | "sales_2024"
  | "sales_2023";

export default function CustomersTable({
  customers = [],
  loading,
  sortColumn,
  sortDir,
  onSort,
}: {
  customers?: Customer[];
  loading: boolean;
  sortColumn: SortColumn;
  sortDir: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const router = useRouter();
  const safeCustomers = customers ?? [];

  function HeaderCell({
    label,
    column,
    align = "left",
  }: {
    label: string;
    column?: SortColumn;
    align?: "left" | "center" | "right";
  }) {
    const isSortable = !!column;
    const isActive = column && sortColumn === column;

    return (
      <div
        className={`flex items-center gap-1 ${
          align === "right"
            ? "justify-end"
            : align === "center"
            ? "justify-center"
            : "justify-start"
        }`}
      >
        {isSortable ? (
          <button
            onClick={() => column && onSort(column)}
            className="flex items-center gap-1 hover:text-slate-900 transition"
          >
            {label}
            {isActive && (
              <span className="text-[10px]">
                {sortDir === "asc" ? "▲" : "▼"}
              </span>
            )}
          </button>
        ) : (
          <span>{label}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="grid grid-cols-12 px-2 py-3 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/70 border-b border-slate-200/60">
        <div className="col-span-3">
          <HeaderCell label="Customer" column="name" />
        </div>

        <HeaderCell label="Status" />
        <HeaderCell label="Channel" />
        <HeaderCell label="State" />

        <HeaderCell
          label="Last Order"
          column="last_order_date"
          align="center"
        />

        <HeaderCell
          label="Last $"
          column="last_order_amount"
          align="right"
        />

        <HeaderCell
          label="2026"
          column="sales_2026"
          align="right"
        />

        <HeaderCell
          label="2025"
          column="sales_2025"
          align="right"
        />

        <HeaderCell
          label="2024"
          column="sales_2024"
          align="right"
        />

        <HeaderCell
          label="2023"
          column="sales_2023"
          align="right"
        />
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-slate-400">
          Loading customers...
        </div>
      )}

      {!loading && safeCustomers.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
          No customers match your filters.
        </div>
      )}

      {!loading &&
        safeCustomers.map((c) => {
          const status = getCustomerStatus(c.last_order_date);

          return (
            <div
              key={c.customerid}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/customers/${encodeURIComponent(c.customerid)}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  router.push(`/customers/${encodeURIComponent(c.customerid)}`);
                }
              }}
              className="grid grid-cols-12 px-2 py-2 text-xs items-center border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer transition focus:outline-none focus:bg-slate-50"
            >
              <div className="col-span-3">
                <div className="text-xs text-slate-400">
                  {c.customerid}
                </div>
                <div className="font-medium text-slate-800">
                  {c.name}
                </div>
              </div>

              <div>
                <span
                  className={`px-2 py-1 rounded-full text-[11px] font-medium ${status.color}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="text-xs">
                {c.channel}
              </div>

              <div className="text-xs">
                {c.bill_to_state ?? "—"}
              </div>

              <div className="text-xs text-center">
                {formatDate(c.last_order_date)}
              </div>

              <div className="text-xs font-medium text-right">
                {formatMoney(c.last_order_amount)}
              </div>

              <div className="text-xs text-right">
                {formatMoney(c.sales_2026)}
              </div>

              <div className="text-xs text-right">
                {formatMoney(c.sales_2025)}
              </div>

              <div className="text-xs text-right">
                {formatMoney(c.sales_2024)}
              </div>

              <div className="text-xs text-right">
                {formatMoney(c.sales_2023)}
              </div>
            </div>
          );
        })}
    </div>
  );
}