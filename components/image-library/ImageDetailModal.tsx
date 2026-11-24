"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Trash2, Copy, Check, ExternalLink, ChevronDown } from "lucide-react";
import { updateImageMeta, deleteImage, getImageUsage, trackUnsplashUse } from "./api";
import { displayName, fileName } from "./format";
import type { ImageUsage, LibraryImage, ShareScope } from "./types";

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fieldClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700";

const LiveTag = () => (
  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Live</span>
);
const QuietTag = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{children}</span>
);

/** One short line for the delete confirmation: "3 products, 1 website page". */
function usageSummary(u: ImageUsage): string {
  const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  return [
    count(u.products.length, "product", "products"),
    count(u.pages.length + u.sections.length, "website page", "website pages"),
    count(u.blogPosts.length, "blog post", "blog posts"),
    count(u.emails.length, "email", "emails"),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Everywhere FMG knows the image is used. */
function UsageList({ usage, error }: { usage: ImageUsage | null; error: string | null }) {
  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (!usage) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Checking…
      </p>
    );
  }
  if (!usage.inUse) {
    return (
      <p className="text-[15px] text-gray-600">
        Not on any product, website page, blog post or email. A link pasted somewhere outside FMG can&apos;t be seen
        here.
      </p>
    );
  }
  const row = "flex items-center justify-between gap-3 py-1.5 text-[15px] text-gray-900";
  return (
    <div className="space-y-3">
      {usage.liveOnSite ? (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
          Shoppers can see this image on the live site right now.
        </p>
      ) : null}
      {usage.products.length ? (
        <div>
          <div className="text-sm font-medium text-gray-500">
            {usage.products.length} {usage.products.length === 1 ? "product" : "products"}
          </div>
          <ul className="max-h-44 divide-y divide-gray-100 overflow-y-auto">
            {usage.products.map((p) => (
              <li key={p.part} className={row}>
                <Link href={`/products/${encodeURIComponent(p.part)}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0">
                  {p.viaFragrance ? <QuietTag>via {p.viaFragrance}</QuietTag> : null}
                  {p.live ? <LiveTag /> : <QuietTag>Not on a storefront</QuietTag>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {usage.fragrances.length ? (
        <div className="text-[15px] text-gray-900">
          <span className="text-sm font-medium text-gray-500">Shared with every product of: </span>
          {usage.fragrances.map((f) => f.fragrance).join(", ")}
        </div>
      ) : null}
      {usage.pages.length + usage.sections.length ? (
        <div>
          <div className="text-sm font-medium text-gray-500">Website</div>
          <ul className="divide-y divide-gray-100">
            {usage.pages.map((p) => (
              <li key={`${p.brand}/${p.slug}`} className={row}>
                <span className="min-w-0 truncate">
                  {p.brand} · {p.slug} page
                </span>
                <span className="shrink-0">{p.live ? <LiveTag /> : <QuietTag>Draft only</QuietTag>}</span>
              </li>
            ))}
            {usage.sections.map((w) => (
              <li key={`${w.brand}/${w.name}`} className={row}>
                <span className="min-w-0 truncate">
                  {w.brand ? `${w.brand} · ` : ""}
                  {w.name} (saved section)
                </span>
                <span className="shrink-0">{w.live ? <LiveTag /> : <QuietTag>Draft only</QuietTag>}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {usage.blogPosts.length ? (
        <div>
          <div className="text-sm font-medium text-gray-500">Blog</div>
          <ul className="divide-y divide-gray-100">
            {usage.blogPosts.map((b) => (
              <li key={b.id} className={row}>
                <span className="min-w-0 truncate">{b.title}</span>
                <span className="shrink-0">{b.live ? <LiveTag /> : <QuietTag>Not published</QuietTag>}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {usage.emails.length ? (
        <div>
          <div className="text-sm font-medium text-gray-500">Email templates</div>
          <ul className="divide-y divide-gray-100">
            {usage.emails.map((t) => (
              <li key={t.id} className={row}>
                <span className="min-w-0 truncate">{t.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
  const [usage, setUsage] = useState<ImageUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Where this image is used — shown beside it, and spelled out before a delete.
  useEffect(() => {
    setUsage(null);
    setUsageError(null);
    if (image.source === "unsplash") return;
    let stale = false;
    getImageUsage(image.path)
      .then((u) => {
        if (!stale) setUsage(u);
      })
      .catch((e) => {
        if (!stale) setUsageError(e instanceof Error ? e.message : "Couldn't check where this image is used.");
      });
    return () => {
      stale = true;
    };
  }, [image.path, image.source]);

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
      // `force` only once the usage list is on screen and they confirmed
      // against it; if the check failed, the server refuses an in-use image.
      await deleteImage(image.path, !!usage);
      onDeleted(image.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete image.");
      setDeleting(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(image.url);
      if (image.downloadLocation) void trackUnsplashUse(image.downloadLocation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  const isProduct = image.source === "product";
  const isUnsplash = image.source === "unsplash";

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

          {isUnsplash ? (
            // Unsplash photos live on Unsplash — read-only here.
            <div className="space-y-5">
              {image.description || image.altText ? (
                <p className="text-[15px] leading-relaxed text-gray-700">{image.description || image.altText}</p>
              ) : null}
              {image.credit ? (
                <p className="text-[15px] text-gray-600">
                  Photo by{" "}
                  <a href={image.credit.profileUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline">
                    {image.credit.name}
                  </a>{" "}
                  on{" "}
                  <a href={image.credit.unsplashUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline">
                    Unsplash
                  </a>
                </p>
              ) : null}
              <div>
                <div className={labelClass}>Folder</div>
                <div className="text-[15px] text-gray-900">{currentFolderLabel}</div>
              </div>
              <p className="text-sm leading-relaxed text-gray-500">
                This photo lives in your Unsplash collection — change or remove it on unsplash.com. Using it in an
                email, blog post or page? Pick it from the image picker&apos;s Unsplash tab, which credits the
                photographer automatically. If you paste the link somewhere else, credit them like the line above.
              </p>
              {image.credit ? (
                <a
                  href={image.credit.unsplashUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[15px] font-medium text-white hover:bg-gray-700"
                >
                  View on Unsplash <ExternalLink size={16} />
                </a>
              ) : null}
            </div>
          ) : isProduct ? (
            // Product photos come from the catalog — details are edited on the product page.
            <div className="space-y-5">
              <p className="text-[15px] leading-relaxed text-gray-600">
                This is a product photo. To take it off one product, or change its details, open that product&apos;s
                page. Deleting it here removes it from every product below.
              </p>
              <div>
                <div className={labelClass}>Folder</div>
                <div className="text-[15px] text-gray-900">{currentFolderLabel}</div>
              </div>
              <div>
                <div className={labelClass}>Where it&apos;s used</div>
                <UsageList usage={usage} error={usageError} />
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

              <div>
                <div className={labelClass}>Where it&apos;s used</div>
                <UsageList usage={usage} error={usageError} />
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
        {!isUnsplash && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="max-w-md text-[15px] text-gray-700">
                  {usage?.inUse
                    ? `This is used by ${usageSummary(usage) || "a fragrance"}${usage.liveOnSite ? ", and is live on the site" : ""}. Deleting removes it from all of them and can't be undone.`
                    : usage
                      ? "Delete this image for good? This can't be undone."
                      : "Delete this image for good? (Couldn't confirm where it's used, so an image in use won't be deleted.)"}
                </span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-[15px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {usage?.inUse ? "Delete everywhere" : "Delete"}
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

            {!isProduct && (
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-[15px] font-semibold text-white hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-500"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Save changes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
