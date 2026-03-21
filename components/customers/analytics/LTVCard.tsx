"use client";

import type { Customer } from "../types";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function LTVCard({ customer }: { customer: Customer }) {
  const salesByYear = [
    { year: 2023, amount: customer.sales_2023 ?? 0 },
    { year: 2024, amount: customer.sales_2024 ?? 0 },
    { year: 2025, amount: customer.sales_2025 ?? 0 },
    { year: 2026, amount: customer.sales_2026 ?? 0 },
  ];

  const activeYears = salesByYear.filter((y) => y.amount > 0);
  const yearsActive = activeYears.length || 1;

  const totalSpend =
    customer.total_spend ??
    salesByYear.reduce((sum, y) => sum + y.amount, 0);

  const avgAnnualSpend = totalSpend / yearsActive;

  // Estimate expected relationship years based on activity
  const expectedYears = Math.max(yearsActive, 3);
  const estimatedLTV = avgAnnualSpend * expectedYears;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
        Lifetime Value Estimate
      </h3>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Avg Annual Spend
          </div>
          <div className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">
            {formatMoney(avgAnnualSpend)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Years Active
          </div>
          <div className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">
            {yearsActive}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Est. LTV
          </div>
          <div className="text-sm font-semibold text-emerald-700 tabular-nums mt-0.5">
            {formatMoney(estimatedLTV)}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-400">
        Based on {formatMoney(avgAnnualSpend)}/yr x {expectedYears} expected years
      </div>
    </div>
  );
}
