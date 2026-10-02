"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Trash2, Upload, X, ZoomIn } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadMediaKitAsset } from "@/lib/mediaKit/uploadMediaKitAsset";
import { DeleteConfirmModal } from "@/components/marketing/media-kit/components/modalSections/DeleteConfirmModal";

export type PhotoTag = "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";

export const PHOTO_TAGS: { tag: PhotoTag; label: string }[] = [
  { tag: "front", label: "Front" },
  { tag: "benefits", label: "Benefits" },
  { tag: "lifestyle", label: "Lifestyle" },
  { tag: "ingredients", label: "Ingredients" },
  { tag: "fragrance", label: "Fragrance" },
  { tag: "other", label: "Other" },
];

/** Tags every product should have at least one photo for ("Other" is optional). */
const REQUIRED: PhotoTag[] = ["front", "benefits", "lifestyle", "ingredients", "fragrance"];

export type ProductPhoto = { id: string; tag: string; path: string; url: string | null };

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * One place to manage every photo of a product: a single grid, each photo
 * tagged Front / Benefits / Lifestyle / Ingredients / Fragrance / Other.
 * Re-tagging only changes `media_kit_assets.asset_type` (the file and its URL
 * never move); the storefronts use the tag to order the gallery.
 */
export default function ProductPhotos({
  part,
  photos,
  onChanged,
}: {
  part: string;
  photos: ProductPhoto[];
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<PhotoTag | "all">("all");
  /** Tag changes shown immediately while the save runs. */
  const [pendingTags, setPendingTags] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tagged = useMemo(
    () => photos.map((p) => ({ ...p, tag: pendingTags[p.id] ?? p.tag })),
    [photos, pendingTags],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of tagged) c[p.tag] = (c[p.tag] ?? 0) + 1;
    return c;
  }, [tagged]);

  const missing = REQUIRED.filter((t) => !counts[t]);
  // New uploads default to the first tag still missing a photo.
  const [uploadTag, setUploadTag] = useState<PhotoTag | null>(null);
  const tagForUpload: PhotoTag = uploadTag ?? (filter !== "all" ? filter : missing[0] ?? "other");

  const order = (t: string) => {
    const i = PHOTO_TAGS.findIndex((x) => x.tag === t);
    return i === -1 ? PHOTO_TAGS.length : i;
  };
  const shown = tagged
    .filter((p) => filter === "all" || p.tag === filter)
    .sort((a, b) => order(a.tag) - order(b.tag));

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) await uploadMediaKitAsset({ file, part, assetType: tagForUpload });
      onChanged();
    } catch (e) {
      console.error("Upload failed", e);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function retag(photo: ProductPhoto, tag: string) {
    setPendingTags((m) => ({ ...m, [photo.id]: tag }));
    setError(null);
    const res = await fetch("/api/products/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id: photo.id, assetType: tag }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Couldn't change the tag.");
      setPendingTags((m) => {
        const next = { ...m };
        delete next[photo.id];
        return next;
      });
      return;
    }
    onChanged();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: storageError } = await supabase.storage.from("media-kit").remove([deleteTarget.path]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase.from("media_kit_assets").delete().eq("id", deleteTarget.id);
      if (dbError) throw dbError;
      onChanged();
    } catch (e) {
      console.error("Delete failed", e);
      setError("Couldn't delete the photo.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tag checklist — doubles as the filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              All photos <span className="ml-1 tabular-nums opacity-70">{photos.length}</span>
            </button>
            {PHOTO_TAGS.map(({ tag, label }) => {
              const n = counts[tag] ?? 0;
              const needed = REQUIRED.includes(tag) && n === 0;
              return (
                <button
                  key={tag}
                  onClick={() => setFilter(tag)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    filter === tag
                      ? "bg-gray-900 text-white"
                      : needed
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                  title={needed ? `No ${label.toLowerCase()} photo yet` : undefined}
                >
                  {n > 0 && filter !== tag ? <Check size={12} className="text-emerald-600" /> : null}
                  {label}
                  <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Tag as
              <select
                value={tagForUpload}
                onChange={(e) => setUploadTag(e.target.value as PhotoTag)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                {PHOTO_TAGS.map(({ tag, label }) => (
                  <option key={tag} value={tag}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Add photos
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {missing.length > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            Still needed: {missing.map((t) => PHOTO_TAGS.find((x) => x.tag === t)?.label).join(", ")}
          </p>
        ) : (
          <p className="mt-3 text-xs text-emerald-700">Every photo type is covered.</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      {/* One grid for every photo; drop files anywhere on it to upload */}
      <div
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={clsx(
          "rounded-xl border bg-white p-4 transition",
          dragOver ? "border-violet-400 ring-4 ring-violet-100" : "border-gray-200",
        )}
      >
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400">
            <Upload size={30} strokeWidth={1.5} />
            <p className="text-sm font-medium text-gray-600">
              {filter === "all"
                ? "No photos yet"
                : `No ${PHOTO_TAGS.find((x) => x.tag === filter)?.label.toLowerCase()} photos yet`}
            </p>
            <p className="text-xs">Drag photos here or use Add photos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <div key={p.id} className="group">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-50">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={`${p.tag} photo`}
                      className="h-full w-full cursor-zoom-in object-contain p-2"
                      onClick={() => setLightbox(p.url)}
                    />
                  ) : null}
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => p.url && setLightbox(p.url)}
                      className="rounded-full bg-white/95 p-1.5 shadow-sm hover:bg-white"
                      title="View full size"
                    >
                      <ZoomIn size={13} className="text-gray-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="rounded-full bg-white/95 p-1.5 shadow-sm hover:bg-white"
                      title="Delete photo"
                    >
                      <Trash2 size={13} className="text-red-500" />
                    </button>
                  </div>
                </div>
                <select
                  value={p.tag}
                  onChange={(e) => void retag(p, e.target.value)}
                  aria-label="Photo tag"
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {!PHOTO_TAGS.some((x) => x.tag === p.tag) && <option value={p.tag}>{p.tag}</option>}
                  {PHOTO_TAGS.map(({ tag, label }) => (
                    <option key={tag} value={tag}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 transition hover:bg-white/20"
            aria-label="Close"
          >
            <X size={20} className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal loading={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}
