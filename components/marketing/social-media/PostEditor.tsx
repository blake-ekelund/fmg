"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/types/supabase";
import type { Brand } from "@/types/brand";

import PostPreview from "./PostPreview";
import type { SocialPlatform, SocialPost } from "./SocialMediaSection";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

type PostStatus = Database["public"]["Tables"]["social_media_posts"]["Row"]["status"];
type PostType = Database["public"]["Tables"]["social_media_posts"]["Row"]["post_type"];

const BRANDS: Brand[] = ["NI", "Sassy"];
const PLATFORMS: SocialPlatform[] = ["Instagram", "Facebook"];
const POST_TYPES: PostType[] = ["photo", "carousel", "reel", "story"];
const STATUSES: PostStatus[] = ["planned", "posted"];

/* ═══════════════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════════════ */

type PostEditorProps = {
  post: SocialPost | null;
  defaultPlatform: SocialPlatform;
  onClose: () => void;
  onSaved: () => void;
};

/* ═══════════════════════════════════════════════════════════
   FORM STATE
   ═══════════════════════════════════════════════════════════ */

type Draft = {
  brand: Brand;
  platform: SocialPlatform;
  post_date: string;
  caption: string;
  image_url: string;
  post_type: PostType;
  status: PostStatus;
};

function initDraft(post: SocialPost | null, defaultPlatform: SocialPlatform): Draft {
  if (post) {
    return {
      brand: post.brand,
      platform: (post.platform === "TikTok" ? "Instagram" : post.platform) as SocialPlatform,
      post_date: post.post_date,
      caption: post.caption ?? "",
      image_url: post.image_url ?? "",
      post_type: post.post_type,
      status: post.status,
    };
  }
  return {
    brand: "NI",
    platform: defaultPlatform,
    post_date: new Date().toISOString().slice(0, 10),
    caption: "",
    image_url: "",
    post_type: "photo",
    status: "planned",
  };
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function PostEditor({
  post,
  defaultPlatform,
  onClose,
  onSaved,
}: PostEditorProps) {
  const isEditing = !!post;
  const [draft, setDraft] = useState<Draft>(() =>
    initDraft(post, defaultPlatform)
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── Helpers ─────────────────────────────────────────── */

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  /* ── Save ────────────────────────────────────────────── */

  async function handleSave() {
    if (!draft.post_date) return;
    setSaving(true);

    const payload = {
      brand: draft.brand,
      platform: draft.platform,
      post_date: draft.post_date,
      caption: draft.caption || null,
      image_url: draft.image_url || null,
      post_type: draft.post_type,
      status: draft.status,
    };

    if (isEditing) {
      await supabase
        .from("social_media_posts")
        .update(payload)
        .eq("id", post!.id);
    } else {
      await supabase.from("social_media_posts").insert(payload);
    }

    setSaving(false);
    onSaved();
  }

  /* ── Delete ──────────────────────────────────────────── */

  async function handleDelete() {
    if (!post) return;
    setDeleting(true);
    await supabase.from("social_media_posts").delete().eq("id", post.id);
    setDeleting(false);
    onSaved();
  }

  /* ── Label component ─────────────────────────────────── */

  function Label({
    text,
    children,
  }: {
    text: string;
    children: React.ReactNode;
  }) {
    return (
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-gray-500">{text}</span>
        {children}
      </label>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10";

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 my-8 mx-4 w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-medium text-gray-900">
            {isEditing ? "Edit Post" : "New Post"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 transition"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Body — two columns on desktop */}
        <div className="flex flex-col md:flex-row gap-6 p-5">
          {/* Left: form fields */}
          <div className="flex-1 space-y-4">
            {/* Brand + Platform row */}
            <div className="grid grid-cols-2 gap-3">
              <Label text="Brand">
                <select
                  value={draft.brand}
                  onChange={(e) => set("brand", e.target.value as Brand)}
                  className={inputCls}
                >
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Label>

              <Label text="Platform">
                <select
                  value={draft.platform}
                  onChange={(e) =>
                    set("platform", e.target.value as SocialPlatform)
                  }
                  className={inputCls}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Label>
            </div>

            {/* Post type + status row */}
            <div className="grid grid-cols-2 gap-3">
              <Label text="Post Type">
                <select
                  value={draft.post_type}
                  onChange={(e) =>
                    set("post_type", e.target.value as PostType)
                  }
                  className={inputCls}
                >
                  {POST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </Label>

              <Label text="Status">
                <select
                  value={draft.status}
                  onChange={(e) =>
                    set("status", e.target.value as PostStatus)
                  }
                  className={inputCls}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Label>
            </div>

            {/* Date */}
            <Label text="Post Date">
              <input
                type="date"
                value={draft.post_date}
                onChange={(e) => set("post_date", e.target.value)}
                className={inputCls}
              />
            </Label>

            {/* Image URL */}
            <Label text="Image URL">
              <input
                type="text"
                value={draft.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="https://..."
                className={inputCls}
              />
            </Label>

            {/* Caption */}
            <Label text="Caption">
              <textarea
                value={draft.caption}
                onChange={(e) => set("caption", e.target.value)}
                rows={4}
                placeholder="Write your caption..."
                className={clsx(inputCls, "resize-none")}
              />
            </Label>
          </div>

          {/* Right: live preview */}
          <div className="hidden md:flex flex-col items-center gap-3">
            <span className="text-[11px] font-medium text-gray-400">
              Preview
            </span>
            <PostPreview
              caption={draft.caption || null}
              image_url={draft.image_url || null}
              platform={draft.platform}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <div>
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={14} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.post_date}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : isEditing ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
