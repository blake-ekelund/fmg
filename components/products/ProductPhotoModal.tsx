"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { PHOTO_TAGS } from "./photoTags";

export type PhotoDetails = {
  title: string | null;
  altText: string | null;
  description: string | null;
  tags: string[];
};

const fieldClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700";

/**
 * Click-a-photo editor on the product page — same shape as the Image
 * Library's detail modal: big preview, then title, photo type, free-form
 * tags, alt text and description.
 */
export default function ProductPhotoModal({
  url,
  fileName,
  productName,
  type,
  details,
  onClose,
  onSave,
  onDelete,
}: {
  url: string | null;
  fileName: string;
  productName: string;
  type: string;
  details: PhotoDetails;
  onClose: () => void;
  onSave: (patch: { assetType?: string } & Partial<PhotoDetails>) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(details.title ?? "");
  const [altText, setAltText] = useState(details.altText ?? "");
  const [description, setDescription] = useState(details.description ?? "");
  const [tags, setTags] = useState<string[]>(details.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [photoType, setPhotoType] = useState(type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  const typeLabel = PHOTO_TAGS.find((x) => x.tag === photoType)?.label ?? photoType;
  const fallbackTitle = `${productName} — ${typeLabel.toLowerCase()}`;
  const dirty =
    title !== (details.title ?? "") ||
    altText !== (details.altText ?? "") ||
    description !== (details.description ?? "") ||
    photoType !== type ||
    tags.join("|") !== details.tags.join("|") ||
    tagDraft.trim() !== "";

  async function save() {
    setSaving(true);
    setError(null);
    const finalTags = tagDraft.trim() && !tags.includes(tagDraft.trim().toLowerCase())
      ? [...tags, tagDraft.trim().toLowerCase()]
      : tags;
    try {
      await onSave({
        ...(photoType !== type ? { assetType: photoType } : {}),
        title,
        altText,
        description,
        tags: finalTags,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes.");
      setSaving(false);
    }
  }

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-5">
          <h2 className="truncate text-xl font-semibold text-gray-900" title={fileName}>
            {title.trim() || fallbackTitle}
          </h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto px-6 pb-6 pt-3 md:grid-cols-[3fr_2fr]">
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gray-100 md:aspect-[4/3]">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={altText || fallbackTitle} className="h-full w-full object-contain p-3" />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-[15px] font-medium text-white hover:bg-gray-700"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Link copied" : "Copy link"}
              </button>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-[15px] font-medium text-gray-800 hover:bg-gray-50"
                >
                  <ExternalLink size={16} /> Open full size
                </a>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className={labelClass}>Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={fallbackTitle} className={fieldClass} />
            </div>

            <div>
              <label className={labelClass}>Photo type</label>
              <select value={photoType} onChange={(e) => setPhotoType(e.target.value)} className={fieldClass}>
                {!PHOTO_TAGS.some((x) => x.tag === photoType) && <option value={photoType}>{photoType}</option>}
                {PHOTO_TAGS.map(({ tag, label }) => (
                  <option key={tag} value={tag}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-2.5 py-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-800">
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      className="rounded-full text-gray-400 hover:text-gray-700"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagDraft);
                    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                      setTags((prev) => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => tagDraft.trim() && addTag(tagDraft)}
                  placeholder={tags.length ? "Add tag…" : "e.g. hero, holiday, model"}
                  className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-[15px] focus:outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Press Enter or comma to add a tag.</p>
            </div>

            <div>
              <label className={labelClass}>Alt text</label>
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder={`Describe the photo, e.g. "${productName} bottle on a marble counter"`}
                className={fieldClass}
              />
            </div>

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
          </div>
        </div>

        {error && <div className="mx-6 mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[15px] text-rose-700">{error}</div>}

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[15px] font-medium text-gray-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-[15px] font-semibold text-white hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
