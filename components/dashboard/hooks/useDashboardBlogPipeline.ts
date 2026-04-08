"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type BlogPipelineCounts = {
  ai_draft: number;
  human_review: number;
  ready: number;
};

export function useDashboardBlogPipeline(brand: BrandFilter) {
  const [counts, setCounts] = useState<BlogPipelineCounts>({ ai_draft: 0, human_review: 0, ready: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("blog_posts")
        .select("status")
        .not("status", "in", '("published","deleted","generating")');

      if (brand !== "all") {
        q = q.eq("brand", brand);
      }

      const { data } = await q;
      const rows = (data as { status: string }[]) ?? [];

      const c: BlogPipelineCounts = { ai_draft: 0, human_review: 0, ready: 0 };
      for (const r of rows) {
        if (r.status in c) c[r.status as keyof BlogPipelineCounts]++;
      }

      setCounts(c);
      setLoading(false);
    })();
  }, [brand]);

  return { counts, loading };
}
