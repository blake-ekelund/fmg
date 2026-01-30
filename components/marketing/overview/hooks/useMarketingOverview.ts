// /marketing/hooks/useMarketingOverview.ts
"use client";

import { useEffect, useState } from "react";

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
  const [shopify, setShopify] = useState<ShopifyOverview | null>(null);
  const [upcomingContent, setUpcomingContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    fetch("/api/marketing/overview")
      .then((r) => r.json())
      .then((json) => {
        setShopify(json.shopify ?? null);
        setUpcomingContent(json.upcomingContent ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    shopify,
    upcomingContent,
    loading,
  };
}
