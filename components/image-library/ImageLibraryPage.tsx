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
  FolderPlus,
  Folder,
  FolderOpen,
  FolderInput,
  ChevronRight,
  ArrowLeft,
  Trash2,
  CheckSquare,
  Square,
  Link2,
} from "lucide-react";
import { uploadEmailImage } from "@/components/templates/uploadEmailImage";
import { listImages, createFolder, deleteFolder, refileImages } from "./api";
import ImageDetailModal from "./ImageDetailModal";
import type { LibraryImage, ShareScope } from "./types";

function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  // Uploads are prefixed with a timestamp (e.g. 1699-hero.jpg) — drop it for display.
  return base.replace(/^\d+-/, "");
}

/** Folders are stored slugged ("sassy-holiday-2026") — show them with spaces. */
function folderLabel(folder: string): string {
  return folder.replace(/[-_]+/g, " ");
}

/** Where uploads land when no specific folder is open. */
const DEFAULT_FOLDER = "images";
/** Old uploads at the bucket root — viewable, but nothing can be filed into it. */
const ROOT = "root";
/** dataTransfer type for library images being dragged onto a folder. */
const DRAG_TYPE = "application/x-fmg-library-images";

function prettySize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ScopeFilter = "all" | ShareScope;

/** Is this drag carrying library images (vs. files from the desktop)? */
function isImageDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DRAG_TYPE);
}
function isFileDrag(e: React.DragEvent): boolean {
  return !isImageDrag(e) && Array.from(e.dataTransfer.types).includes("Files");
}

export default function ImageLibraryPage() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  /** "all" = library home (folder tiles + every image); otherwise the open folder. */
  const [folder, setFolder] = useState<string>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
  const [storedFolders, setStoredFolders] = useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [moving, setMoving] = useState(false);
  /** Folder currently under the cursor during a drag. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Paths being dragged (null when no image drag is in progress). */
  const [dragging, setDragging] = useState<string[] | null>(null);
  /** Desktop files hovering over the page → show the upload overlay. */
  const [fileHover, setFileHover] = useState(false);
  const fileDragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listImages();
      setImages(res.images);
      setStoredFolders(res.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load images.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Uploads go into the open folder ("root" can't be targeted).
  const uploadTarget = folder !== "all" && folder !== ROOT ? folder : DEFAULT_FOLDER;

  async function handleUpload(files: FileList | File[] | null, target = uploadTarget) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      if (files && Array.from(files).length > 0) setError("Only image files can be uploaded.");
      return;
    }
    setUploading(true);
    setError(null);
    let lastError: string | null = null;
    let ok = 0;
    for (const file of list) {
      const res = await uploadEmailImage(file, target);
      if ("error" in res) lastError = res.error;
      else ok++;
    }
    setUploading(false);
    if (lastError) setError(lastError);
    if (ok) setNotice(`Uploaded ${ok} image${ok === 1 ? "" : "s"} to ${folderLabel(target)}.`);
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

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setFolderBusy(true);
    setError(null);
    try {
      const created = await createFolder(newFolderName);
      setStoredFolders((prev) => Array.from(new Set([...prev, created])).sort());
      setNewFolderName("");
      setNewFolderOpen(false);
      setNotice(`Created ${folderLabel(created)} — drag photos onto it to file them.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleDeleteFolder(f: string) {
    setFolderBusy(true);
    setError(null);
    try {
      await deleteFolder(f);
      setStoredFolders((prev) => prev.filter((x) => x !== f));
      if (folder === f) setFolder("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  function togglePick(path: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
    setMoveTo("");
  }

  /** Re-file images under a folder. A label change only — URLs never move. */
  async function moveImages(paths: string[], target: string) {
    const toMove = paths.filter((p) => images.find((i) => i.path === p)?.folder !== target);
    if (toMove.length === 0) return;
    setMoving(true);
    setError(null);
    try {
      await refileImages(toMove, target);
      const moved = new Set(toMove);
      setImages((prev) => prev.map((i) => (moved.has(i.path) ? { ...i, folder: target } : i)));
      setNotice(
        `Moved ${toMove.length} image${toMove.length === 1 ? "" : "s"} to ${folderLabel(target)}. Links are unchanged.`,
      );
      stopSelecting();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move images.");
    } finally {
      setMoving(false);
    }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function onImageDragStart(e: React.DragEvent, img: LibraryImage) {
    // Dragging a selected image carries the whole selection.
    const paths = picked.has(img.path) ? Array.from(picked) : [img.path];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "move";
    if (paths.length > 1) {
      const ghost = document.createElement("div");
      ghost.textContent = `Move ${paths.length} images`;
      ghost.style.cssText =
        "position:absolute;top:-1000px;padding:6px 12px;border-radius:9999px;background:#7c3aed;color:#fff;font:600 12px system-ui";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => ghost.remove(), 0);
    }
    setDragging(paths);
  }

  function folderDropProps(target: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!isImageDrag(e) && !isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = isImageDrag(e) ? "move" : "copy";
        if (dropTarget !== target) setDropTarget(target);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropTarget((t) => (t === target ? null : t));
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        setFileHover(false);
        fileDragDepth.current = 0;
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) {
          try {
            void moveImages(JSON.parse(raw) as string[], target);
          } catch {
            /* malformed payload — ignore */
          }
        } else if (e.dataTransfer.files.length) {
          void handleUpload(e.dataTransfer.files, target);
        }
      },
    };
  }

  // Desktop files dropped anywhere else on the page upload to the open folder.
  const pageDropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      fileDragDepth.current++;
      setFileHover(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
      if (fileDragDepth.current === 0) setFileHover(false);
    },
    onDragOver: (e: React.DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      fileDragDepth.current = 0;
      setFileHover(false);
      void handleUpload(e.dataTransfer.files);
    },
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  // Image count per folder; empty folders (only a placeholder) show 0.
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of storedFolders) counts.set(f, 0);
    for (const i of images) counts.set(i.folder, (counts.get(i.folder) ?? 0) + 1);
    return counts;
  }, [images, storedFolders]);

  const allFolders = useMemo(() => Array.from(folderCounts.keys()).sort(), [folderCounts]);

  // Folders an image can be filed into.
  const fileableFolders = useMemo(() => allFolders.filter((f) => f !== ROOT), [allFolders]);

  // Up to 4 recent thumbnails per folder for the tile mosaic.
  const folderThumbs = useMemo(() => {
    const m = new Map<string, LibraryImage[]>();
    for (const i of images) {
      const arr = m.get(i.folder) ?? [];
      if (arr.length < 4) arr.push(i);
      m.set(i.folder, arr);
    }
    return m;
  }, [images]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return images.filter((i) => {
      if (folder !== "all" && i.folder !== folder) return false;
      if (scope !== "all" && i.shareScope !== scope) return false;
      if (q) {
        const hay = `${fileName(i.path)} ${i.title ?? ""} ${i.altText ?? ""} ${folderLabel(i.folder)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [images, query, folder, scope]);

  const sharedCount = useMemo(
    () => images.filter((i) => i.shareScope === "third_party").length,
    [images],
  );

  const atHome = folder === "all";
  const openCount = atHome ? images.length : folderCounts.get(folder) ?? 0;

  return (
    <div
      className="relative px-4 md:px-8 py-6 md:py-8 space-y-6"
      {...pageDropProps}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
    >
      {/* Desktop-file drop overlay */}
      {fileHover && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-violet-600/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-violet-500 bg-white px-8 py-6 text-center shadow-lg">
            <Upload size={24} className="mx-auto mb-2 text-violet-600" />
            <div className="text-sm font-semibold text-gray-900">
              Drop to upload to {folderLabel(uploadTarget)}
            </div>
            <div className="mt-1 text-xs text-gray-500">Or drop onto a folder to upload there</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Image Library</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Brand photos, logos, and graphics used across emails and the blog.
            Organize them into folders by dragging, and mark the ones reps may
            reuse as safe for 3rd-party sharing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewFolderOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            <FolderPlus size={16} />
            New folder
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={`Uploads go into the "${folderLabel(uploadTarget)}" folder`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Upload to {folderLabel(uploadTarget)}
          </button>
        </div>
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

      {/* New folder */}
      {newFolderOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateFolder();
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3"
        >
          <Folder size={16} className="text-violet-600" />
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNewFolderOpen(false)}
            placeholder="Folder name, e.g. Sassy Holiday 2026"
            maxLength={60}
            className="min-w-[220px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button
            type="submit"
            disabled={folderBusy || !newFolderName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {folderBusy && <Loader2 size={13} className="animate-spin" />}
            Create
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(false)}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-white"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Breadcrumb (inside a folder) */}
      {!atHome && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFolder("all")}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <ArrowLeft size={14} /> All images
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold capitalize text-gray-900">
            <FolderOpen size={16} className="text-violet-600" />
            {folderLabel(folder)}
            <span className="font-normal text-gray-400 tabular-nums">· {openCount}</span>
          </span>
          {folder !== ROOT && openCount === 0 && (
            <button
              onClick={() => void handleDeleteFolder(folder)}
              disabled={folderBusy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={12} /> Delete empty folder
            </button>
          )}
        </div>
      )}

      {/* Folders */}
      {!loading && (
        atHome ? (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Folders</h2>
              <span className="text-[11px] text-gray-400">
                {dragging ? "Drop on a folder to move" : "Drag photos onto a folder to file them"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {allFolders.map((f) => {
                const thumbs = folderThumbs.get(f) ?? [];
                const count = folderCounts.get(f) ?? 0;
                const hot = dropTarget === f;
                const droppable = f !== ROOT;
                return (
                  <button
                    key={f}
                    onClick={() => setFolder(f)}
                    {...(droppable ? folderDropProps(f) : {})}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition ${
                      hot
                        ? "border-violet-500 ring-2 ring-violet-500 scale-[1.02] shadow-md"
                        : dragging && droppable
                          ? "border-violet-300 border-dashed"
                          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px bg-gray-100">
                      {thumbs.length === 0 ? (
                        <div className="col-span-2 row-span-2 flex items-center justify-center bg-gray-50">
                          <Folder size={32} className={hot ? "text-violet-500" : "text-gray-300"} />
                        </div>
                      ) : (
                        Array.from({ length: 4 }).map((_, idx) => {
                          const t = thumbs[idx];
                          return t ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={t.path}
                              src={t.url}
                              alt=""
                              draggable={false}
                              loading="lazy"
                              className="h-full w-full bg-gray-50 object-cover"
                            />
                          ) : (
                            <div key={idx} className="bg-gray-50" />
                          );
                        })
                      )}
                    </div>
                    {hot && (
                      <div className="absolute inset-0 flex items-center justify-center bg-violet-600/15">
                        <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow">
                          {dragging ? `Move here` : "Upload here"}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
                      <Folder size={14} className="shrink-0 text-violet-600" />
                      <span className="flex-1 truncate text-xs font-medium capitalize text-gray-800">
                        {folderLabel(f)}
                      </span>
                      <span className="text-[11px] tabular-nums text-gray-400">{count}</span>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={() => setNewFolderOpen(true)}
                className="flex aspect-auto min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 transition hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700"
              >
                <FolderPlus size={20} />
                New folder
              </button>
            </div>
          </section>
        ) : (
          // Inside a folder: a compact strip of the other folders, still drop targets.
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-gray-400">
              {dragging ? "Drop on a folder to move:" : "Folders:"}
            </span>
            {allFolders.map((f) => {
              const hot = dropTarget === f;
              const current = f === folder;
              const droppable = f !== ROOT && !current;
              return (
                <button
                  key={f}
                  onClick={() => setFolder(f)}
                  {...(droppable ? folderDropProps(f) : {})}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                    current
                      ? "bg-violet-600 text-white"
                      : hot
                        ? "bg-violet-100 text-violet-800 ring-2 ring-violet-500"
                        : dragging && droppable
                          ? "bg-white text-gray-700 ring-1 ring-violet-300"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Folder size={11} />
                  {folderLabel(f)}
                  <span className={`tabular-nums ${current ? "text-violet-200" : "text-gray-400"}`}>
                    {folderCounts.get(f) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {atHome && (
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">All images</h2>
        )}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={atHome ? "Search all images…" : `Search ${folderLabel(folder)}…`}
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
            {filtered.length} of {openCount} · {sharedCount} shared
          </span>
        )}

        <button
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            selecting ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <CheckSquare size={12} />
          {selecting ? "Done" : "Select"}
        </button>
      </div>

      {/* Bulk re-file bar */}
      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs">
          <span className="font-medium text-gray-700 tabular-nums">
            {picked.size === 0
              ? "Click images to select them"
              : `${picked.size} selected — drag them onto a folder, or`}
          </span>
          {filtered.length > 0 && (
            <button
              onClick={() =>
                setPicked((prev) =>
                  filtered.every((i) => prev.has(i.path))
                    ? new Set()
                    : new Set(filtered.map((i) => i.path)),
                )
              }
              className="rounded-lg px-2 py-1 font-medium text-violet-700 hover:bg-white"
            >
              {filtered.every((i) => picked.has(i.path)) ? "Clear" : `Select all ${filtered.length}`}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value="">Move to folder…</option>
              {fileableFolders.map((f) => (
                <option key={f} value={f}>
                  {folderLabel(f)}
                </option>
              ))}
            </select>
            <button
              onClick={() => void moveImages(Array.from(picked), moveTo)}
              disabled={moving || !moveTo || picked.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {moving ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />}
              Move
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <Link2 size={14} className="shrink-0" />
          {notice}
        </div>
      )}

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
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 bg-white/60">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ImageIcon size={24} className="text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            {images.length === 0
              ? "No images yet"
              : !atHome && openCount === 0
                ? "This folder is empty"
                : "No matches"}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm text-center">
            {images.length === 0 || (!atHome && openCount === 0)
              ? "Drag photos from your computer onto this page to upload them here, or drag existing images onto this folder from All images."
              : "Try a different search or sharing filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((img) => {
            const isPicked = selecting && picked.has(img.path);
            const isDragging = dragging?.includes(img.path) ?? false;
            return (
              <button
                key={img.path}
                draggable
                onDragStart={(e) => onImageDragStart(e, img)}
                onClick={() => (selecting ? togglePick(img.path) : setSelected(img))}
                className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-sm cursor-grab active:cursor-grabbing ${
                  isPicked
                    ? "border-violet-500 ring-2 ring-violet-500"
                    : "border-gray-200 hover:border-gray-300"
                } ${isDragging ? "opacity-40" : ""}`}
              >
                <div className="relative flex aspect-square items-center justify-center bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.altText ?? fileName(img.path)}
                    draggable={false}
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

                  {selecting && (
                    <span className="absolute right-2 top-2 rounded bg-white/95 text-violet-600 shadow-sm">
                      {isPicked ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                    </span>
                  )}

                  {/* Hover actions */}
                  <div
                    className={`absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/40 to-transparent p-2 opacity-0 transition ${
                      selecting ? "hidden" : "group-hover:opacity-100"
                    }`}
                  >
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
                      draggable={false}
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
                    <span className="inline-flex items-center gap-1 truncate capitalize">
                      <Folder size={10} className="shrink-0" />
                      {folderLabel(img.folder)}
                    </span>
                    <span className="shrink-0 tabular-nums">{prettySize(img.size)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ImageDetailModal
          image={selected}
          folders={fileableFolders}
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
