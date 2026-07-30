"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  Search,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Lock,
} from "lucide-react";
import { uploadEmailImage } from "@/components/templates/uploadEmailImage";
import { listImages } from "./api";
import ImageDetailModal from "./ImageDetailModal";
import type { LibraryImage, ShareScope } from "./types";

function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  // Uploads are prefixed with a timestamp (e.g. 1699-hero.jpg) — drop it for display.
  return base.replace(/^\d+-/, "");
}

/** The top-level bucket folder an image lives in (images, sections, …). */
function folderOf(path: string): string {
  return path.includes("/") ? path.split("/")[0] : "root";
}

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ScopeFilter = "all" | ShareScope;

export default function ImageLibraryPage() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setImages(await listImages());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load images.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      const res = await uploadEmailImage(file, "images");
      if ("error" in res) lastError = res.error;
    }
    setUploading(false);
    if (lastError) setError(lastError);
    await load();
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  const folders = useMemo(() => {
    const set = new Set(images.map((i) => folderOf(i.path)));
    return ["all", ...Array.from(set).sort()];
  }, [images]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return images.filter((i) => {
      if (folder !== "all" && folderOf(i.path) !== folder) return false;
      if (scope !== "all" && i.shareScope !== scope) return false;
      if (q) {
        const hay = `${fileName(i.path)} ${i.title ?? ""} ${i.altText ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [images, query, folder, scope]);

  const sharedCount = useMemo(
    () => images.filter((i) => i.shareScope === "third_party").length,
    [images],
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Image Library</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Public-facing brand images hosted in the{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">email-assets</code>{" "}
            bucket — the same photos, logos, and graphics used across email
            templates. Tag each with a title, alt text, and description, and mark
            the ones reps may reuse as safe for 3rd-party sharing.
          </p>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename, title, alt…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Sharing filter */}
          <div className="flex gap-1.5">
            {([
              { key: "all", label: "All" },
              { key: "third_party", label: "3rd party" },
              { key: "internal", label: "Internal" },
            ] as { key: ScopeFilter; label: string }[]).map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  scope === s.key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {!loading && (
            <span className="ml-auto text-xs text-gray-400 tabular-nums">
              {filtered.length} of {images.length} · {sharedCount} shared
            </span>
          )}
        </div>

        {/* Folder filter */}
        {folders.length > 2 && (
          <div className="flex flex-wrap gap-1.5">
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  folder === f
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "All folders" : f}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-gray-200 bg-white/60">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ImageIcon size={24} className="text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            {images.length === 0 ? "No images yet" : "No matches"}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm text-center">
            {images.length === 0
              ? "Upload one to get started — it'll be resized for email automatically and hosted at a public URL."
              : "Try a different search, folder, or sharing filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((img) => (
            <button
              key={img.path}
              onClick={() => setSelected(img)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition hover:border-gray-300 hover:shadow-sm"
            >
              <div className="relative flex aspect-square items-center justify-center bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.altText ?? fileName(img.path)}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />

                {/* Sharing badge */}
                <span
                  className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    img.shareScope === "third_party"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                  title={img.shareScope === "third_party" ? "Shared on rep portal" : "Internal only"}
                >
                  {img.shareScope === "third_party" ? <Globe size={10} /> : <Lock size={10} />}
                  {img.shareScope === "third_party" ? "3rd party" : "Internal"}
                </span>

                {/* Hover actions */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/40 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyUrl(img.url);
                    }}
                    title="Copy public URL"
                    className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-white"
                  >
                    {copied === img.url ? (
                      <>
                        <Check size={12} className="text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </span>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open in new tab"
                    className="inline-flex items-center rounded-lg bg-white/95 p-1.5 text-gray-700 shadow-sm hover:bg-white"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div className="border-t border-gray-100 px-2.5 py-2">
                <div className="truncate text-xs font-medium text-gray-700" title={img.title ?? fileName(img.path)}>
                  {img.title || fileName(img.path)}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-gray-400">
                  <span className="truncate">{folderOf(img.path)}</span>
                  <span className="shrink-0 tabular-nums">{prettySize(img.size)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ImageDetailModal
          image={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setImages((prev) => prev.map((i) => (i.path === updated.path ? updated : i)));
            setSelected(updated);
          }}
          onDeleted={(path) => {
            setImages((prev) => prev.filter((i) => i.path !== path));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
