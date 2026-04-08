"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type PipelinePost = {
  id: string;
  title: string;
  type: "blog" | "social";
  status: string;
  platform?: string;
  brand: string;
  updated_at: string;
};

export type PipelineSummary = {
  ai_draft: number;
  human_review: number;
  ready: number;
};

export function useDashboardContentPipeline(brand: BrandFilter) {
  const [posts, setPosts] = useState<PipelinePost[]>([]);
  const [summary, setSummary] = useState<PipelineSummary>({
    ai_draft: 0,
    human_review: 0,
    ready: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Fetch blog posts in pipeline
      let blogQ = supabase
        .from("blog_posts")
        .select("id, title, status, brand, updated_at")
        .not("status", "in", '("published","deleted","generating")')
        .order("updated_at", { ascending: false });

      if (brand !== "all") {
        blogQ = blogQ.eq("brand", brand);
      }

      // Fetch social posts in pipeline
      let socialQ = supabase
        .from("social_media_posts")
        .select("id, caption, platform, status, brand, updated_at")
        .not("status", "in", '("published","generating")')
        .order("updated_at", { ascending: false });

      if (brand !== "all") {
        socialQ = socialQ.eq("brand", brand);
      }

      const [blogRes, socialRes] = await Promise.all([blogQ, socialQ]);

      if (cancelled) return;

      const blogRows = (blogRes.data ?? []) as {
        id: string;
        title: string;
        status: string;
        brand: string;
        updated_at: string;
      }[];

      const socialRows = (socialRes.data ?? []) as {
        id: string;
        caption: string | null;
        platform: string;
        status: string;
        brand: string;
        updated_at: string;
      }[];

      const mapped: PipelinePost[] = [
        ...blogRows.map((r) => ({
          id: r.id,
          title: r.title || "Untitled Blog Post",
          type: "blog" as const,
          status: r.status,
          brand: r.brand,
          updated_at: r.updated_at,
        })),
        ...socialRows.map((r) => ({
          id: r.id,
          title: r.caption
            ? r.caption.length > 60
              ? r.caption.slice(0, 60) + "…"
              : r.caption
            : "Untitled Social Post",
          type: "social" as const,
          status: r.status,
          platform: r.platform,
          brand: r.brand,
          updated_at: r.updated_at,
        })),
      ];

      // Sort: human_review first, then ai_draft, then ready — within each by updated_at desc
      const statusOrder: Record<string, number> = {
        human_review: 0,
        ai_draft: 1,
        ready: 2,
      };
      mapped.sort(
        (a, b) =>
          (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      const s: PipelineSummary = { ai_draft: 0, human_review: 0, ready: 0 };
      for (const p of mapped) {
        if (p.status in s) s[p.status as keyof PipelineSummary]++;
      }

      setPosts(mapped);
      setSummary(s);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  return { posts, summary, loading };
}
