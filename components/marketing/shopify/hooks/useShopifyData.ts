// /shopify/hooks/useShopifyData.ts
"use client";

import { useEffect, useState } from "react";
import { ShopifyDateRange } from "../types";

export function useShopifyData({
  range,
}: {
  range: ShopifyDateRange;
}) {
  const [data, setData] = useState<any | null>(null);
  const [status, setStatus] = useState<{
    lastDay: string | null;
    nextRequiredDay: string | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/marketing/shopify?range=${range}`).then((r) =>
        r.json()
      ),
      fetch("/api/marketing/status").then((r) => r.json()),
    ]).then(([metrics, status]) => {
      setData(metrics.data ?? null);
      setStatus(status);
    });
  }, [range]);

  return { data, status };
}
