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

  const [platform, setPlatform] = useState<Platform>(
    item?.platform ?? "Instagram"
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
    setPlatform(item.platform);
    setContentType(item.content_type);
    setStrategy(item.strategy);
    setDescription(item.description);
    setStatus(item.status);
  }, [item]);

  async function save() {
    if (!publishDate || !contentType || !strategy) return;

    setLoading(true);

    if (item) {
      // EDIT
      await supabase
        .from("marketing_content")
        .update({
          publish_date: publishDate,
          platform,
          content_type: contentType,
          strategy,
          description,
          status,
        })
        .eq("id", item.id);
    } else {
      // CREATE
      await supabase.from("marketing_content").insert({
        publish_date: publishDate,
        platform,
        content_type: contentType,
        strategy,
        description,
        status,
      });
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

      {/* Modal Container — STOP PROPAGATION */}
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-6 space-y-4"
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

        {/* Form */}
        <input
          type="date"
          value={publishDate}
          onChange={(e) => setPublishDate(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />

        <select
          value={platform}
          onChange={(e) =>
            setPlatform(e.target.value as Platform)
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        >
          <option>Instagram</option>
          <option>Facebook</option>
          <option>TikTok</option>
          <option>Blog</option>
        </select>

        <input
          placeholder="Content Type"
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />

        <input
          placeholder="Strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />

        <textarea
          rows={3}
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />

        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as ContentStatus)
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        >
          <option>Not Started</option>
          <option>Ready</option>
          <option>In Progress</option>
        </select>

        {/* Actions */}
        <div className="flex justify-between pt-2">
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
