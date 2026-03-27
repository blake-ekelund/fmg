"use client";

import { useState, useEffect, useRef } from "react";
import { X, Trash2, Eye, Pencil, Code } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import RichTextEditor from "./RichTextEditor";
import type { BlogPost, BlogPostStatus } from "./types";
import { COLUMNS } from "./types";

type Props = {
  open: boolean;
  post: BlogPost | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

const BRANDS = ["NI", "Sassy"] as const;
type ViewMode = "preview" | "edit" | "html";

export default function BlogPostModal({ open, post, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [seoMeta, setSeoMeta] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [status, setStatus] = useState<BlogPostStatus>("ai_draft");
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && post) {
      setTitle(post.title);
      setBody(post.body);
      setSeoMeta(post.seo_meta ?? "");
      setTags(post.tags ?? []);
      setBrand(post.brand);
      setStatus(post.status);
      setViewMode("preview");
    } else if (open) {
      setTitle("");
      setBody("");
      setSeoMeta("");
      setTags([]);
      setTagInput("");
      setBrand("NI");
      setStatus("ai_draft");
      setViewMode("edit");
    }
    // reset delete state handled by parent
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
      hero_image_url: post?.hero_image_url || null,
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

  // Delete is handled by parent via DeleteFeedbackModal

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

  async function quickAction(newStatus: BlogPostStatus) {
    setStatus(newStatus);
    if (!post) return;
    await supabase
      .from("blog_posts")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", post.id);
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              {post ? "Blog Post" : "New Post"}
            </h2>

            {/* Preview / Edit / HTML toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("preview")}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                  viewMode === "preview"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Eye size={12} />
                Preview
              </button>
              <button
                onClick={() => setViewMode("edit")}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                  viewMode === "edit"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={() => setViewMode("html")}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                  viewMode === "html"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Code size={12} />
                HTML
              </button>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Content area */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {viewMode === "preview" ? (
              /* ─── Preview Mode ─── */
              <div className="px-8 py-6">
                {/* Title */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={clsx(
                      "text-[10px] font-semibold px-2 py-0.5 rounded",
                      brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                    )}>
                      {brand}
                    </span>
                    {tags.map((tag) => (
                      <span key={tag} className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title || "Untitled"}</h1>
                  {seoMeta && (
                    <p className="text-sm text-gray-500 mt-2 italic">{seoMeta}</p>
                  )}
                </div>

                {/* Hero image */}
                {post?.hero_image_url && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 mb-6">
                    <img
                      src={post.hero_image_url}
                      alt={title}
                      className="w-full max-h-80 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}

                {/* Rendered HTML body */}
                <article
                  className="prose prose-gray prose-sm max-w-none
                    prose-headings:font-semibold prose-headings:text-gray-900
                    prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
                    prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
                    prose-p:text-gray-700 prose-p:leading-relaxed
                    prose-li:text-gray-700
                    prose-strong:text-gray-900
                    prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline"
                  dangerouslySetInnerHTML={{ __html: body || "<p class='text-gray-400'>No content yet…</p>" }}
                />
              </div>
            ) : viewMode === "edit" ? (
              /* ─── Rich Text Edit Mode (Google Docs style) ─── */
              <div className="px-6 py-4 space-y-4">
                {/* Title */}
                <div>
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Blog post title…"
                    className="w-full text-2xl font-bold text-gray-900 placeholder:text-gray-300 outline-none border-none bg-transparent pb-2"
                  />
                  <div className="h-px bg-gray-100" />
                </div>

                {/* Rich text editor */}
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Start writing your blog post…"
                />

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
            ) : (
              /* ─── HTML Source Mode ─── */
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Blog post title…"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Body (HTML Source)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Raw HTML content…"
                    rows={20}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition resize-y leading-relaxed bg-gray-50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar: metadata */}
          <div className="w-56 shrink-0 border-l border-gray-100 bg-gray-50/50 p-4 space-y-4 overflow-y-auto">
            {/* Brand */}
            <div>
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Brand</label>
              <div className="flex gap-1 mt-1.5">
                {BRANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBrand(b)}
                    className={clsx(
                      "flex-1 py-1.5 rounded-md text-xs font-medium transition text-center",
                      brand === b
                        ? "bg-gray-900 text-white"
                        : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</label>
              <div className="flex flex-col gap-1 mt-1.5">
                {COLUMNS.map((col) => (
                  <button
                    key={col.status}
                    onClick={() => moveToStatus(col.status)}
                    className={clsx(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition text-left",
                      status === col.status
                        ? "bg-gray-900 text-white"
                        : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <span className={clsx(
                      "w-2 h-2 rounded-full shrink-0",
                      status === col.status ? "bg-white" : col.accent
                    )} />
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            {post && (
              <div>
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Quick Actions</label>
                <div className="flex flex-col gap-1 mt-1.5">
                  {status === "ai_draft" && (
                    <button
                      onClick={() => { quickAction("human_review"); }}
                      className="px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 text-[12px] font-medium hover:bg-blue-100 transition text-left"
                    >
                      Move to Review
                    </button>
                  )}
                  {status === "human_review" && (
                    <>
                      <button
                        onClick={() => { quickAction("ai_draft"); }}
                        className="px-2.5 py-1.5 rounded-md bg-purple-50 text-purple-700 text-[12px] font-medium hover:bg-purple-100 transition text-left"
                      >
                        Send Back to Draft
                      </button>
                      <button
                        onClick={() => { quickAction("ready"); }}
                        className="px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 text-[12px] font-medium hover:bg-emerald-100 transition text-left"
                      >
                        Mark Ready
                      </button>
                    </>
                  )}
                  {status === "ready" && (
                    <>
                      <button
                        onClick={() => { quickAction("published"); }}
                        className="px-2.5 py-1.5 rounded-md bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition text-left"
                      >
                        Mark Published
                      </button>
                      <button
                        onClick={() => { quickAction("human_review"); }}
                        className="px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 text-[12px] font-medium hover:bg-gray-200 transition text-left"
                      >
                        Send Back to Review
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Delete */}
            {post && (
              <div className="pt-2 border-t border-gray-200">
                <button
                  onClick={() => onDeleted?.()}
                  className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={12} />
                  Delete post
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-gray-100 shrink-0">
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
  );
}
