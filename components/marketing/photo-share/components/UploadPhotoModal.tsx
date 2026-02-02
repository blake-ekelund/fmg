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

  /* -------------------------
     Preview handling
  -------------------------- */
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
    <div className="fixed inset-0 z-50">
      {/* Overlay (desktop emphasis, subtle on mobile) */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          relative
          mx-3 my-4
          max-h-[95vh]
          w-auto
          bg-white
          rounded-3xl
          shadow-[0_8px_30px_rgba(0,0,0,0.08)]
          flex flex-col
          overflow-hidden

          md:mx-auto md:my-4
          md:h-auto md:max-w-xl
          md:rounded-3xl
          md:shadow-xl
        "
      >
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold text-gray-900">
            Add media
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </header>

        {/* Preview */}
        <div className="px-4 md:px-6 py-4">
          <div
            className="
              h-42 md:h-42
              w-full
              rounded-2xl
              bg-gray-50/70
              border border-gray-100
              flex items-center justify-center
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
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
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
                px-3 py-2.5
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
              rows={4}
              className="
                mt-1
                w-full
                rounded-xl
                border border-gray-200
                px-3 py-2.5
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
        <footer className="sticky bottom-0 bg-white px-4 md:px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
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
              inline-flex items-center gap-2
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
