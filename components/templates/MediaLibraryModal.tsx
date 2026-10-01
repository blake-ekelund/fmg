"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Upload, Loader2, Image as ImageIcon, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadEmailImage } from "./uploadEmailImage";
import UnsplashPanel, { type UnsplashPick } from "./UnsplashPanel";
import { displayName } from "@/components/image-library/format";
import type { LibraryFolder, LibraryImage } from "@/components/image-library/types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen image's URL; the parent closes the modal. Unsplash
   *  picks also carry their alt text and the photographer credit to show. */
  onSelect: (url: string, unsplash?: UnsplashPick) => void;
  /** Image Library inbox new uploads land in when no folder is picked. */
  inbox?: string;
  /** Replaces the email resize-and-upload (the blog keeps full resolution). */
  uploader?: (file: File, folder: string) => Promise<{ url: string } | { error: string }>;
  /** Hint under the empty state; defaults to the email wording. */
  emptyHint?: string;
};

const ALL = "";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parentOf(id: string): string | null {
  const i = id.lastIndexOf("/");
  return i === -1 ? null : id.slice(0, i);
}

function within(id: string, f: string): boolean {
  return id === f || id.startsWith(`${f}/`);
}

export default function MediaLibraryModal({
  open,
  onClose,
  onSelect,
  inbox = "email-uploads",
  uploader,
  emptyHint,
}: Props) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  /** Folder being browsed — and where uploads go. "" = all library images. */
  const [folder, setFolder] = useState(ALL);
  const [tab, setTab] = useState<"library" | "unsplash">("library");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchLibrary() {
    const res = await fetch("/api/email/images", { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Couldn't load images.");
    return { images: (json.images ?? []) as LibraryImage[], folders: (json.folders ?? []) as LibraryFolder[] };
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuery("");
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const lib = await fetchLibrary();
        if (cancelled) return;
        setImages(lib.images);
        setFolders(lib.folders);
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
    try {
      const lib = await fetchLibrary();
      setImages(lib.images);
      setFolders(lib.folders);
    } catch {
      /* keep what's shown */
    }
  }

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const pathName = (id: string) => {
    const parts: string[] = [];
    for (let p: string | null = id; p; p = parentOf(p)) parts.unshift(byId.get(p)?.name ?? p);
    return parts.join(" › ");
  };

  // Library folders (inboxes first) + each brand's product folder; product
  // subfolders would be hundreds of options, search covers those.
  const options = useMemo(
    () =>
      folders
        .filter((f) => (f.id.startsWith("~") ? parentOf(f.id) === null : f.id !== "root"))
        .sort(
          (a, b) =>
            Number(b.kind === "inbox") - Number(a.kind === "inbox") ||
            Number(a.readOnly) - Number(b.readOnly) ||
            pathName(a.id).localeCompare(pathName(b.id)),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders, byId],
  );

  const current = folder ? byId.get(folder) : undefined;
  // Uploads go into the folder being browsed when it can take them, else the inbox.
  const uploadTo = current && !current.readOnly && !current.id.startsWith("~") ? current.id : inbox;
  const uploadToName = byId.get(uploadTo)?.name ?? pathName(uploadTo);

  // Resize + upload each file, then use the first one (or refresh on error).
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let firstUrl: string | null = null;
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      const res = uploader ? await uploader(file, uploadTo) : await uploadEmailImage(file, uploadTo);
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
  const filtered = images.filter((i) => {
    if (folder) {
      if (!within(i.folder, folder)) return false;
    } else if (i.source !== "library" && !q) {
      // "All folders" lists our own images; product photos come up in search
      // or under their brand folder.
      return false;
    }
    if (!q) return true;
    return `${displayName(i)} ${i.altText ?? ""} ${pathName(i.folder)}`.toLowerCase().includes(q);
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Choose an image</h2>
          <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5 text-sm font-medium">
            {(["library", "unsplash"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 transition ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t === "library" ? "Our library" : "Unsplash"}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          {tab === "library" && (
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              aria-label="Folder"
              className="max-w-[15rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value={ALL}>All folders</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {pathName(f.id)}
                </option>
              ))}
            </select>
          )}
          <div className="relative min-w-[160px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "library" ? "Search images…" : "Search descriptions…"}
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          {tab === "library" && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={`Saves to ${uploadToName} in the Image Library`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </button>
          )}
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
          {tab === "library" && (
            <p className="w-full text-xs text-gray-500">
              New uploads save to <span className="font-medium text-gray-700">{uploadToName}</span>
              {folder === ALL || uploadTo === inbox ? " — pick a folder above to file them somewhere else." : "."}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "unsplash" ? (
            <UnsplashPanel query={query} onSelect={onSelect} />
          ) : error ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : null}
          {tab === "unsplash" ? null : loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Loading images…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-600">
                {q ? "No matches" : folder ? "This folder is empty" : "No images yet"}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {q
                  ? "Try a different search."
                  : (emptyHint ?? "Upload one to get started — it'll be resized for email automatically.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.slice(0, 200).map((img) => (
                <button
                  key={img.path}
                  onClick={() => onSelect(img.url)}
                  title={displayName(img)}
                  className="group overflow-hidden rounded-xl border border-gray-200 text-left transition hover:border-violet-400 hover:ring-2 hover:ring-violet-200"
                >
                  <div className="flex aspect-square items-center justify-center bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.altText ?? displayName(img)}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="truncate border-t border-gray-100 px-2 py-1.5 text-xs text-gray-600">
                    {displayName(img)}
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "library" && !loading && filtered.length > 200 && (
            <p className="mt-4 text-center text-xs text-gray-500">
              Showing 200 of {filtered.length} — search or pick a folder to narrow it down.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
