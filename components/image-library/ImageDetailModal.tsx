"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Trash2, Copy, Check, ExternalLink, ChevronDown } from "lucide-react";
import { updateImageMeta, deleteImage } from "./api";
import { displayName, fileName } from "./format";
import type { LibraryImage, ShareScope } from "./types";

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fieldClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700";

export default function ImageDetailModal({
  image,
  folders,
  currentFolderLabel,
  onClose,
  onSaved,
  onDeleted,
}: {
  image: LibraryImage;
  /** Folders the image can be filed into, with their full-path labels. */
  folders: { id: string; label: string }[];
  /** Full-path label of the folder the image is in now. */
  currentFolderLabel: string;
  onClose: () => void;
  onSaved: (updated: LibraryImage) => void;
  onDeleted: (path: string) => void;
}) {
  const [title, setTitle] = useState(image.title ?? "");
  const [altText, setAltText] = useState(image.altText ?? "");
  const [description, setDescription] = useState(image.description ?? "");
  const [shareScope, setShareScope] = useState<ShareScope>(image.shareScope);
  const [folder, setFolder] = useState(image.folder);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Re-seed the form whenever a different image is opened.
  useEffect(() => {
    setTitle(image.title ?? "");
    setAltText(image.altText ?? "");
    setDescription(image.description ?? "");
    setShareScope(image.shareScope);
    setFolder(image.folder);
    setMoreOpen(false);
    setConfirmDelete(false);
    setError(null);
  }, [image]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateImageMeta(image.path, {
        title,
        altText,
        description,
        shareScope,
        ...(folder !== image.folder ? { folder } : {}),
      });
      onSaved({
        ...image,
        title: title.trim() || null,
        altText: altText.trim() || null,
        description: description.trim() || null,
        shareScope,
        folder,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteImage(image.path);
      onDeleted(image.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete image.");
      setDeleting(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(image.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  const isProduct = image.source === "product";

  const dirty =
    title !== (image.title ?? "") ||
    altText !== (image.altText ?? "") ||
    description !== (image.description ?? "") ||
    shareScope !== image.shareScope ||
    folder !== image.folder;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-5">
          <h2 className="truncate text-xl font-semibold text-gray-900" title={fileName(image.path)}>
            {displayName(image)}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-6 overflow-y-auto px-6 pb-6 pt-3 md:grid-cols-[3fr_2fr]">
          {/* Preview */}
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gray-100 md:aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.altText ?? displayName(image)}
                className="h-full w-full object-contain p-3"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={copyUrl}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-[15px] font-medium text-white hover:bg-gray-700"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Link copied" : "Copy link"}
              </button>
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-[15px] font-medium text-gray-800 hover:bg-gray-50"
              >
                <ExternalLink size={16} /> Open full size
              </a>
              {prettySize(image.size) && (
                <span className="ml-auto text-sm text-gray-500">{prettySize(image.size)}</span>
              )}
            </div>
          </div>

          {isProduct ? (
            // Product photos come from the catalog — edited on the product page.
            <div className="space-y-5">
              <p className="text-[15px] leading-relaxed text-gray-600">
                This is a product photo. To change or remove it, open the product&apos;s
                page — it updates here, on the storefront, and on the rep portal.
              </p>
              <div>
                <div className={labelClass}>Folder</div>
                <div className="text-[15px] text-gray-900">{currentFolderLabel}</div>
              </div>
              {image.productPart && (
                <Link
                  href={`/products/${encodeURIComponent(image.productPart)}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[15px] font-medium text-white hover:bg-gray-700"
                >
                  Open product page <ExternalLink size={16} />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={displayName({ ...image, title: null })}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Folder</label>
                <select value={folder} onChange={(e) => setFolder(e.target.value)} className={fieldClass}>
                  {/* Keep the current value selectable even if it isn't fileable (e.g. "root"). */}
                  {(folders.some((f) => f.id === image.folder)
                    ? folders
                    : [{ id: image.folder, label: currentFolderLabel }, ...folders]
                  ).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className={labelClass}>Who can use it</div>
                <div className="inline-flex w-full rounded-xl bg-gray-100 p-1">
                  {([
                    { key: "internal", label: "Our team" },
                    { key: "third_party", label: "Our team + reps" },
                  ] as { key: ShareScope; label: string }[]).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setShareScope(o.key)}
                      className={`flex-1 rounded-lg px-3 py-2 text-[15px] font-medium transition ${
                        shareScope === o.key
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rarely-needed fields stay folded away. */}
              <div>
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  <ChevronDown size={16} className={`transition ${moreOpen ? "rotate-180" : ""}`} />
                  Description &amp; alt text
                </button>
                {moreOpen && (
                  <div className="mt-3 space-y-4">
                    <div>
                      <label className={labelClass}>Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Notes, usage guidance, photographer…"
                        className={`${fieldClass} resize-none`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Alt text</label>
                      <input
                        type="text"
                        value={altText}
                        onChange={(e) => setAltText(e.target.value)}
                        placeholder="Describe the image for screen readers"
                        className={fieldClass}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[15px] text-rose-700">{error}</div>
        )}

        {/* Footer */}
        {!isProduct && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] text-gray-700">Delete this image for good?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-[15px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="rounded-full px-4 py-2 text-[15px] font-medium text-gray-600 hover:bg-gray-100"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[15px] font-medium text-gray-500 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={16} /> Delete
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-[15px] font-semibold text-white hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-500"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
