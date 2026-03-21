"use client";

import clsx from "clsx";
import type { Customer } from "../types";

function scoreRecency(lastOrderDate: string | null): number {
  if (!lastOrderDate) return 1;
  const days = Math.floor(
    (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 30) return 5;
  if (days <= 90) return 4;
  if (days <= 180) return 3;
  if (days <= 365) return 2;
  return 1;
}

function scoreFrequency(totalOrders: number | null | undefined): number {
  const n = totalOrders ?? 0;
  if (n >= 20) return 5;
  if (n >= 10) return 4;
  if (n >= 5) return 3;
  if (n >= 2) return 2;
  return 1;
}

function scoreMonetary(customer: Customer): number {
  const spend =
    customer.total_spend ??
    (customer.sales_2023 ?? 0) +
      (customer.sales_2024 ?? 0) +
      (customer.sales_2025 ?? 0) +
      (customer.sales_2026 ?? 0);
  if (spend >= 50000) return 5;
  if (spend >= 20000) return 4;
  if (spend >= 5000) return 3;
  if (spend >= 1000) return 2;
  return 1;
}

function scoreColor(score: number) {
  if (score >= 4) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (score >= 3) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div
        className={clsx(
          "inline-flex items-center justify-center w-10 h-10 rounded-lg border text-lg font-bold tabular-nums",
          scoreColor(score)
        )}
      >
        {score}
      </div>
      <div className="mt-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={clsx(
              "inline-block w-1.5 h-1.5 rounded-full mx-0.5",
              i <= score ? "bg-gray-800" : "bg-gray-200"
            )}
          />
        ))}
      </div>
    </div>
  );
}

export default function RFMCard({ customer }: { customer: Customer }) {
  const recency = scoreRecency(customer.last_order_date);
  const frequency = scoreFrequency(customer.total_orders);
  const monetary = scoreMonetary(customer);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
        RFM Analysis
      </h3>
      <div className="flex items-start gap-4">
        <ScoreBadge label="Recency" score={recency} />
        <ScoreBadge label="Frequency" score={frequency} />
        <ScoreBadge label="Monetary" score={monetary} />
      </div>
    </div>
  );
}
