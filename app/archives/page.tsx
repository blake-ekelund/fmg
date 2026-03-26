"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Hash, Eye, Search, Calendar } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import BlogPostModal from "@/components/blog-posts/BlogPostModal";
import type { BlogPost } from "@/components/blog-posts/types";

/* ─── Types ─── */
type SocialPost = {
  id: string;
  brand: "NI" | "Sassy";
  platform: string;
  post_date: string;
  caption: string | null;
  image_url: string | null;
  status: string;
  post_type: string;
  created_at: string;
  updated_at: string;
};

type ContentType = "all" | "blog" | "social";

/* ─── Helpers ─── */
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PLATFORM_STYLE: Record<string, string> = {
  Instagram: "bg-fuchsia-50 text-fuchsia-600",
  Facebook: "bg-blue-50 text-blue-600",
  TikTok: "bg-gray-100 text-gray-700",
};

export default function ArchivesPage() {
  const { brand } = useBrand();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentType, setContentType] = useState<ContentType>("all");
  const [search, setSearch] = useState("");

  // Blog modal
  const [blogModalOpen, setBlogModalOpen] = useState(false);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);

  // Social detail
  const [selectedSocial, setSelectedSocial] = useState<SocialPost | null>(null);

  /* ─── Load ─── */
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: blogs }, { data: socials }] = await Promise.all([
      supabase
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("updated_at", { ascending: false }),
      supabase
        .from("social_media_posts")
        .select("*")
        .eq("status", "published")
        .order("updated_at", { ascending: false }),
    ]);
    setBlogPosts((blogs as BlogPost[]) ?? []);
    setSocialPosts((socials as SocialPost[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ─── Filter ─── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    let blogs = blogPosts;
    let socials = socialPosts;

    if (brand !== "all") {
      blogs = blogs.filter((p) => p.brand === brand);
      socials = socials.filter((p) => p.brand === brand);
    }

    if (q) {
      blogs = blogs.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
      socials = socials.filter(
        (p) =>
          (p.caption ?? "").toLowerCase().includes(q) ||
          p.platform.toLowerCase().includes(q)
      );
    }

    type ArchiveItem =
      | { type: "blog"; item: BlogPost; date: string }
      | { type: "social"; item: SocialPost; date: string };

    const items: ArchiveItem[] = [];

    if (contentType !== "social") {
      blogs.forEach((b) => items.push({ type: "blog", item: b, date: b.updated_at }));
    }
    if (contentType !== "blog") {
      socials.forEach((s) => items.push({ type: "social", item: s, date: s.updated_at }));
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [blogPosts, socialPosts, brand, contentType, search]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Archives</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Published blog posts and social media content for reference.
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Content type toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { value: "all", label: "All" },
            { value: "blog", label: "Blog Posts" },
            { value: "social", label: "Social Media" },
          ] as { value: ContentType; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setContentType(opt.value)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                contentType === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, caption, tag..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* Count */}
        <span className="text-xs text-gray-400 tabular-nums ml-auto">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <FileText size={20} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No published content yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Mark blog posts or social posts as &quot;Published&quot; from the Ready column.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            if (entry.type === "blog") {
              const post = entry.item;
              return (
                <button
                  key={`blog-${post.id}`}
                  onClick={() => { setSelectedBlog(post); setBlogModalOpen(true); }}
                  className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <FileText size={15} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-gray-800 truncate">{post.title}</h3>
                      <span className={clsx(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                        post.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                      )}>
                        {post.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-400">Blog Post</span>
                      {(post.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 shrink-0">
                    <Calendar size={11} />
                    {formatDate(post.updated_at)}
                  </div>
                  <Eye size={14} className="text-gray-300 group-hover:text-gray-500 transition shrink-0" />
                </button>
              );
            } else {
              const post = entry.item;
              return (
                <button
                  key={`social-${post.id}`}
                  onClick={() => setSelectedSocial(selectedSocial?.id === post.id ? null : post)}
                  className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-fuchsia-50 flex items-center justify-center shrink-0">
                    <Hash size={15} className="text-fuchsia-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {post.caption ? (post.caption.length > 80 ? post.caption.slice(0, 80) + "…" : post.caption) : "(No caption)"}
                      </p>
                      <span className={clsx(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                        post.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                      )}>
                        {post.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded", PLATFORM_STYLE[post.platform] ?? "bg-gray-50 text-gray-500")}>
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-gray-400">{post.post_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 shrink-0">
                    <Calendar size={11} />
                    {formatDate(post.updated_at)}
                  </div>
                  <Eye size={14} className="text-gray-300 group-hover:text-gray-500 transition shrink-0" />
                </button>
              );
            }
          })}
        </div>
      )}

      {/* Social detail expand */}
      {selectedSocial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSocial(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className={clsx(
                "text-xs font-semibold px-2 py-0.5 rounded",
                selectedSocial.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
              )}>
                {selectedSocial.brand}
              </span>
              <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded", PLATFORM_STYLE[selectedSocial.platform] ?? "bg-gray-50 text-gray-500")}>
                {selectedSocial.platform}
              </span>
              <span className="text-xs text-gray-400">{selectedSocial.post_type}</span>
              <span className="text-xs text-gray-400 ml-auto">{formatDate(selectedSocial.updated_at)}</span>
            </div>
            {selectedSocial.image_url && (
              <img src={selectedSocial.image_url} alt="" className="w-full rounded-xl mb-4 max-h-80 object-cover border border-gray-200" />
            )}
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {selectedSocial.caption || "(No caption)"}
            </div>
            <button
              onClick={() => setSelectedSocial(null)}
              className="mt-5 w-full py-2 rounded-lg bg-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Blog detail modal (reuses existing modal in preview mode) */}
      <BlogPostModal
        open={blogModalOpen}
        post={selectedBlog}
        onClose={() => { setBlogModalOpen(false); setSelectedBlog(null); }}
        onSaved={load}
        onDeleted={load}
      />
    </div>
  );
}
