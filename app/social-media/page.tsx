"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Plus, Mail, X, Send, Hash, Sparkles } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";
import SocialKanbanBoard from "@/components/social-media/SocialKanbanBoard";
import SocialPostModal from "@/components/social-media/SocialPostModal";
import GenerateSocialPostModal from "@/components/social-media/GenerateSocialPostModal";
import type { SocialPost, SocialPostStatus, SocialPlatform } from "@/components/social-media/types";

const PLATFORMS: { value: SocialPlatform | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Instagram / Facebook", label: "Instagram / Facebook" },
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

  // Generate AI modal
  const [generateOpen, setGenerateOpen] = useState(false);

  // Email template modal
  const [emailPost, setEmailPost] = useState<SocialPost | null>(null);

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

  // Poll while any posts are generating
  useEffect(() => {
    const hasGenerating = posts.some((p) => p.status === ("generating" as SocialPostStatus));
    if (!hasGenerating) return;
    const interval = setInterval(loadPosts, 5000);
    return () => clearInterval(interval);
  }, [posts, loadPosts]);

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
    const currentPost = posts.find((p) => p.id === draggingId);
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
      return;
    }

    // Show email template when moved to "ready"
    if (newStatus === "ready" && currentPost) {
      setEmailPost({ ...currentPost, status: newStatus });
    }
  }

  /* ── Modal ──────────────────────────────── */
  function openNew() { setEditPost(null); setModalOpen(true); }
  function openEdit(post: SocialPost) { setEditPost(post); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditPost(null); }
  function onSaved() { loadPosts(); closeModal(); }
  function onDeleted() { loadPosts(); }

  const captionPreview = emailPost?.caption
    ? emailPost.caption.length > 100
      ? emailPost.caption.slice(0, 100) + "…"
      : emailPost.caption
    : "(No caption)";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Social Media</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage, review, and publish social posts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGenerateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-medium text-white hover:bg-fuchsia-700 transition"
          >
            <Sparkles size={14} /> Generate with AI
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition"
          >
            <Plus size={14} /> New Post
          </button>
        </div>
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

      {/* Generate AI Modal */}
      <GenerateSocialPostModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={loadPosts}
      />

      {/* Edit/New Post Modal */}
      {modalOpen && (
        <SocialPostModal
          post={editPost}
          defaultPlatform={platform === "all" ? "Instagram / Facebook" : platform}
          onClose={closeModal}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}

      {/* Email template modal — shown when post moves to Ready */}
      {emailPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEmailPost(null)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Mail size={16} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Ready for Publish</h3>
                  <p className="text-[11px] text-gray-500">Send notification to Blake</p>
                </div>
              </div>
              <button
                onClick={() => setEmailPost(null)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Email preview */}
            <div className="px-5 py-4 space-y-3">
              {/* To */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 w-12">To</span>
                <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  blake.ekelund@workchores.com
                </div>
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 w-12">Subject</span>
                <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Social Post Ready — {emailPost.platform} • {emailPost.brand}
                </div>
              </div>

              {/* Body */}
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Message</span>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 leading-relaxed space-y-3">
                  <p>Hi Blake,</p>
                  <p>
                    Please find the attached social media post ready for publish.
                  </p>
                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-fuchsia-50 flex items-center justify-center shrink-0">
                        <Hash size={14} className="text-fuchsia-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{captionPreview}</div>
                        <div className="text-[10px] text-gray-400">{emailPost.brand} • {emailPost.platform} • {emailPost.post_type}</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-500">Thanks!</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => setEmailPost(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => setEmailPost(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
              >
                <Send size={13} />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
