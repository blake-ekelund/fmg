"use client";

import { useState, useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { BlogPost, BlogPostStatus } from "./types";
import { COLUMNS } from "./types";

type Props = {
  open: boolean;
  post: BlogPost | null; // null = create new
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

const BRANDS = ["NI", "Sassy"] as const;

export default function BlogPostModal({ open, post, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [seoMeta, setSeoMeta] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [status, setStatus] = useState<BlogPostStatus>("ai_draft");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Populate form when editing
  useEffect(() => {
    if (open && post) {
      setTitle(post.title);
      setBody(post.body);
      setSeoMeta(post.seo_meta ?? "");
      setTags(post.tags ?? []);
      setBrand(post.brand);
      setStatus(post.status);
    } else if (open) {
      setTitle("");
      setBody("");
      setSeoMeta("");
      setTags([]);
      setTagInput("");
      setBrand("NI");
      setStatus("ai_draft");
    }
    setShowDeleteConfirm(false);
    // Focus title on open
    if (open) setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, post]);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);

    const payload = {
      title: title.trim(),
      body,
      seo_meta: seoMeta || null,
      tags: tags.length > 0 ? tags : null,
      brand,
      status,
      updated_at: new Date().toISOString(),
    };

    if (post) {
      await supabase.from("blog_posts").update(payload).eq("id", post.id);
    } else {
      await supabase.from("blog_posts").insert(payload);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!post) return;
    setDeleting(true);
    await supabase.from("blog_posts").delete().eq("id", post.id);
    setDeleting(false);
    onDeleted?.();
    onClose();
  }

  function addTag(e: React.KeyboardEvent) {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const tag = tagInput.trim();
      if (!tags.includes(tag)) setTags([...tags, tag]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function moveToStatus(newStatus: BlogPostStatus) {
    setStatus(newStatus);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {post ? "Edit Post" : "New Post"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Title</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Blog post title…"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition"
            />
          </div>

          {/* Brand + Status row */}
          <div className="flex gap-4">
            {/* Brand */}
            <div className="flex-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Brand</label>
              <div className="flex gap-1 mt-1">
                {BRANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBrand(b)}
                    className={clsx(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition",
                      brand === b
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="flex-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {COLUMNS.map((col) => (
                  <button
                    key={col.status}
                    onClick={() => moveToStatus(col.status)}
                    className={clsx(
                      "px-2 py-1.5 rounded-md text-[11px] font-medium transition",
                      status === col.status
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your blog post content…"
              rows={12}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition resize-y"
            />
          </div>

          {/* SEO Meta */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">SEO Meta Description</label>
              <span className={clsx(
                "text-[10px] tabular-nums",
                seoMeta.length > 155 ? "text-red-500" : "text-gray-400"
              )}>
                {seoMeta.length}/155
              </span>
            </div>
            <textarea
              value={seoMeta}
              onChange={(e) => setSeoMeta(e.target.value)}
              placeholder="Brief description for search engines…"
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Tags</label>
            <div className="mt-1 flex flex-wrap gap-1.5 items-center rounded-lg border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:border-gray-300 transition">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-md px-2 py-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-600">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                placeholder={tags.length === 0 ? "Type a tag and press Enter…" : "Add tag…"}
                className="flex-1 min-w-[100px] text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div>
            {post && !showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
            {post && showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete this post?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Contextual action buttons */}
            {post && status === "ai_draft" && (
              <button
                onClick={() => { moveToStatus("review"); setTimeout(handleSave, 0); }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition"
              >
                Move to Review
              </button>
            )}
            {post && status === "review" && (
              <>
                <button
                  onClick={() => { moveToStatus("changes_needed"); setTimeout(handleSave, 0); }}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition"
                >
                  Needs Changes
                </button>
                <button
                  onClick={() => { moveToStatus("ready"); setTimeout(handleSave, 0); }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition"
                >
                  Mark Ready
                </button>
              </>
            )}
            {post && status === "changes_needed" && (
              <button
                onClick={() => { moveToStatus("review"); setTimeout(handleSave, 0); }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition"
              >
                Back to Review
              </button>
            )}
            {post && status === "ready" && (
              <button
                onClick={() => { moveToStatus("review"); setTimeout(handleSave, 0); }}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition"
              >
                Send Back
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              {saving ? "Saving…" : post ? "Save Changes" : "Create Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
