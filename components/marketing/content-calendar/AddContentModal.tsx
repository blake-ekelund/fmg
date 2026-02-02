"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Platform,
  ContentStatus,
  ContentItem,
  Brand,
} from "./types";
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

const BRAND_OPTIONS: Brand[] = ["NI", "Sassy"];

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

  /* ---------------------------------------------
     Brand + Platform
     - Create: multi-select
     - Edit: single (locked)
  --------------------------------------------- */
  const [brands, setBrands] = useState<Brand[]>(
    item ? [item.brand] : ["NI"]
  );

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

  /* Sync state when editing */
  useEffect(() => {
    if (!item) return;

    setPublishDate(item.publish_date);
    setBrands([item.brand]);
    setPlatforms([item.platform]);
    setContentType(item.content_type);
    setStrategy(item.strategy);
    setDescription(item.description);
    setStatus(item.status);
  }, [item]);

  function toggleBrand(b: Brand) {
    setBrands((prev) =>
      prev.includes(b)
        ? prev.filter((x) => x !== b)
        : [...prev, b]
    );
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p)
        ? prev.filter((x) => x !== p)
        : [...prev, p]
    );
  }

  async function save() {
    if (!publishDate || !contentType || !strategy) return;
    if (!brands.length || !platforms.length) return;

    setLoading(true);

    if (item) {
      /* ---------------------------------------------
         EDIT — single row only
      --------------------------------------------- */
      await supabase
        .from("marketing_content")
        .update({
          publish_date: publishDate,
          brand: brands[0],
          platform: platforms[0],
          content_type: contentType,
          strategy,
          description,
          status,
        })
        .eq("id", item.id);
    } else {
      /* ---------------------------------------------
         CREATE — brand × platform
      --------------------------------------------- */
      const rows = brands.flatMap((brand) =>
        platforms.map((platform) => ({
          publish_date: publishDate,
          brand,
          platform,
          content_type: contentType,
          strategy,
          description,
          status,
        }))
      );

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
              onClick={onBack}
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
        <label className="block text-sm font-medium">
          Publish Date
          <input
            type="date"
            value={publishDate}
            onChange={(e) =>
              setPublishDate(e.target.value)
            }
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        {/* Brand */}
        <div>
          <div className="text-sm font-medium mb-2">
            Brand
          </div>
          <div className="flex gap-4">
            {BRAND_OPTIONS.map((b) => (
              <label
                key={b}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={brands.includes(b)}
                  onChange={() => toggleBrand(b)}
                  disabled={!!item}
                />
                {b}
              </label>
            ))}
          </div>

          {!item && (
            <p className="mt-1 text-xs text-gray-500">
              Selecting multiple brands creates one item per brand.
            </p>
          )}
        </div>

        {/* Platform */}
        <div>
          <div className="text-sm font-medium mb-2">
            Platform
          </div>
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
            <p className="mt-1 text-xs text-gray-500">
              A separate content item will be created for each selected platform.
            </p>
          )}
        </div>

        {/* Content Type */}
        <label className="block text-sm font-medium">
          Content Type
          <input
            value={contentType}
            onChange={(e) =>
              setContentType(e.target.value)
            }
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        {/* Strategy */}
        <label className="block text-sm font-medium">
          Strategy
          <input
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value)
            }
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        {/* Description */}
        <label className="block text-sm font-medium">
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          />
        </label>

        {/* Status */}
        <label className="block text-sm font-medium">
          Status
          <select
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value as ContentStatus
              )
            }
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Ready</option>
          </select>
        </label>

        {/* Actions */}
        <div className="flex justify-between pt-3">
          <button
            onClick={onClose}
            className="text-sm text-gray-500"
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
