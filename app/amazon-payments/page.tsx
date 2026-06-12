"use client";

import { ShoppingBag, Construction } from "lucide-react";

export default function AmazonPaymentsPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <ShoppingBag size={18} className="text-gray-900" />
        <h1 className="text-xl font-semibold text-gray-900">Amazon Payments</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white py-16 px-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-gray-500 mb-4">
          <Construction size={20} />
        </div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
          Coming soon
        </h2>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          This page will track Amazon settlement payouts (gross sales, fees,
          refunds, and net payout) per settlement period. Spec to be defined.
        </p>
      </div>
    </div>
  );
}
