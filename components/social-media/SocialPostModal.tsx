"use client";

import { useEffect, useState } from "react";
import { X, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { SocialPost, SocialPostStatus, SocialPlatform } from "./types";
import { COLUMNS } from "./types";

type Props = {
  post: SocialPost | null; // null = new post
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

const POST_TYPES = ["carousel", "reel"];

const QUICK_ACTIONS: Record<SocialPostStatus, { label: string; to: SocialPostStatus }[]> = {
  generating:    [],
  ai_draft:      [{ label: "Move to Review", to: "human_review" }],
  human_review:  [{ label: "Send Back to Draft", to: "ai_draft" }, { label: "Mark Ready", to: "ready" }],
  ready:         [{ label: "Mark Published", to: "published" }, { label: "Send Back to Review", to: "human_review" }],
  published:     [],
};

export default function SocialPostModal({ post, onClose, onSaved, onDeleted }: Props) {
  const isNew = !post;
  const [viewMode, setViewMode] = useState<"preview" | "edit">(isNew ? "edit" : "preview");

  const [caption, setCaption] = useState(post?.caption ?? "");
  const platform: SocialPlatform = "Instagram / Facebook";
  const [postType, setPostType] = useState(post?.post_type ?? "photo");
  const [brand, setBrand] = useState<"NI" | "Sassy">(post?.brand ?? "NI");
  const [status, setStatus] = useState<SocialPostStatus>((post?.status as SocialPostStatus) ?? "ai_draft");
  const [postDate, setPostDate] = useState(post?.post_date ?? new Date().toISOString().slice(0, 10));
  const [imageUrl, setImageUrl] = useState(post?.image_url ?? "");
  const [imageRefUrl, setImageRefUrl] = useState(post?.image_ref_url ?? "");
  const [imageDirection, setImageDirection] = useState(post?.image_direction ?? "");
  const [hashtags, setHashtags] = useState<string[]>(post?.hashtags ?? []);
  const [cta, setCta] = useState(post?.cta ?? "");
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  // Reset form when post changes
  useEffect(() => {
    if (post) {
      setCaption(post.caption ?? "");
      setPostType(post.post_type);
      setBrand(post.brand);
      setStatus(post.status as SocialPostStatus);
      setPostDate(post.post_date);
      setImageUrl(post.image_url ?? "");
      setImageRefUrl(post.image_ref_url ?? "");
      setImageDirection(post.image_direction ?? "");
      setHashtags(post.hashtags ?? []);
      setCta(post.cta ?? "");
      setTags(post.tags ?? []);
      setActiveSlide(0);
      setViewMode("preview");
    } else {
      setCaption("");
      setPostType("photo");
      setBrand("NI");
      setStatus("ai_draft");
      setPostDate(new Date().toISOString().slice(0, 10));
      setImageUrl("");
      setImageRefUrl("");
      setImageDirection("");
      setHashtags([]);
      setCta("");
      setTags([]);
      setViewMode("edit");
    }
  }, [post]);

  async function handleSave() {
    if (!caption.trim()) return;
    setSaving(true);
    const payload = {
      caption,
      platform,
      post_type: postType,
      brand,
      status,
      post_date: postDate,
      image_url: imageUrl || imageRefUrl || null,
      image_ref_url: imageRefUrl || null,
      image_direction: imageDirection || null,
      hashtags: hashtags.length > 0 ? hashtags : null,
      cta: cta || null,
      tags: tags.length > 0 ? tags : null,
      updated_at: new Date().toISOString(),
    };

    if (post) {
      await supabase.from("social_media_posts").update(payload).eq("id", post.id);
    } else {
      await supabase.from("social_media_posts").insert(payload);
    }
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!post) return;
    await supabase.from("social_media_posts").delete().eq("id", post.id);
    onDeleted?.();
    onClose();
  }

  function handleQuickAction(to: SocialPostStatus) {
    setStatus(to);
    // Auto-save status change for existing posts
    if (post) {
      supabase
        .from("social_media_posts")
        .update({ status: to, updated_at: new Date().toISOString() })
        .eq("id", post.id)
        .then(() => onSaved());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">
            {isNew ? "New Social Post" : "Edit Post"}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && (
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode("preview")}
                  className={clsx("flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                    viewMode === "preview" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                  )}
                >
                  <Eye size={12} /> Preview
                </button>
                <button
                  onClick={() => setViewMode("edit")}
                  className={clsx("flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                    viewMode === "edit" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                  )}
                >
                  <Pencil size={12} /> Edit
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex">
          {/* Main content */}
          <div className="flex-1 p-5">
            {viewMode === "preview" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded",
                    brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                  )}>
                    {brand}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{platform}</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-400">{postType}</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-400">{postDate}</span>
                </div>

                {/* ── Instagram-style post preview ── */}
                {(() => {
                  const slides = post?.carousel_slides;
                  const hasCarousel = slides && slides.length > 0;
                  const totalSlides = slides?.length ?? 0;
                  const currentSlide = slides?.[activeSlide];
                  const brandName = brand === "NI" ? "Natural Inspirations" : "Sassy";

                  return (
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                      {/* IG header bar */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className={clsx(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                          brand === "NI" ? "bg-blue-600" : "bg-pink-600"
                        )}>
                          {brand === "NI" ? "NI" : "S"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-gray-900 leading-tight">{brandName}</div>
                          <div className="text-[11px] text-gray-400">{platform} &middot; {postType}</div>
                        </div>
                        <div className="text-gray-300">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                        </div>
                      </div>

                      {/* Image area */}
                      {hasCarousel ? (
                        <div className="relative bg-gray-100 aspect-square">
                          {/* Current slide image */}
                          {currentSlide?.rendered_image_url ? (
                            <img
                              key={activeSlide}
                              src={currentSlide.rendered_image_url}
                              alt={currentSlide.text_overlay}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : currentSlide?.image_url ? (
                            <img
                              key={activeSlide}
                              src={currentSlide.image_url}
                              alt={currentSlide.text_overlay}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className={clsx(
                              "w-full h-full flex items-center justify-center p-8",
                              brand === "NI" ? "bg-[#1e3a5f]" : "bg-[#be185d]"
                            )}>
                              <span className="text-white text-lg font-bold text-center leading-snug">
                                {currentSlide?.text_overlay}
                              </span>
                            </div>
                          )}

                          {/* Left arrow */}
                          {activeSlide > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveSlide(activeSlide - 1); }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white transition"
                            >
                              <ChevronLeft size={16} className="text-gray-700" />
                            </button>
                          )}

                          {/* Right arrow */}
                          {activeSlide < totalSlides - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveSlide(activeSlide + 1); }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white transition"
                            >
                              <ChevronRight size={16} className="text-gray-700" />
                            </button>
                          )}

                          {/* Slide counter pill */}
                          <div className="absolute top-3 right-3 bg-black/60 text-white text-[11px] font-medium rounded-full px-2.5 py-0.5">
                            {activeSlide + 1}/{totalSlides}
                          </div>
                        </div>
                      ) : (imageRefUrl || imageUrl) ? (
                        <div className="bg-gray-100 aspect-square">
                          <img
                            src={imageRefUrl || imageUrl || ""}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      ) : null}

                      {/* IG action bar + dots */}
                      <div className="px-3 pt-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-4">
                            <Heart size={20} className="text-gray-800 cursor-pointer hover:text-red-500 transition" />
                            <MessageCircle size={20} className="text-gray-800 cursor-pointer hover:text-gray-500 transition" />
                            <Send size={20} className="text-gray-800 cursor-pointer hover:text-gray-500 transition" />
                          </div>

                          {/* Dots */}
                          {hasCarousel && totalSlides > 1 && (
                            <div className="flex gap-1 absolute left-1/2 -translate-x-1/2" style={{ position: "relative", left: "auto", transform: "none" }}>
                              {slides.map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setActiveSlide(i)}
                                  className={clsx(
                                    "rounded-full transition-all",
                                    i === activeSlide
                                      ? "w-1.5 h-1.5 bg-blue-500"
                                      : "w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400"
                                  )}
                                />
                              ))}
                            </div>
                          )}

                          <Bookmark size={20} className="text-gray-800 cursor-pointer hover:text-gray-500 transition" />
                        </div>
                      </div>

                      {/* Caption area */}
                      <div className="px-3 pb-3 pt-1">
                        <div className="text-[13px] text-gray-900 leading-relaxed">
                          <span className="font-semibold mr-1">{brandName.toLowerCase().replace(/\s/g, "")}</span>
                          {caption || "(No caption)"}
                        </div>

                        {/* Hashtags inline */}
                        {hashtags.length > 0 && (
                          <div className="text-[13px] text-blue-500 mt-1 leading-relaxed">
                            {hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
                          </div>
                        )}

                        {/* Date */}
                        <div className="text-[11px] text-gray-400 mt-2 uppercase">
                          {new Date(postDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* CTA */}
                {cta && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">Call to Action</div>
                    <div className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{cta}</div>
                  </div>
                )}

                {/* Image Direction */}
                {imageDirection && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">Image Direction</div>
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 italic">{imageDirection}</div>
                  </div>
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t, i) => (
                        <span key={i} className="text-[11px] text-gray-600 bg-gray-100 rounded px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Caption */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1 block">
                    Caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                    placeholder="Write your caption..."
                  />
                </div>

                {/* Image URL */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1 block">
                    Image URL
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="https://..."
                  />
                </div>

                {/* Post date */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1 block">
                    Post Date
                  </label>
                  <input
                    type="date"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="w-52 border-l border-gray-100 p-4 space-y-5 bg-gray-50/50">
            {/* Brand */}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">Brand</div>
              <div className="flex gap-1">
                {(["NI", "Sassy"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => viewMode === "edit" && setBrand(b)}
                    className={clsx(
                      "flex-1 text-xs font-medium py-1.5 rounded-lg transition",
                      brand === b
                        ? b === "NI" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                        : "bg-white text-gray-500 border border-gray-200"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Post type */}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">Type</div>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value)}
                disabled={viewMode !== "edit"}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white"
              >
                {POST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">Status</div>
              <div className="flex flex-col gap-1">
                {COLUMNS.map((col) => (
                  <button
                    key={col.status}
                    onClick={() => viewMode === "edit" && setStatus(col.status)}
                    className={clsx(
                      "flex items-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-lg text-left transition",
                      status === col.status ? "bg-gray-200 text-gray-800" : "bg-white text-gray-500 border border-gray-200"
                    )}
                  >
                    <span className={clsx("w-1.5 h-1.5 rounded-full", col.accent)} />
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            {!isNew && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">Quick Actions</div>
                <div className="flex flex-col gap-1">
                  {(QUICK_ACTIONS[status] ?? []).map((action) => (
                    <button
                      key={action.to}
                      onClick={() => handleQuickAction(action.to)}
                      className="text-xs font-medium py-1.5 px-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 text-left transition"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Delete */}
            {!isNew && (
              <div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition"
                  >
                    <Trash2 size={12} /> Delete post
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={handleDelete}
                      className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {viewMode === "edit" && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !caption.trim()}
              className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition"
            >
              {saving ? "Saving…" : isNew ? "Create Post" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
