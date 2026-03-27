"use client";

import { useEffect, useState } from "react";
import { X, Eye, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { SocialPost, SocialPostStatus, SocialPlatform } from "./types";
import { COLUMNS } from "./types";

type Props = {
  post: SocialPost | null; // null = new post
  defaultPlatform: SocialPlatform;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

const PLATFORMS: SocialPlatform[] = ["Instagram", "Facebook", "TikTok"];
const POST_TYPES = ["photo", "reel", "story", "carousel", "video"];

const QUICK_ACTIONS: Record<SocialPostStatus, { label: string; to: SocialPostStatus }[]> = {
  generating:    [],
  ai_draft:      [{ label: "Move to Review", to: "human_review" }],
  human_review:  [{ label: "Send Back to Draft", to: "ai_draft" }, { label: "Mark Ready", to: "ready" }],
  ready:         [{ label: "Mark Published", to: "published" }, { label: "Send Back to Review", to: "human_review" }],
  published:     [],
};

export default function SocialPostModal({ post, defaultPlatform, onClose, onSaved, onDeleted }: Props) {
  const isNew = !post;
  const [viewMode, setViewMode] = useState<"preview" | "edit">(isNew ? "edit" : "preview");

  const [caption, setCaption] = useState(post?.caption ?? "");
  const [platform, setPlatform] = useState<SocialPlatform>(post?.platform ?? defaultPlatform);
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

  // Reset form when post changes
  useEffect(() => {
    if (post) {
      setCaption(post.caption ?? "");
      setPlatform(post.platform);
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
      setViewMode("preview");
    } else {
      setCaption("");
      setPlatform(defaultPlatform);
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
  }, [post, defaultPlatform]);

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

                {/* Recommended image */}
                {(imageRefUrl || imageUrl) && (
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <img
                      src={imageRefUrl || imageUrl || ""}
                      alt=""
                      className="w-full max-h-80 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="px-3 py-1.5 bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      Recommended Image
                    </div>
                  </div>
                )}

                {/* Caption */}
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {caption || "(No caption)"}
                </div>

                {/* Hashtags */}
                {hashtags.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">Hashtags</div>
                    <div className="flex flex-wrap gap-1">
                      {hashtags.map((h, i) => (
                        <span key={i} className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                          #{h.replace(/^#/, "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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

            {/* Platform */}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">Platform</div>
              <div className="flex flex-col gap-1">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => viewMode === "edit" && setPlatform(p)}
                    className={clsx(
                      "text-xs font-medium py-1.5 px-2 rounded-lg text-left transition",
                      platform === p ? "bg-gray-200 text-gray-800" : "bg-white text-gray-500 border border-gray-200"
                    )}
                  >
                    {p}
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
