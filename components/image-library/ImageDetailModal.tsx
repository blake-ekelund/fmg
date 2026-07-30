"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Lock,
} from "lucide-react";
import { updateImageMeta, deleteImage } from "./api";
import type { LibraryImage, ShareScope } from "./types";

function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/^\d+-/, "");
}

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageDetailModal({
  image,
  onClose,
  onSaved,
  onDeleted,
}: {
  image: LibraryImage;
  onClose: () => void;
  onSaved: (updated: LibraryImage) => void;
  onDeleted: (path: string) => void;
}) {
  const [title, setTitle] = useState(image.title ?? "");
  const [altText, setAltText] = useState(image.altText ?? "");
  const [description, setDescription] = useState(image.description ?? "");
  const [shareScope, setShareScope] = useState<ShareScope>(image.shareScope);
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
    setConfirmDelete(false);
    setError(null);
  }, [image]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateImageMeta(image.path, { title, altText, description, shareScope });
      onSaved({
        ...image,
        title: title.trim() || null,
        altText: altText.trim() || null,
        description: description.trim() || null,
        shareScope,
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

  const dirty =
    title !== (image.title ?? "") ||
    altText !== (image.altText ?? "") ||
    description !== (image.description ?? "") ||
    shareScope !== image.shareScope;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-gray-900" title={fileName(image.path)}>
            {fileName(image.path)}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          {/* Preview */}
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.altText ?? fileName(image.path)} className="h-full w-full object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyUrl}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy URL"}
              </button>
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink size={13} /> Open
              </a>
            </div>
            <p className="text-[11px] text-gray-400">
              {[image.path, prettySize(image.size)].filter(Boolean).join(" · ")}
            </p>
          </div>

          {/* Metadata form */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Spring hero banner"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Alt text <span className="font-normal text-gray-400">— for screen readers & fallback</span>
              </label>
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe the image"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Notes, usage guidance, source…"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Sharing</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShareScope("internal")}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    shareScope === "internal"
                      ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Lock size={14} className="mt-0.5 shrink-0 text-gray-500" />
                  <span>
                    <span className="block text-xs font-medium text-gray-900">Internal only</span>
                    <span className="block text-[11px] text-gray-400">Not shown to reps</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareScope("third_party")}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    shareScope === "third_party"
                      ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Globe size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>
                    <span className="block text-xs font-medium text-gray-900">Safe for 3rd party</span>
                    <span className="block text-[11px] text-gray-400">Shared on rep-group portal</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Delete permanently?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
