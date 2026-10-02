"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadMediaKitAsset } from "@/lib/mediaKit/uploadMediaKitAsset";
import { DeleteConfirmModal } from "@/components/marketing/media-kit/components/modalSections/DeleteConfirmModal";
import ProductPhotoModal, { type PhotoDetails } from "./ProductPhotoModal";
import { PHOTO_TAGS, REQUIRED_PHOTO_TAGS, type PhotoTag } from "./photoTags";

export type ProductPhoto = {
  id: string;
  tag: string;
  path: string;
  url: string | null;
  /** Drag order (null = unordered → sorted by type after the ordered ones). */
  sortOrder?: number | null;
};

/** dataTransfer type for a photo being dragged to a new position. */
const DRAG_TYPE = "application/x-fmg-product-photo";

const NO_DETAILS: PhotoDetails = { title: null, altText: null, description: null, tags: [] };

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function patchPhoto(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/products/photos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Couldn't save the photo.");
  }
}

/**
 * One place to manage every photo of a product: a single grid, each photo
 * typed Front / Benefits / Lifestyle / Ingredients / Fragrance / Other.
 * Click a photo to edit its title, type, tags, alt text and description
 * (like the Image Library); drag photos (All view) to set the gallery order,
 * which the storefronts follow — first photo leads. Nothing here moves a
 * file or changes its URL.
 */
export default function ProductPhotos({
  part,
  productName,
  photos,
  onChanged,
}: {
  part: string;
  productName: string;
  photos: ProductPhoto[];
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<PhotoTag | "all">("all");
  /** Type changes shown immediately while the save runs. */
  const [pendingTags, setPendingTags] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<Record<string, PhotoDetails>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadTag, setUploadTag] = useState<PhotoTag | null>(null);
  /** Order just set by dragging, shown until the reloaded photos reflect it. */
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Title / alt / description / tags per photo (server-side, see the API).
  const loadDetails = useCallback(async () => {
    const res = await fetch(`/api/products/photos?part=${encodeURIComponent(part)}`, { headers: await authHeader() });
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as { photos?: Record<string, PhotoDetails> };
    setDetails(json.photos ?? {});
  }, [part]);

  const photoIds = photos.map((p) => p.id).join(",");
  const savedOrder = photos.map((p) => `${p.id}:${p.sortOrder ?? ""}`).join(",");
  useEffect(() => {
    // Saved positions arrived (or photos changed) — drop the optimistic order.
    setLocalOrder(null);
  }, [savedOrder]);
  useEffect(() => {
    void loadDetails();
  }, [loadDetails, photoIds]);

  const typed = useMemo(
    () => photos.map((p) => ({ ...p, tag: pendingTags[p.id] ?? p.tag })),
    [photos, pendingTags],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of typed) c[p.tag] = (c[p.tag] ?? 0) + 1;
    return c;
  }, [typed]);

  const missing = REQUIRED_PHOTO_TAGS.filter((t) => !counts[t]);
  // New uploads default to the filtered type, else the first type still missing.
  const tagForUpload: PhotoTag = uploadTag ?? (filter !== "all" ? filter : missing[0] ?? "other");

  const order = (t: string) => {
    const i = PHOTO_TAGS.findIndex((x) => x.tag === t);
    return i === -1 ? PHOTO_TAGS.length : i;
  };
  // Drag order when any photo has one (unordered photos after, by type),
  // else type order — the same rule the storefronts use.
  const custom = typed.some((p) => p.sortOrder != null);
  const sorted = [...typed].sort((a, b) => {
    if (localOrder) return localOrder.indexOf(a.id) - localOrder.indexOf(b.id);
    if (custom) {
      const d = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (d) return d;
    }
    return order(a.tag) - order(b.tag);
  });
  const shown = sorted.filter((p) => filter === "all" || p.tag === filter);
  const canReorder = filter === "all" && sorted.length > 1;

  async function dropPhoto(targetId: string, after: boolean) {
    const moving = draggingId;
    setDraggingId(null);
    setDropAt(null);
    if (!moving || moving === targetId) return;
    const ids = sorted.map((p) => p.id).filter((id) => id !== moving);
    const at = ids.indexOf(targetId) + (after ? 1 : 0);
    ids.splice(at, 0, moving);
    const before = sorted.map((p) => p.id);
    if (ids.join() === before.join()) return;
    setLocalOrder(ids);
    setError(null);
    try {
      await patchPhoto({ part, order: ids });
      onChanged();
    } catch (e) {
      setLocalOrder(null);
      setError(e instanceof Error ? e.message : "Couldn't save the new order.");
    }
  }
  const open = openId ? typed.find((p) => p.id === openId) ?? null : null;
  const typeLabel = (t: string) => PHOTO_TAGS.find((x) => x.tag === t)?.label ?? t;

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

  async function retype(photo: ProductPhoto, tag: string) {
    setPendingTags((m) => ({ ...m, [photo.id]: tag }));
    setError(null);
    try {
      await patchPhoto({ id: photo.id, assetType: tag });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the photo type.");
      setPendingTags((m) => {
        const next = { ...m };
        delete next[photo.id];
        return next;
      });
    }
  }

  async function saveDetails(photo: ProductPhoto, patch: { assetType?: string } & Partial<PhotoDetails>) {
    await patchPhoto({ id: photo.id, ...patch });
    setDetails((d) => ({
      ...d,
      [photo.id]: {
        title: patch.title?.trim() || null,
        altText: patch.altText?.trim() || null,
        description: patch.description?.trim() || null,
        tags: patch.tags ?? d[photo.id]?.tags ?? [],
      },
    }));
    if (patch.assetType) {
      setPendingTags((m) => ({ ...m, [photo.id]: patch.assetType! }));
      onChanged();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: storageError } = await supabase.storage.from("media-kit").remove([deleteTarget.path]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase.from("media_kit_assets").delete().eq("id", deleteTarget.id);
      if (dbError) throw dbError;
      // Its title / alt / description row goes too (best effort).
      await supabase.from("email_asset_meta").delete().eq("path", `media-kit:${deleteTarget.path}`);
      setOpenId(null);
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
      {/* Type checklist — doubles as the filter */}
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
              const needed = REQUIRED_PHOTO_TAGS.includes(tag) && n === 0;
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
          <p className="mt-3 text-xs text-amber-700">Still needed: {missing.map(typeLabel).join(", ")}</p>
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
        {sorted.length > 1 && (
          <p className="mb-3 text-xs text-gray-500">
            {canReorder
              ? "Drag photos to change their order — the first photo leads the storefront gallery."
              : "Switch to All photos to drag photos into a new order."}
          </p>
        )}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400">
            <Upload size={30} strokeWidth={1.5} />
            <p className="text-sm font-medium text-gray-600">
              {filter === "all" ? "No photos yet" : `No ${typeLabel(filter).toLowerCase()} photos yet`}
            </p>
            <p className="text-xs">Drag photos here or use Add photos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => {
              const d = details[p.id] ?? NO_DETAILS;
              return (
                <div
                  key={p.id}
                  className={clsx("group relative", draggingId === p.id && "opacity-40")}
                  draggable={canReorder}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, p.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(p.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropAt(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggingId || !Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const after = e.clientX > r.left + r.width / 2;
                    if (dropAt?.id !== p.id || dropAt.after !== after) setDropAt({ id: p.id, after });
                  }}
                  onDrop={(e) => {
                    if (!Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    void dropPhoto(p.id, dropAt?.id === p.id ? dropAt.after : false);
                  }}
                >
                  {dropAt?.id === p.id && draggingId !== p.id && (
                    <span
                      className={clsx(
                        "pointer-events-none absolute -top-1 bottom-0 z-10 w-1 rounded-full bg-violet-500",
                        dropAt.after ? "-right-2.5" : "-left-2.5",
                      )}
                    />
                  )}
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-50">
                    {canReorder && sorted[0]?.id === p.id && (
                      <span className="pointer-events-none absolute left-2 top-2 z-[1] rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
                        First
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenId(p.id)}
                      className="block h-full w-full transition hover:ring-2 hover:ring-gray-300 hover:ring-offset-2 rounded-xl"
                      aria-label={`Edit ${d.title || typeLabel(p.tag) + " photo"}`}
                    >
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt={d.altText || `${typeLabel(p.tag)} photo`}
                          draggable={false}
                          className={clsx("h-full w-full object-contain p-2", canReorder && "cursor-grab active:cursor-grabbing")}
                        />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100"
                      title="Delete photo"
                    >
                      <Trash2 size={13} className="text-red-500" />
                    </button>
                    {d.tags.length > 0 && (
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">
                        {d.tags.length} tag{d.tags.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 truncate text-sm font-medium text-gray-800" title={d.title ?? undefined}>
                    {d.title || <span className="font-normal text-gray-400">Untitled</span>}
                  </div>
                  <select
                    value={p.tag}
                    onChange={(e) => void retype(p, e.target.value)}
                    aria-label="Photo type"
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    {!PHOTO_TAGS.some((x) => x.tag === p.tag) && <option value={p.tag}>{p.tag}</option>}
                    {PHOTO_TAGS.map(({ tag, label }) => (
                      <option key={tag} value={tag}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <ProductPhotoModal
          key={open.id}
          url={open.url}
          fileName={open.path.split("/").pop() ?? open.path}
          productName={productName}
          type={open.tag}
          details={details[open.id] ?? NO_DETAILS}
          onClose={() => setOpenId(null)}
          onSave={(patch) => saveDetails(open, patch)}
          onDelete={() => {
            // The confirm dialog sits below this modal — close it first.
            setDeleteTarget(open);
            setOpenId(null);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal loading={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}
