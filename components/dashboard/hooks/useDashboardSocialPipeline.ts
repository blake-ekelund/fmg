"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type SocialPipelineCounts = {
  ai_draft: number;
  human_review: number;
  ready: number;
};

export function useDashboardSocialPipeline(brand: BrandFilter) {
  const [counts, setCounts] = useState<SocialPipelineCounts>({ ai_draft: 0, human_review: 0, ready: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("social_media_posts")
        .select("status")
        .not("status", "in", '("published","generating")');

      if (brand !== "all") {
        q = q.eq("brand", brand);
      }

      const { data } = await q;
      const rows = (data as { status: string }[]) ?? [];

      const c: SocialPipelineCounts = { ai_draft: 0, human_review: 0, ready: 0 };
      for (const r of rows) {
        if (r.status in c) c[r.status as keyof SocialPipelineCounts]++;
      }

      setCounts(c);
      setLoading(false);
    })();
  }, [brand]);

  return { counts, loading };
}
