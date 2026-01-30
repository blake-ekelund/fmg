// /shopify/page.tsx
"use client";

import { useState } from "react";
import { useShopifyData } from "./hooks/useShopifyData";
import { ShopifyUploadButton } from "./components/ShopifyUploadButton";
import { ShopifyFiltersBar } from "./components/ShopifyFiltersBar";
import { ShopifyEmptyState } from "./components/ShopifyEmptyState";
import { ShopifyMetrics } from "./components/ShopifyMetrics";
import { ShopifyDateRange } from "./types";

export default function ShopifyPage() {
  const [range, setRange] =
    useState<ShopifyDateRange>("current_month");

  const { data, status } = useShopifyData({ range });

  return (
    <div className="space-y-8">
      {/* Top control bar */}
      <div className="flex items-center justify-between gap-4">
        <ShopifyFiltersBar range={range} onChange={setRange} />
        <ShopifyUploadButton status={status} />
      </div>

      {/* Content */}
      {data === null && <ShopifyEmptyState />}
      {data && <ShopifyMetrics data={data} />}
    </div>
  );
}
