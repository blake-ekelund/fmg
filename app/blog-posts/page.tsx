"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import KanbanBoard from "@/components/blog-posts/KanbanBoard";
import BlogPostModal from "@/components/blog-posts/BlogPostModal";
import type { BlogPost, BlogPostStatus } from "@/components/blog-posts/types";

export default function BlogPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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

    // Don't do anything if dropped in same column
    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost || currentPost.status === newStatus) return;

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
    );

    // Persist
    const { error } = await supabase
      .from("blog_posts")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", postId);

    if (error) {
      console.error("Failed to update status:", error);
      loadPosts(); // rollback on failure
    }
  }

  /* ─── Card click ─── */
  function handleCardClick(post: BlogPost) {
    setEditPost(post);
    setModalOpen(true);
  }

  /* ─── New post ─── */
  function handleNewPost() {
    setEditPost(null);
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
          onClick={handleNewPost}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
        >
          <Plus size={16} />
          New Post
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

      {/* Modal */}
      <BlogPostModal
        open={modalOpen}
        post={editPost}
        onClose={() => setModalOpen(false)}
        onSaved={loadPosts}
        onDeleted={loadPosts}
      />
    </div>
  );
}
