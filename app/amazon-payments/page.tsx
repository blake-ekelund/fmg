"use client";

import { Construction } from "lucide-react";
import PageMeta from "@/components/PageMeta";

export default function AmazonPaymentsPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
      <PageMeta
        title="Amazon Payments"
        description="Amazon settlement payouts per period (coming soon)."
      />

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
