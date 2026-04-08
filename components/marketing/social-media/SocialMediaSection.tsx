"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import type { Database } from "@/types/supabase";

import FeedGrid from "./FeedGrid";
import PostEditor from "./PostEditor";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

export type SocialPlatform = "Instagram" | "Facebook";

export type SocialPost =
  Database["public"]["Tables"]["social_media_posts"]["Row"];

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
];

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function SocialMediaSection() {
  const { brand } = useBrand();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<SocialPlatform>("Instagram");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);

  /* ── Load posts ──────────────────────────────────────── */

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("social_media_posts")
      .select("*")
      .order("post_date", { ascending: false });

    if (data) setPosts(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /* ── Filter by brand + platform ──────────────────────── */

  const visible = useMemo(() => {
    let filtered = posts.filter((p) => p.platform === platform);
    if (brand !== "all") {
      filtered = filtered.filter((p) => p.brand === brand);
    }
    return filtered;
  }, [posts, platform, brand]);

  /* ── Handlers ────────────────────────────────────────── */

  function openNew() {
    setEditingPost(null);
    setEditorOpen(true);
  }

  function openEdit(post: SocialPost) {
    setEditingPost(post);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingPost(null);
  }

  function onSaved() {
    load();
    closeEditor();
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <section className="rounded-2xl border border-gray-200 bg-white space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Social Media</h2>

        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition"
        >
          <Plus size={14} />
          New Post
        </button>
      </div>

      {/* Platform tabs */}
      <nav className="flex gap-1">
        {PLATFORMS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setPlatform(tab.value)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              platform === tab.value
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Feed */}
      {loading ? (
        <div className="py-20 text-center text-sm text-gray-400">
          Loading...
        </div>
      ) : (
        <FeedGrid
          posts={visible}
          platform={platform}
          onSelect={openEdit}
        />
      )}

      {/* Editor modal */}
      {editorOpen && (
        <PostEditor
          post={editingPost}
          defaultPlatform={platform}
          onClose={closeEditor}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
