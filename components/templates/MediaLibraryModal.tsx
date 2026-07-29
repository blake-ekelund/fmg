"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, Image as ImageIcon, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadEmailImage } from "./uploadEmailImage";

type Img = { path: string; url: string; size: number; updatedAt: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen image's public URL; the parent closes the modal. */
  onSelect: (url: string) => void;
  /** Bucket folder new uploads land in (e.g. "images", "section-bg"). */
  prefix?: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  // Uploads are prefixed with a timestamp (e.g. 1699-hero.jpg) — drop it for display.
  return base.replace(/^\d+-/, "");
}

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaLibraryModal({ open, onClose, onSelect, prefix = "images" }: Props) {
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuery("");
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/email/images", { headers: await authHeader() });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(json.error ?? "Couldn't load images.");
          return;
        }
        if (!cancelled) setImages((json.images ?? []) as Img[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load images.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function reload() {
    const res = await fetch("/api/email/images", { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setImages((json.images ?? []) as Img[]);
  }

  // Resize + upload each file, then use the first one (or refresh on error).
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let firstUrl: string | null = null;
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      const res = await uploadEmailImage(file, prefix);
      if ("error" in res) lastError = res.error;
      else if (!firstUrl) firstUrl = res.url;
    }
    setUploading(false);
    if (firstUrl) {
      onSelect(firstUrl);
      return;
    }
    if (lastError) setError(lastError);
    await reload();
  }

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q ? images.filter((i) => fileName(i.path).toLowerCase().includes(q)) : images;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
              <ImageIcon size={16} className="text-violet-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Image library</h2>
          </div>
          <div className="relative ml-2 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filenames…"
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-7 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X size={18} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Loading images…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-600">
                {images.length === 0 ? "No images yet" : "No matches"}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {images.length === 0 ? "Upload one to get started — it'll be resized for email automatically." : "Try a different search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((img) => (
                <button
                  key={img.path}
                  onClick={() => onSelect(img.url)}
                  title={`${fileName(img.path)}${img.size ? ` · ${prettySize(img.size)}` : ""}`}
                  className="group overflow-hidden rounded-xl border border-gray-200 text-left transition hover:border-violet-400 hover:ring-2 hover:ring-violet-200"
                >
                  <div className="flex aspect-square items-center justify-center bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={fileName(img.path)} className="h-full w-full object-contain" loading="lazy" />
                  </div>
                  <div className="truncate border-t border-gray-100 px-2 py-1 text-[10px] text-gray-500">
                    {fileName(img.path)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
