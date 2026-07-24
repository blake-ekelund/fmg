"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { Customer, D2CCustomer } from "./types";
import type { CustomerViewMode } from "./constants";
import {
  formatMoney,
  formatShortDate,
  getCustomerStatus,
} from "./customerDisplay";

/**
 * Phone-sized rendering of the customer list.
 *
 * The desktop view is a 13-column grid, which at 375px gives each column ~26px
 * — unreadable, and the wrapper's overflow-hidden meant it couldn't even be
 * scrolled to. Rather than shrink that further, small screens get a card per
 * customer showing only what's worth acting on: who they are, how healthy the
 * account is, and the two most recent money figures. Everything else lives on
 * the detail page, one tap away.
 */
export default function CustomerListCards({
  customers = [],
  loading,
  viewMode = "wholesale",
  selectedIds,
  onToggleSelect,
}: {
  customers?: (Customer | D2CCustomer)[];
  loading: boolean;
  viewMode?: CustomerViewMode;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const isD2C = viewMode === "d2c";
  const hasSelection = !!selectedIds && !!onToggleSelect;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[104px] rounded-xl border border-gray-200/70 bg-white/60 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 py-12 text-center">
        <div className="text-sm font-medium text-gray-600">No customers found</div>
        <p className="mt-1 text-xs text-gray-400">
          Try clearing a filter or searching for a different name.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {customers.map((c) => {
        const id = isD2C ? (c as D2CCustomer).person_key : (c as Customer).customerid;
        const href = isD2C
          ? `/customers/d2c/${encodeURIComponent(id)}`
          : `/customers/${encodeURIComponent(id)}`;
        const status = getCustomerStatus(c.last_order_date, c.has_open_order);
        const selected = hasSelection && selectedIds.has(id);

        // Secondary identifier under the name: email for D2C, the Fishbowl
        // customer id for wholesale.
        const subtitle = isD2C
          ? (c as D2CCustomer).email
          : (c as Customer).customerid;

        // Wholesale cares about the last order's value; D2C about lifetime.
        const primaryMoneyLabel = isD2C ? "Lifetime" : "Last order";
        const primaryMoney = isD2C
          ? (c as D2CCustomer).lifetime_revenue
          : (c as Customer).last_order_amount;

        const orders = isD2C
          ? (c as D2CCustomer).lifetime_orders
          : (c as Customer).total_orders;

        return (
          <li key={id}>
            <div
              className={clsx(
                "flex items-stretch rounded-xl border bg-white transition",
                selected
                  ? "border-gray-900/40 bg-gray-50 ring-1 ring-gray-900/10"
                  : "border-gray-200/70",
              )}
            >
              {hasSelection && (
                // Its own 44px-wide tap target so selecting never fights with
                // the row's navigate-on-tap.
                <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center rounded-l-xl active:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(id)}
                    aria-label={`Select ${c.name}`}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                </label>
              )}

              <button
                type="button"
                onClick={() => router.push(href)}
                className={clsx(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-r-xl px-3 py-3 text-left active:bg-gray-50",
                  !hasSelection && "rounded-l-xl",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {c.name}
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        status.color,
                      )}
                    >
                      {status.label}
                    </span>
                  </div>

                  {subtitle && (
                    <div className="mt-0.5 truncate text-[11px] text-gray-400">
                      {subtitle}
                    </div>
                  )}

                  <div className="mt-2 flex items-baseline gap-4 text-[11px] text-gray-500">
                    <span className="tabular-nums">
                      <span className="text-gray-400">{primaryMoneyLabel} </span>
                      <span className="font-medium text-gray-700">
                        {formatMoney(primaryMoney)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <span className="text-gray-400">Last </span>
                      <span className="font-medium text-gray-700">
                        {formatShortDate(c.last_order_date)}
                      </span>
                    </span>
                    {orders != null && (
                      <span className="tabular-nums">
                        <span className="text-gray-400">Orders </span>
                        <span className="font-medium text-gray-700">{orders}</span>
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight size={16} className="shrink-0 text-gray-300" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
