"use client";

import { useState, useCallback, useEffect } from "react";
import { Sparkles, Mail, X, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import KanbanBoard from "@/components/blog-posts/KanbanBoard";
import BlogPostModal from "@/components/blog-posts/BlogPostModal";
import GeneratePostModal from "@/components/blog-posts/GeneratePostModal";
import DeleteFeedbackModal from "@/components/blog-posts/DeleteFeedbackModal";
import type { BlogPost, BlogPostStatus } from "@/components/blog-posts/types";

export default function BlogPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editPost, setEditPost] = useState<BlogPost | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [generatingPosts, setGeneratingPosts] = useState<
    { id: string; title: string; brand: "NI" | "Sassy" }[]
  >([]);

  // Email template modals
  const [emailPost, setEmailPost] = useState<BlogPost | null>(null);
  const [reviewEmailPost, setReviewEmailPost] = useState<BlogPost | null>(null);
  // Delete feedback modal
  const [deletePost, setDeletePost] = useState<BlogPost | null>(null);

  /* ─── Load posts ─── */
  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .not("status", "in", '("published","deleted")')
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
      return;
    }

    // Show email template when moved to "human_review" or "ready"
    if (newStatus === "human_review") {
      setReviewEmailPost({ ...currentPost, status: newStatus });
      // Create task for Julie
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await supabase.from("tasks").insert({
        name: `Review Blog Post: ${currentPost.title}`,
        description: `Review AI-drafted blog post "${currentPost.title}" (${currentPost.brand}). Link: ${window.location.origin}/blog-posts?post=${currentPost.id}`,
        owner: "Julie",
        priority: "Medium",
        status: "Not Started",
        due_date: tomorrow.toISOString().split("T")[0],
        completed: false,
      });
    }
    if (newStatus === "ready") {
      setEmailPost({ ...currentPost, status: newStatus });
      // Update task owner from Julie to Brooke
      await supabase
        .from("tasks")
        .update({ owner: "Brooke", status: "Not Started", description: `Publish blog post "${currentPost.title}" (${currentPost.brand}) to Shopify. Link: ${window.location.origin}/blog-posts?post=${currentPost.id}` })
        .ilike("name", `%${currentPost.title}%`)
        .eq("owner", "Julie");
    }
  }

  /* ─── Card click ─── */
  function handleCardClick(post: BlogPost) {
    setEditPost(post);
    setModalOpen(true);
  }

  /* ─── AI Generation ─── */
  function handleGenerateSubmitted(info: { id: string; title: string; brand: "NI" | "Sassy" }) {
    setGeneratingPosts((prev) => [...prev, info]);
  }

  function handleGenerateComplete(placeholderId: string) {
    setGeneratingPosts((prev) => prev.filter((p) => p.id !== placeholderId));
    loadPosts();
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
          generatingPosts={generatingPosts}
        />
      )}

      {/* Edit modal */}
      <BlogPostModal
        open={modalOpen}
        post={editPost}
        onClose={() => setModalOpen(false)}
        onSaved={loadPosts}
        onDeleted={() => {
          // Close edit modal, open delete feedback modal
          setDeletePost(editPost);
          setModalOpen(false);
        }}
      />

      {/* Generate with AI modal */}
      <GeneratePostModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={handleGenerateComplete}
        onSubmitted={handleGenerateSubmitted}
      />

      {/* Email template modal — shown when post moves to Human Review */}
      {reviewEmailPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setReviewEmailPost(null)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                  <Mail size={16} className="text-sky-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Ready for Review</h3>
                  <p className="text-[11px] text-gray-500">Notify Julie for human review</p>
                </div>
              </div>
              <button
                onClick={() => setReviewEmailPost(null)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 w-12">To</span>
                <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  jekelund@fragrancemarketinggroup.com
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 w-12">Subject</span>
                <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Blog Post Ready for Review — {reviewEmailPost.title}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Message</span>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 leading-relaxed space-y-3">
                  <p>Julie,</p>
                  <p>
                    A new blog post has been drafted and is ready for your review. Please click the link below to review, then move to Ready when satisfied.
                  </p>
                  <a
                    href={`${window.location.origin}/blog-posts?post=${reviewEmailPost.id}`}
                    className="block rounded-lg bg-white border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-sky-50 flex items-center justify-center shrink-0">
                        <Mail size={14} className="text-sky-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{reviewEmailPost.title}</div>
                        <div className="text-[10px] text-gray-400">{reviewEmailPost.brand} • Click to review</div>
                      </div>
                    </div>
                  </a>
                  <p className="text-gray-500">Thanks!</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => setReviewEmailPost(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => setReviewEmailPost(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
              >
                <Send size={13} />
                Send Email
              </button>
            </div>
          </div>
        </div>
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
                  <p className="text-[11px] text-gray-500">Send notification to Brooke</p>
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
                  brooke.be.design@gmail.com
                </div>
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 w-12">Subject</span>
                <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Blog Post Ready for Shopify — {emailPost.title}
                </div>
              </div>

              {/* Body */}
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Message</span>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 leading-relaxed space-y-3">
                  <p>Hi Brooke,</p>
                  <p>
                    Please find the attached document ready for publish on Shopify.
                  </p>
                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-orange-50 flex items-center justify-center shrink-0">
                        <Mail size={14} className="text-orange-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{emailPost.title}</div>
                        <div className="text-[10px] text-gray-400">{emailPost.brand} • Blog Post</div>
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
                onClick={() => {
                  // For now just close — in future this would actually send
                  setEmailPost(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
              >
                <Send size={13} />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete feedback modal */}
      <DeleteFeedbackModal
        open={!!deletePost}
        postId={deletePost?.id ?? ""}
        postTitle={deletePost?.title ?? ""}
        contentType="blog"
        onClose={() => setDeletePost(null)}
        onDeleted={() => {
          setDeletePost(null);
          loadPosts();
        }}
      />
    </div>
  );
}
