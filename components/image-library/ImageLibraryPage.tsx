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
  Trash2,
  CheckSquare,
  Square,
  Link2,
  Package,
} from "lucide-react";
import { uploadEmailImage } from "@/components/templates/uploadEmailImage";
import { listImages, createFolder, deleteFolder, refileImages } from "./api";
import ImageDetailModal from "./ImageDetailModal";
import type { LibraryFolder, LibraryImage, ShareScope } from "./types";

function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  // Uploads are prefixed with a timestamp (e.g. 1699-hero.jpg) — drop it for display.
  return base.replace(/^\d+-/, "");
}

/** Where uploads land when the open folder can't take them. */
const DEFAULT_FOLDER = "images";
/** Old uploads at the bucket root — viewable, but nothing can be filed into it. */
const ROOT = "root";
/** Must match MAX_FOLDER_DEPTH in /api/email/images. */
const MAX_FOLDER_DEPTH = 3;
/** dataTransfer type for library images being dragged onto a folder. */
const DRAG_TYPE = "application/x-fmg-library-images";

/** "sassy-holiday-2026" → "Sassy Holiday 2026" (fallback until the server names it). */
function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parentOf(id: string): string | null {
  const i = id.lastIndexOf("/");
  return i === -1 ? null : id.slice(0, i);
}

function depthOf(id: string): number {
  return id.split("/").length;
}

/** Is `id` the folder `f` itself or anywhere inside it? */
function within(id: string, f: string): boolean {
  return id === f || id.startsWith(`${f}/`);
}

/** Library folders accept uploads / filing; product folders and "root" don't. */
function writable(f: LibraryFolder | undefined): boolean {
  return !!f && !f.readOnly && !f.id.startsWith("~") && f.id !== ROOT;
}

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
  const [folderList, setFolderList] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  /** null = library home (top-level folders + every library image). */
  const [folder, setFolder] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
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
      setFolderList(res.folders);
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

  // ── Folder tree ──────────────────────────────────────────────────────────
  const folderMap = useMemo(() => new Map(folderList.map((f) => [f.id, f])), [folderList]);

  const nameOf = useCallback(
    (id: string) => folderMap.get(id)?.name ?? titleCase(id.split("/").pop() ?? id),
    [folderMap],
  );

  /** "Sassy holiday › Ads" — for pickers where the whole path matters. */
  const pathName = useCallback(
    (id: string) => {
      const parts: string[] = [];
      for (let p: string | null = id; p; p = parentOf(p)) parts.unshift(nameOf(p));
      return parts.join(" › ");
    },
    [nameOf],
  );

  const childrenOf = useCallback(
    (parent: string | null) =>
      folderList
        .filter((f) => parentOf(f.id) === parent)
        // Library folders first, product folders after, each alphabetical.
        .sort((a, b) => Number(a.readOnly) - Number(b.readOnly) || a.name.localeCompare(b.name)),
    [folderList],
  );

  // Count + thumbnails include everything nested below a folder.
  const folderStats = useMemo(() => {
    const stats = new Map<string, { count: number; thumbs: LibraryImage[] }>();
    for (const f of folderList) stats.set(f.id, { count: 0, thumbs: [] });
    for (const i of images) {
      for (let p: string | null = i.folder; p; p = parentOf(p)) {
        const s = stats.get(p) ?? { count: 0, thumbs: [] };
        s.count++;
        if (s.thumbs.length < 4) s.thumbs.push(i);
        stats.set(p, s);
      }
    }
    return stats;
  }, [images, folderList]);

  const current = folder ? folderMap.get(folder) : undefined;
  const canWriteHere = writable(current);
  const canNestHere = canWriteHere && !!folder && depthOf(folder) < MAX_FOLDER_DEPTH;
  // New folders go inside the open folder when it can hold one, else top level.
  const newFolderParent = canNestHere ? folder : null;
  // Uploads go into the open folder when it can take them.
  const uploadTarget = canWriteHere && folder ? folder : DEFAULT_FOLDER;

  const fileableFolders = useMemo(
    () =>
      folderList
        .filter(writable)
        .map((f) => f.id)
        .sort((a, b) => pathName(a).localeCompare(pathName(b))),
    [folderList, pathName],
  );

  // ── Actions ──────────────────────────────────────────────────────────────
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
    if (ok) setNotice(`Uploaded ${ok} image${ok === 1 ? "" : "s"} to ${pathName(target)}.`);
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
      const created = await createFolder(newFolderName, newFolderParent);
      setFolderList((prev) =>
        prev.some((f) => f.id === created)
          ? prev
          : [...prev, { id: created, name: newFolderName.trim(), readOnly: false }],
      );
      setNewFolderName("");
      setNewFolderOpen(false);
      setNotice(`Created ${pathName(created)} — drag photos onto it to file them.`);
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
      setFolderList((prev) => prev.filter((x) => x.id !== f));
      setFolder(parentOf(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  function openFolder(id: string | null) {
    setFolder(id);
    setQuery("");
    setNewFolderOpen(false);
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
    const toMove = paths.filter((p) => {
      const img = images.find((i) => i.path === p);
      return img && img.source === "library" && img.folder !== target;
    });
    if (toMove.length === 0) return;
    setMoving(true);
    setError(null);
    try {
      await refileImages(toMove, target);
      const moved = new Set(toMove);
      setImages((prev) => prev.map((i) => (moved.has(i.path) ? { ...i, folder: target } : i)));
      setNotice(
        `Moved ${toMove.length} image${toMove.length === 1 ? "" : "s"} to ${pathName(target)}. Links are unchanged.`,
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

  /** Drop handlers for a writable folder (tile or breadcrumb). */
  function folderDropProps(target: string) {
    if (!writable(folderMap.get(target))) return {};
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

  // ── What's on screen ─────────────────────────────────────────────────────
  const searching = query.trim() !== "";
  const subfolders = searching ? [] : childrenOf(folder);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return images.filter((i) => {
      if (q) {
        // Search reaches everything inside the open folder (or the whole library).
        if (folder && !within(i.folder, folder)) return false;
        const hay = `${fileName(i.path)} ${i.title ?? ""} ${i.altText ?? ""} ${pathName(i.folder)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (folder) {
        if (i.folder !== folder) return false;
      } else if (i.source !== "library") {
        // Home lists library images; product photos live in their folders.
        return false;
      }
      if (scope !== "all" && i.shareScope !== scope) return false;
      return true;
    });
  }, [images, query, folder, scope, pathName]);

  const pickable = filtered.filter((i) => i.source === "library");
  const folderTotal = folder ? folderStats.get(folder)?.count ?? 0 : images.length;
  const folderEmpty = !!folder && folderTotal === 0 && childrenOf(folder).length === 0;
  const crumbs: string[] = [];
  for (let p = folder; p; p = parentOf(p)) crumbs.unshift(p);

  function renderTile(f: LibraryFolder) {
    const stats = folderStats.get(f.id) ?? { count: 0, thumbs: [] };
    const hot = dropTarget === f.id;
    const droppable = writable(f);
    const isProduct = f.id.startsWith("~");
    return (
      <button
        key={f.id}
        onClick={() => openFolder(f.id)}
        {...folderDropProps(f.id)}
        className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition ${
          hot
            ? "border-violet-500 ring-2 ring-violet-500 scale-[1.02] shadow-md"
            : dragging && droppable
              ? "border-dashed border-violet-300"
              : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
        } ${dragging && !droppable ? "opacity-50" : ""}`}
      >
        <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px bg-gray-100">
          {stats.thumbs.length === 0 ? (
            <div className="col-span-2 row-span-2 flex items-center justify-center bg-gray-50">
              <Folder size={32} className={hot ? "text-violet-500" : "text-gray-300"} />
            </div>
          ) : (
            Array.from({ length: 4 }).map((_, idx) => {
              const t = stats.thumbs[idx];
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
        {isProduct && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shadow-sm">
            <Package size={10} /> Product photos
          </span>
        )}
        {hot && (
          <div className="absolute inset-0 flex items-center justify-center bg-violet-600/15">
            <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow">
              {dragging ? "Move here" : "Upload here"}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
          {isProduct ? (
            <Package size={14} className="shrink-0 text-amber-600" />
          ) : (
            <Folder size={14} className="shrink-0 text-violet-600" />
          )}
          <span className="flex-1 truncate text-xs font-medium text-gray-800" title={f.name}>
            {f.name}
          </span>
          <span className="text-[11px] tabular-nums text-gray-400">{stats.count}</span>
        </div>
      </button>
    );
  }

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
              Drop to upload to {pathName(uploadTarget)}
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
            Brand photos, logos, and graphics used across emails and the blog, plus
            every product photo from the catalog. Organize your own images into
            folders by dragging, and mark the ones reps may reuse as safe for
            3rd-party sharing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewFolderOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            <FolderPlus size={16} />
            {newFolderParent ? "New subfolder" : "New folder"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={`Uploads go into "${pathName(uploadTarget)}"`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            <span className="max-w-[16rem] truncate">Upload to {nameOf(uploadTarget)}</span>
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

      {/* Breadcrumb — every writable level is a drop target */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => openFolder(null)}
          className={`rounded-lg px-2 py-1 font-medium ${
            folder ? "text-gray-500 hover:bg-gray-100 hover:text-gray-800" : "text-gray-900"
          }`}
        >
          All images
        </button>
        {crumbs.map((c, idx) => {
          const last = idx === crumbs.length - 1;
          const hot = dropTarget === c;
          return (
            <span key={c} className="inline-flex items-center gap-1">
              <ChevronRight size={14} className="text-gray-300" />
              <button
                onClick={() => openFolder(c)}
                {...(last ? {} : folderDropProps(c))}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${
                  hot
                    ? "bg-violet-100 text-violet-800 ring-2 ring-violet-500"
                    : last
                      ? "font-semibold text-gray-900"
                      : "font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
              >
                {last && (c.startsWith("~") ? (
                  <Package size={15} className="text-amber-600" />
                ) : (
                  <FolderOpen size={15} className="text-violet-600" />
                ))}
                {nameOf(c)}
              </button>
            </span>
          );
        })}
        {folder && (
          <span className="ml-1 text-xs text-gray-400 tabular-nums">· {folderTotal}</span>
        )}
        {folder && current?.readOnly && current.id.startsWith("~") && (
          <span className="ml-2 text-xs text-gray-400">
            Product photos are managed on each product&apos;s page.
          </span>
        )}
        {folderEmpty && canWriteHere && (
          <button
            onClick={() => folder && void handleDeleteFolder(folder)}
            disabled={folderBusy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 size={12} /> Delete empty folder
          </button>
        )}
      </nav>

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
            placeholder={newFolderParent ? "Subfolder name, e.g. Instagram ads" : "Folder name, e.g. Sassy Holiday 2026"}
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
          <p className="w-full text-[11px] text-gray-500">
            {newFolderParent ? (
              <>
                Inside <span className="font-medium">{pathName(newFolderParent)}</span>.
              </>
            ) : (
              "At the top level of the library."
            )}
          </p>
        </form>
      )}

      {/* Folders */}
      {!loading && (subfolders.length > 0 || canNestHere || !folder) && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {folder ? "Subfolders" : "Folders"}
            </h2>
            <span className="text-[11px] text-gray-400">
              {dragging ? "Drop on a folder to move" : "Drag photos onto a folder to file them"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {subfolders.map(renderTile)}
            {(!folder || canNestHere) && (
              <button
                onClick={() => setNewFolderOpen(true)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 transition hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700"
              >
                <FolderPlus size={20} />
                {folder ? "New subfolder" : "New folder"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {searching ? "Results" : folder ? "Images" : "All library images"}
        </h2>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={folder ? `Search in ${nameOf(folder)}…` : "Search everything, incl. product photos…"}
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
          <span className="ml-auto text-xs text-gray-400 tabular-nums">{filtered.length} shown</span>
        )}

        {pickable.length > 0 && (
          <button
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              selecting ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <CheckSquare size={12} />
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      {/* Bulk re-file bar */}
      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs">
          <span className="font-medium text-gray-700 tabular-nums">
            {picked.size === 0
              ? "Click images to select them"
              : `${picked.size} selected — drag them onto a folder, or`}
          </span>
          {pickable.length > 0 && (
            <button
              onClick={() =>
                setPicked((prev) =>
                  pickable.every((i) => prev.has(i.path))
                    ? new Set()
                    : new Set(pickable.map((i) => i.path)),
                )
              }
              className="rounded-lg px-2 py-1 font-medium text-violet-700 hover:bg-white"
            >
              {pickable.every((i) => picked.has(i.path)) ? "Clear" : `Select all ${pickable.length}`}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="max-w-[18rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value="">Move to folder…</option>
              {fileableFolders.map((f) => (
                <option key={f} value={f}>
                  {pathName(f)}
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
        // Inside a folder that only holds subfolders, the tiles above say it all.
        folder && !searching && subfolders.length > 0 ? null : (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-gray-200 bg-white/60">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <ImageIcon size={24} className="text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              {searching ? "No matches" : folder ? "This folder is empty" : "No images yet"}
            </h3>
            <p className="text-xs text-gray-400 max-w-sm text-center">
              {searching
                ? "Try a different search or sharing filter."
                : canWriteHere || !folder
                  ? "Drag photos from your computer onto this page to upload them here, or drag existing images onto this folder."
                  : "Nothing here yet."}
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((img) => {
            const isLibrary = img.source === "library";
            const isPicked = selecting && picked.has(img.path);
            const isDragging = dragging?.includes(img.path) ?? false;
            return (
              <button
                key={img.path}
                draggable={isLibrary}
                onDragStart={isLibrary ? (e) => onImageDragStart(e, img) : undefined}
                onClick={() => (selecting && isLibrary ? togglePick(img.path) : setSelected(img))}
                className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-sm ${
                  isLibrary ? "cursor-grab active:cursor-grabbing" : ""
                } ${
                  isPicked
                    ? "border-violet-500 ring-2 ring-violet-500"
                    : "border-gray-200 hover:border-gray-300"
                } ${isDragging ? "opacity-40" : ""} ${selecting && !isLibrary ? "opacity-50" : ""}`}
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

                  {/* Sharing / source badge */}
                  {isLibrary ? (
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
                  ) : (
                    <span
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title="Product photo — managed on the product page"
                    >
                      <Package size={10} /> Product
                    </span>
                  )}

                  {selecting && isLibrary && (
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
                    <span className="inline-flex items-center gap-1 truncate" title={pathName(img.folder)}>
                      <Folder size={10} className="shrink-0" />
                      {nameOf(img.folder)}
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
          folders={fileableFolders.map((id) => ({ id, label: pathName(id) }))}
          currentFolderLabel={pathName(selected.folder)}
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
