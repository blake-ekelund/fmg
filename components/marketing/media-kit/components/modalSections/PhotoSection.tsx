import { Upload } from "lucide-react";
import { useState } from "react";
import { PreviewTile } from "./PreviewTile";
import { AddTile } from "./AddTile";
import { uploadMediaKitAsset } from "@/lib/mediaKit/uploadMediaKitAsset";
import { supabase } from "@/lib/supabaseClient";
import { AssetType } from "../mediaKit/types";
import { DeleteConfirmModal } from "./DeleteConfirmModal";

type Props = {
  label: string;
  multiple: boolean;
  part: string;
  assetType: AssetType;
  images: string[];
  onUploaded: () => void;

  showIngredientsText?: boolean;
  ingredientsText?: string;
  onIngredientsChange?: (v: string) => void;
};

export function PhotoSection({
  label,
  multiple,
  part,
  assetType,
  images,
  onUploaded,
  showIngredientsText = false,
  ingredientsText = "",
  onIngredientsChange,
}: Props) {
  const [deleteTarget, setDeleteTarget] =
    useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    if (!e.target.files?.length) return;

    try {
      for (const file of Array.from(e.target.files)) {
        await uploadMediaKitAsset({ file, part, assetType });
      }

      onUploaded();
    } catch (err) {
      console.error("Upload failed", err);
      alert("Upload failed. Please try again.");
    } finally {
      e.target.value = "";
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const url = new URL(deleteTarget);
      const path = decodeURIComponent(
        url.pathname.split("/media-kit/")[1]
      );

      // 1. Delete from storage
      const { error: storageError } =
        await supabase.storage
          .from("media-kit")
          .remove([path]);

      if (storageError) throw storageError;

      // 2. Delete DB row
      const { error: dbError } = await supabase
        .from("media_kit_assets")
        .delete()
        .eq("storage_path", path);

      if (dbError) throw dbError;

      onUploaded();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete image.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h3 className="text-sm font-semibold text-gray-900">
        {label}
      </h3>

      <div className="rounded-2xl bg-gray-50 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((src) => (
            <PreviewTile
              key={src}
              src={src}
              onDelete={() => setDeleteTarget(src)}
            />
          ))}

          {multiple && <AddTile />}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-yellow-600 cursor-pointer hover:text-yellow-700">
        <Upload size={16} />
        Upload {multiple ? "images" : "image"}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          multiple={multiple}
          onChange={handleUpload}
        />
      </label>

      {showIngredientsText && (
        <textarea
          rows={3}
          value={ingredientsText}
          onChange={(e) =>
            onIngredientsChange?.(e.target.value)
          }
          placeholder="Ingredients: Water (Aqua), ..."
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     focus:ring-2 focus:ring-yellow-200"
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          loading={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
