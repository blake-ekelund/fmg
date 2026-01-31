"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Platform, ContentStatus, ContentItem } from "./types";
import { ArrowLeft } from "lucide-react";

type Props = {
  date: string | null;
  item?: ContentItem | null;
  onClose: () => void;
  onSaved: () => void;
  onBack?: () => void;
};

const PLATFORM_OPTIONS: Platform[] = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Blog",
];

export default function AddContentModal({
  date,
  item,
  onClose,
  onSaved,
  onBack,
}: Props) {
  const [publishDate, setPublishDate] = useState(
    item?.publish_date ??
      date ??
      new Date().toISOString().split("T")[0]
  );

  // Multi-select for CREATE, single-select for EDIT
  const [platforms, setPlatforms] = useState<Platform[]>(
    item ? [item.platform] : ["Instagram", "Facebook"]
  );

  const [contentType, setContentType] = useState(
    item?.content_type ?? ""
  );
  const [strategy, setStrategy] = useState(
    item?.strategy ?? ""
  );
  const [description, setDescription] = useState(
    item?.description ?? ""
  );
  const [status, setStatus] = useState<ContentStatus>(
    item?.status ?? "Not Started"
  );
  const [loading, setLoading] = useState(false);

  /* Sync state when editing a different item */
  useEffect(() => {
    if (!item) return;
    setPublishDate(item.publish_date);
    setPlatforms([item.platform]);
    setContentType(item.content_type);
    setStrategy(item.strategy);
    setDescription(item.description);
    setStatus(item.status);
  }, [item]);

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p)
        ? prev.filter((x) => x !== p)
        : [...prev, p]
    );
  }

  async function save() {
    if (!publishDate || !contentType || !strategy) return;
    if (!platforms.length) return;

    setLoading(true);

    if (item) {
      // EDIT — single row only
      await supabase
        .from("marketing_content")
        .update({
          publish_date: publishDate,
          platform: platforms[0],
          content_type: contentType,
          strategy,
          description,
          status,
        })
        .eq("id", item.id);
    } else {
      // CREATE — one row per platform
      const rows = platforms.map((platform) => ({
        publish_date: publishDate,
        platform,
        content_type: contentType,
        strategy,
        description,
        status,
      }));

      await supabase.from("marketing_content").insert(rows);
    }

    setLoading(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBack();
              }}
              className="text-gray-500 hover:text-black"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h3 className="text-lg font-medium">
            {item ? "Edit Content" : "Add Content"}
          </h3>
        </div>

        {/* Publish Date */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Publish Date
          </label>
          <input
            type="date"
            value={publishDate}
            onChange={(e) => setPublishDate(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {/* Platforms */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Platform
          </label>

          <div className="flex flex-wrap gap-4">
            {PLATFORM_OPTIONS.map((p) => (
              <label
                key={p}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={() => togglePlatform(p)}
                  disabled={!!item}
                />
                {p}
              </label>
            ))}
          </div>

          {!item && (
            <p className="text-xs text-gray-500">
              A separate content item will be created for each
              selected platform.
            </p>
          )}
        </div>

        {/* Content Type */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Content Type
          </label>
          <input
            placeholder="e.g. Static Image, Carousel, Reel"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {/* Strategy */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Strategy
          </label>
          <input
            placeholder="e.g. Self-care, Brand Awareness"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            rows={3}
            placeholder="What is this post about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ContentStatus)
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Ready</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={save}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading
              ? "Saving…"
              : item
              ? "Save Changes"
              : "Add Content"}
          </button>
        </div>
      </div>
    </div>
  );
}
