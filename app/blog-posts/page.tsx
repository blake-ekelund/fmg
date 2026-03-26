"use client";

import { useState, useCallback, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import KanbanBoard from "@/components/blog-posts/KanbanBoard";
import BlogPostModal from "@/components/blog-posts/BlogPostModal";
import GeneratePostModal from "@/components/blog-posts/GeneratePostModal";
import type { BlogPost, BlogPostStatus } from "@/components/blog-posts/types";

export default function BlogPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editPost, setEditPost] = useState<BlogPost | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /* ─── Load posts ─── */
  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    setPosts((data as BlogPost[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  /* ─── Drag handlers ─── */
  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  async function handleDrop(newStatus: BlogPostStatus) {
    if (!draggingId) return;

    const postId = draggingId;
    setDraggingId(null);

    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost || currentPost.status === newStatus) return;

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
    );

    const { error } = await supabase
      .from("blog_posts")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", postId);

    if (error) {
      console.error("Failed to update status:", error);
      loadPosts();
    }
  }

  /* ─── Card click ─── */
  function handleCardClick(post: BlogPost) {
    setEditPost(post);
    setModalOpen(true);
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog Posts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review AI-generated posts and prepare them for Shopify.
          </p>
        </div>

        <button
          onClick={() => setGenerateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition shadow-sm"
        >
          <Sparkles size={16} />
          Generate with AI
        </button>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          Loading posts…
        </div>
      ) : (
        <KanbanBoard
          posts={posts}
          draggingId={draggingId}
          onCardClick={handleCardClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        />
      )}

      {/* Edit modal (click into existing post) */}
      <BlogPostModal
        open={modalOpen}
        post={editPost}
        onClose={() => setModalOpen(false)}
        onSaved={loadPosts}
        onDeleted={loadPosts}
      />

      {/* Generate with AI modal */}
      <GeneratePostModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={loadPosts}
      />
    </div>
  );
}
