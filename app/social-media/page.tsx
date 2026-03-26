"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import SocialKanbanBoard from "@/components/social-media/SocialKanbanBoard";
import SocialPostModal from "@/components/social-media/SocialPostModal";
import type { SocialPost, SocialPostStatus, SocialPlatform } from "@/components/social-media/types";

const PLATFORMS: { value: SocialPlatform | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
  { value: "TikTok", label: "TikTok" },
];

export default function SocialMediaPage() {
  const { brand } = useBrand();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editPost, setEditPost] = useState<SocialPost | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /* ── Load ───────────────────────────────── */
  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("social_media_posts")
      .select("*")
      .neq("status", "published")
      .order("created_at", { ascending: false });
    if (data) setPosts(data as SocialPost[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  /* ── Filter ─────────────────────────────── */
  const visible = useMemo(() => {
    let f = posts;
    if (brand !== "all") f = f.filter((p) => p.brand === brand);
    if (platform !== "all") f = f.filter((p) => p.platform === platform);
    return f;
  }, [posts, brand, platform]);

  /* ── Drag & drop ────────────────────────── */
  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  }
  function handleDragEnd() { setDraggingId(null); }

  async function handleDrop(newStatus: SocialPostStatus) {
    if (!draggingId) return;
    const prev = [...posts];
    setPosts((old) => old.map((p) => p.id === draggingId ? { ...p, status: newStatus } : p));
    setDraggingId(null);

    const { error } = await supabase
      .from("social_media_posts")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", draggingId);

    if (error) {
      setPosts(prev);
      loadPosts();
    }
  }

  /* ── Modal ──────────────────────────────── */
  function openNew() { setEditPost(null); setModalOpen(true); }
  function openEdit(post: SocialPost) { setEditPost(post); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditPost(null); }
  function onSaved() { loadPosts(); closeModal(); }
  function onDeleted() { loadPosts(); }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Social Media</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage, review, and publish social posts.</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition"
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Platform filter */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {PLATFORMS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPlatform(p.value)}
            className={clsx(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              platform === p.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          Loading…
        </div>
      ) : (
        <SocialKanbanBoard
          posts={visible}
          draggingId={draggingId}
          onCardClick={openEdit}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <SocialPostModal
          post={editPost}
          defaultPlatform={platform === "all" ? "Instagram" : platform}
          onClose={closeModal}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
