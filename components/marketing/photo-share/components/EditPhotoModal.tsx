"use client";

import { useEffect, useState } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { PhotoAsset } from "@/types/photoShare";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Database } from "@/types/supabase";

type Props = {
  asset: PhotoAsset;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type PhotoAssetUpdate =
  Database["public"]["Tables"]["photo_share_assets"]["Update"];

export default function EditPhotoModal({
  asset,
  open,
  onClose,
  onSaved,
}: Props) {
  const supabase = supabaseBrowser();

  const [title, setTitle] = useState(asset.title);
  const [description, setDescription] = useState(asset.description ?? "");
  const [allowThirdParty, setAllowThirdParty] = useState(
    asset.allow_third_party_use
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(asset.title);
    setDescription(asset.description ?? "");
    setAllowThirdParty(asset.allow_third_party_use);
  }, [asset]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) =>
      e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  /* ---------------- SAVE ---------------- */
  async function handleSave() {
    setSaving(true);

    const update: PhotoAssetUpdate = {
      title,
      description,
      allow_third_party_use: allowThirdParty,
    };

    const { error } = await (
      supabase.from("photo_share_assets") as any
    )
      .update(update)
      .eq("id", asset.id);

    setSaving(false);

    if (!error) {
      onSaved();
      onClose();
    } else {
      console.error("Update failed:", error);
    }
  }

  /* ---------------- ARCHIVE ---------------- */
  async function handleArchive() {
    if (!confirm("Archive this asset?")) return;

    const update: PhotoAssetUpdate = {
      is_active: false,
    };

    const { error } = await (
      supabase.from("photo_share_assets") as any
    )
      .update(update)
      .eq("id", asset.id);

    if (!error) {
      onSaved();
      onClose();
    } else {
      console.error("Archive failed:", error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          w-full
          max-w-3xl
          max-h-[85vh]
          rounded-3xl
          bg-white
          shadow-xl
          flex
          flex-col
        "
      >
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Edit Media
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </header>

        {/* Image */}
        <div className="px-8">
          <div className="h-72 w-full rounded-2xl bg-gray-50 flex items-center justify-center">
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/marketing-photo-share/${asset.file_path}`}
              alt={asset.title}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allowThirdParty}
              onChange={(e) => setAllowThirdParty(e.target.checked)}
            />
            Approved for third-party use
          </label>
        </div>

        {/* Footer */}
        <footer className="mt-auto flex items-center justify-between px-8 py-5">
          <button
            onClick={handleArchive}
            className="inline-flex items-center gap-2 text-sm text-red-600 hover:underline"
          >
            <Trash2 size={16} />
            Archive
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              <Save size={16} />
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
