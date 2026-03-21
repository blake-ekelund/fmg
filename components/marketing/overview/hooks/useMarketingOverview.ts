// /marketing/hooks/useMarketingOverview.ts
"use client";

import { useEffect, useState } from "react";
import { useBrand } from "@/components/BrandContext";

type ShopifyOverview = {
  current: {
    sessions: number;
    orders: number;
    revenue: number;
    aov: number;
    conversion: number;
  };
  delta: {
    sessions: number | null;
    orders: number | null;
    revenue: number | null;
    aov: number | null;
    conversion: number | null;
  };
};

type ContentItem = {
  id: string; // ✅ add this
  publish_date: string;
  platform: string;
  content_type: string;
  description: string;
  status: string;
};

export function useMarketingOverview() {
  const { brand } = useBrand();
  const [shopify, setShopify] = useState<ShopifyOverview | null>(null);
  const [upcomingContent, setUpcomingContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const params = brand !== "all" ? `?brand=${brand}` : "";
    fetch(`/api/marketing/overview${params}`)
      .then((r) => r.json())
      .then((json) => {
        setShopify(json.shopify ?? null);
        setUpcomingContent(json.upcomingContent ?? []);
      })
      .finally(() => setLoading(false));
  }, [brand]);

  return {
    shopify,
    upcomingContent,
    loading,
  };
}
