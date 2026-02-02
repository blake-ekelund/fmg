"use client";

import { useEffect, useState } from "react";
import { X, Upload, Image as ImageIcon } from "lucide-react";
import { uploadPhotoAsset } from "@/lib/photoShare";

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
};

export default function UploadPhotoModal({
  open,
  onClose,
  onUploaded,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allowThirdParty, setAllowThirdParty] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create / clean up preview URL
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }

    setPreviewUrl(null);
  }, [file]);

  if (!open) return null;

  async function handleUpload() {
    if (!file || !title) return;

    setLoading(true);

    await uploadPhotoAsset({
      file,
      title,
      description,
      allowThirdParty,
    });

    setFile(null);
    setTitle("");
    setDescription("");
    setAllowThirdParty(false);
    setLoading(false);

    onUploaded();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          w-full
          max-w-xl
          max-h-[100vh]
          rounded-3xl
          bg-white
          shadow-xl
          flex
          flex-col
        "
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Add media
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </header>

        {/* Preview */}
        <div className="px-6">
          <div
            className="
              h-56
              w-full
              rounded-2xl
              bg-gray-50
              border border-gray-200
              flex
              items-center
              justify-center
              overflow-hidden
            "
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <ImageIcon size={28} />
                <span className="text-sm">
                  Image preview will appear here
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">
              File
            </label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) =>
                setFile(e.target.files?.[0] ?? null)
              }
              className="mt-1 block w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">
              Title
            </label>
            <input
              placeholder="Enter a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="
                mt-1
                w-full
                rounded-xl
                border border-gray-200
                px-3 py-2
                text-sm
                focus:outline-none
                focus:ring-2
                focus:ring-gray-200
              "
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">
              Description
            </label>
            <textarea
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="
                mt-1
                w-full
                rounded-xl
                border border-gray-200
                px-3 py-2
                text-sm
                focus:outline-none
                focus:ring-2
                focus:ring-gray-200
              "
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allowThirdParty}
              onChange={(e) =>
                setAllowThirdParty(e.target.checked)
              }
            />
            Approved for third-party use
          </label>
        </div>

        {/* Footer */}
        <footer className="mt-auto flex items-center justify-end gap-3 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
          >
            Cancel
          </button>

          <button
            onClick={handleUpload}
            disabled={!file || !title || loading}
            className="
              inline-flex
              items-center
              gap-2
              rounded-xl
              bg-gray-900
              px-4 py-2
              text-sm
              text-white
              disabled:opacity-50
            "
          >
            <Upload size={16} />
            Upload
          </button>
        </footer>
      </div>
    </div>
  );
}
