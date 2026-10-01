"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  Search,
  Copy,
  Check,
  Globe,
  FolderPlus,
  Folder,
  ChevronRight,
  ArrowLeft,
  Trash2,
  X,
  Package,
  Inbox,
} from "lucide-react";
import { uploadEmailImage } from "@/components/templates/uploadEmailImage";
import { listImages, createFolder, deleteFolder, refileImages } from "./api";
import ImageDetailModal from "./ImageDetailModal";
import { displayName, fileName } from "./format";
import type { LibraryFolder, LibraryImage, ShareScope } from "./types";


/** Where library uploads land when no folder is open (an inbox; see the API). */
const DEFAULT_FOLDER = "library-uploads";
/** Old uploads at the bucket root — viewable, but nothing can be filed into it. */
const ROOT = "root";
/** Must match MAX_FOLDER_DEPTH in /api/email/images. */
const MAX_FOLDER_DEPTH = 3;
/** dataTransfer type for library images being dragged onto a folder. */
const DRAG_TYPE = "application/x-fmg-library-images";
/** Images rendered per batch — a brand folder holds hundreds of product photos. */
const BATCH = 60;

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

/** Every folder an image shows in: its home, plus (product photos) collection + category. */
function placesOf(img: LibraryImage): string[] {
  return img.alsoIn?.length ? [img.folder, ...img.alsoIn] : [img.folder];
}

/** Does the image show anywhere inside folder `f`? */
function inFolder(img: LibraryImage, f: string): boolean {
  return placesOf(img).some((p) => within(p, f));
}

/** Library folders accept uploads / filing; product folders and "root" don't. */
function writable(f: LibraryFolder | undefined): boolean {
  return !!f && !f.readOnly && !f.id.startsWith("~") && f.id !== ROOT;
}

type ScopeFilter = "all" | ShareScope;

/** Is this drag carrying library images (vs. files from the desktop)? */
function isImageDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DRAG_TYPE);
}
function isFileDrag(e: React.DragEvent): boolean {
  return !isImageDrag(e) && Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Pick mode: the same library, embedded in the email / blog editors' image
 * picker. Clicking an image uses it; uploads go to the editor's inbox (or the
 * open folder) and the first one is used straight away. Filing tools (select,
 * drag-to-move, the detail editor) stay on the Image Library page.
 */
export type PickOptions = {
  onPick: (url: string) => void;
  /** Inbox uploads land in when no writable folder is open. */
  inbox: string;
  /** Replaces the email resize-and-upload (the blog keeps full resolution). */
  uploader?: (file: File, folder: string) => Promise<{ url: string } | { error: string }>;
};

export default function ImageLibraryPage({ pick }: { pick?: PickOptions } = {}) {
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
  const [visible, setVisible] = useState(BATCH);
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
  const rootRef = useRef<HTMLDivElement>(null);

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
        // Upload inboxes first, then library folders, then product folders.
        .sort(
          (a, b) =>
            Number(b.kind === "inbox") - Number(a.kind === "inbox") ||
            Number(a.readOnly) - Number(b.readOnly) ||
            (a.order ?? 0) - (b.order ?? 0) ||
            a.name.localeCompare(b.name),
        ),
    [folderList],
  );

  // Count + thumbnails include everything nested below a folder. An image that
  // shows in several places (product photos) counts once per folder.
  const folderStats = useMemo(() => {
    const stats = new Map<string, { count: number; thumbs: LibraryImage[] }>();
    for (const f of folderList) stats.set(f.id, { count: 0, thumbs: [] });
    for (const i of images) {
      const reached = new Set<string>();
      for (const place of placesOf(i)) {
        for (let p: string | null = place; p; p = parentOf(p)) reached.add(p);
      }
      for (const p of reached) {
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
  // Inboxes are a to-be-filed pile, not somewhere to build a tree.
  const canNestHere =
    canWriteHere && !!folder && current?.kind !== "inbox" && depthOf(folder) < MAX_FOLDER_DEPTH;
  // New folders go inside the open folder when it can hold one, else top level.
  const newFolderParent = canNestHere ? folder : null;
  // Uploads go into the open folder when it can take them.
  const uploadTarget = canWriteHere && folder ? folder : pick?.inbox ?? DEFAULT_FOLDER;

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
    let firstUrl: string | null = null;
    let ok = 0;
    for (const file of list) {
      const res = pick?.uploader ? await pick.uploader(file, target) : await uploadEmailImage(file, target);
      if ("error" in res) lastError = res.error;
      else {
        ok++;
        firstUrl ??= res.url;
      }
    }
    setUploading(false);
    // Picking: an upload is a choice — use it right away.
    if (pick && firstUrl) {
      pick.onPick(firstUrl);
      return;
    }
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
    // Start each folder at the top (the page, or the picker's scroll area).
    rootRef.current?.scrollIntoView({ block: "start" });
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
        if (folder && !inFolder(i, folder)) return false;
        const places = placesOf(i).map(pathName).join(" ");
        const hay = `${fileName(i.path)} ${i.title ?? ""} ${i.altText ?? ""} ${places}`.toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (folder) {
        // A folder shows everything inside it, subfolders included.
        if (!inFolder(i, folder)) return false;
      } else if (i.source !== "library") {
        // Home lists library images; product photos live in their folders.
        return false;
      }
      if (scope !== "all" && i.shareScope !== scope) return false;
      return true;
    });
  }, [images, query, folder, scope, pathName]);

  // Start each folder / search / filter back at the first batch.
  useEffect(() => setVisible(BATCH), [folder, query, scope]);

  const pickable = filtered.filter((i) => i.source === "library");
  const shown = filtered.slice(0, visible);
  const folderTotal = folder ? folderStats.get(folder)?.count ?? 0 : images.length;
  const folderEmpty = !!folder && folderTotal === 0 && childrenOf(folder).length === 0;
  const crumbs: string[] = [];
  for (let p = folder; p; p = parentOf(p)) crumbs.unshift(p);


  function renderTile(f: LibraryFolder) {
    const stats = folderStats.get(f.id) ?? { count: 0, thumbs: [] };
    const hot = dropTarget === f.id;
    const droppable = writable(f);
    const isProduct = f.id.startsWith("~");
    const isInbox = f.kind === "inbox";
    const cover = stats.thumbs[0];
    const Icon = isProduct ? Package : isInbox ? Inbox : Folder;
    return (
      <button
        key={f.id}
        onClick={() => openFolder(f.id)}
        {...folderDropProps(f.id)}
        className={`group flex flex-col text-left transition ${
          dragging && !droppable ? "opacity-40" : ""
        }`}
      >
        <div
          className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100 transition ${
            hot
              ? "ring-4 ring-violet-500 ring-offset-2"
              : dragging && droppable
                ? "ring-2 ring-violet-300 ring-offset-2"
                : "group-hover:ring-2 group-hover:ring-gray-300 group-hover:ring-offset-2"
          }`}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.url}
              alt=""
              draggable={false}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icon size={36} className="text-gray-300" />
            </div>
          )}
          {hot && (
            <div className="absolute inset-0 flex items-center justify-center bg-violet-600/20">
              <span className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow">
                {dragging ? "Move here" : "Upload here"}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2.5 flex items-start gap-2 px-0.5">
          <Icon size={16} className={isInbox ? "mt-0.5 shrink-0 text-violet-500" : "mt-0.5 shrink-0 text-gray-400"} />
          <span className="line-clamp-2 text-[15px] font-medium leading-snug text-gray-900" title={f.name}>
            {f.name}
          </span>
        </div>
        <span className="mt-0.5 px-0.5 text-sm text-gray-500">
          {stats.count} {stats.count === 1 ? "image" : "images"}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={pick ? "relative px-6 py-5" : "relative mx-auto max-w-[1400px] px-4 py-8 md:px-10 md:py-10"}
      {...pageDropProps}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
    >
      {/* Desktop-file drop overlay */}
      {fileHover && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-violet-500 bg-white px-12 py-10 text-center shadow-xl">
            <Upload size={32} className="mx-auto mb-3 text-violet-600" />
            <div className="text-lg font-semibold text-gray-900">Drop to upload</div>
            <div className="mt-1 text-base text-gray-500">into {pathName(uploadTarget)}</div>
          </div>
        </div>
      )}

      {/* Dragging hint */}
      {dragging && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          Drop on a folder to move {dragging.length === 1 ? "it" : `${dragging.length} images`}
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        {folder ? (
          // Breadcrumb — every writable level above is a drop target.
          <nav className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              onClick={() => openFolder(parentOf(folder))}
              className="mr-1 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
            <button
              onClick={() => openFolder(null)}
              className="rounded-lg px-1.5 py-1 text-lg text-gray-500 hover:text-gray-900"
            >
              Image Library
            </button>
            {crumbs.map((c, idx) => {
              const last = idx === crumbs.length - 1;
              const hot = dropTarget === c;
              return (
                <span key={c} className="inline-flex min-w-0 items-center gap-1">
                  <ChevronRight size={18} className="shrink-0 text-gray-300" />
                  <button
                    onClick={() => openFolder(c)}
                    {...(last ? {} : folderDropProps(c))}
                    className={`truncate rounded-lg px-1.5 py-1 ${
                      hot
                        ? "bg-violet-100 text-violet-800 ring-2 ring-violet-500"
                        : last
                          ? "text-2xl font-semibold tracking-tight text-gray-900"
                          : "text-lg text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {nameOf(c)}
                  </button>
                </span>
              );
            })}
          </nav>
        ) : (
          <h1 className={`${pick ? "text-2xl" : "text-3xl"} font-semibold tracking-tight text-gray-900`}>
            Image Library
          </h1>
        )}

        <div className="flex items-center gap-2">
          {(!folder || canNestHere) && (
            <button
              onClick={() => setNewFolderOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-[15px] font-medium text-gray-800 transition hover:bg-gray-50"
            >
              <FolderPlus size={18} />
              New folder
            </button>
          )}
          {(!folder || canWriteHere) && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={`Uploads go into ${pathName(uploadTarget)}`}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
          )}
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
      </header>

      {current?.readOnly && current.id.startsWith("~") && (
        <p className="mt-2 text-[15px] text-gray-500">
          Product photos are edited on each product&apos;s page.
        </p>
      )}

      {/* New folder */}
      {newFolderOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateFolder();
          }}
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-gray-50 p-4"
        >
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNewFolderOpen(false)}
            placeholder={newFolderParent ? `New folder in ${nameOf(newFolderParent)}` : "Folder name"}
            maxLength={60}
            className="min-w-[240px] flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-base focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <button
            type="submit"
            disabled={folderBusy || !newFolderName.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[15px] font-medium text-white hover:bg-gray-700 disabled:opacity-40"
          >
            {folderBusy && <Loader2 size={16} className="animate-spin" />}
            Create
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(false)}
            className="rounded-full px-4 py-2.5 text-[15px] font-medium text-gray-600 hover:bg-gray-200"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Messages */}
      {notice && (
        <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-5 py-3.5 text-[15px] text-emerald-800">
          <Check size={18} className="shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-2xl bg-rose-50 px-5 py-3.5 text-[15px] text-rose-700">{error}</div>
      )}

      {/* Folders */}
      {!loading && subfolders.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Folders</h2>
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {subfolders.map(renderTile)}
          </div>
        </section>
      )}

      {/* Images */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold text-gray-900">
            {searching ? "Search results" : subfolders.length > 0 ? "All images" : "Images"}
            {!loading && filtered.length > 0 && (
              <span className="ml-2 text-base font-normal text-gray-400 tabular-nums">{filtered.length}</span>
            )}
          </h2>

          <div className="relative w-full sm:w-72">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-full border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-base focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>

          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeFilter)}
            aria-label="Show"
            className="rounded-full border border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          >
            <option value="all">All images</option>
            <option value="third_party">Shared with reps</option>
            <option value="internal">Internal only</option>
          </select>

          {!pick && pickable.length > 0 && !selecting && (
            <button
              onClick={() => setSelecting(true)}
              className="rounded-full px-4 py-2.5 text-[15px] font-medium text-gray-700 hover:bg-gray-100"
            >
              Select
            </button>
          )}
        </div>

        {/* Selection bar */}
        {selecting && (
          <div className="sticky top-2 z-30 mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-[15px] text-white shadow-lg">
            <span className="font-medium tabular-nums">
              {picked.size === 0 ? "Tap images to select" : `${picked.size} selected`}
            </span>
            <button
              onClick={() =>
                setPicked((prev) =>
                  pickable.every((i) => prev.has(i.path))
                    ? new Set()
                    : new Set(pickable.map((i) => i.path)),
                )
              }
              className="rounded-full px-3 py-1 text-gray-300 hover:bg-white/10 hover:text-white"
            >
              {pickable.every((i) => picked.has(i.path)) ? "Clear" : "Select all"}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                className="max-w-[16rem] rounded-full border-0 bg-white/10 px-4 py-2 text-[15px] text-white focus:outline-none focus:ring-2 focus:ring-white/40 [&>option]:text-gray-900"
              >
                <option value="">Move to…</option>
                {fileableFolders.map((f) => (
                  <option key={f} value={f}>
                    {pathName(f)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void moveImages(Array.from(picked), moveTo)}
                disabled={moving || !moveTo || picked.size === 0}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-40"
              >
                {moving && <Loader2 size={16} className="animate-spin" />}
                Move
              </button>
              <button
                onClick={stopSelecting}
                className="rounded-full p-2 text-gray-300 hover:bg-white/10 hover:text-white"
                aria-label="Done selecting"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-200 py-20 text-center">
            <ImageIcon size={40} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-800">
              {searching ? "Nothing found" : folder ? "No images here yet" : "No images yet"}
            </p>
            <p className="mt-1 max-w-sm text-[15px] text-gray-500">
              {searching
                ? "Try a different word."
                : canWriteHere || !folder
                  ? "Drag photos from your computer onto this page, or use Upload."
                  : ""}
            </p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((img) => {
              const isLibrary = img.source === "library";
              const isPicked = selecting && picked.has(img.path);
              const isDragging = dragging?.includes(img.path) ?? false;
              return (
                <div key={img.path} className={`group ${isDragging ? "opacity-30" : ""}`}>
                  <button
                    draggable={isLibrary && !pick}
                    onDragStart={isLibrary && !pick ? (e) => onImageDragStart(e, img) : undefined}
                    onClick={() =>
                      pick
                        ? pick.onPick(img.url)
                        : selecting && isLibrary
                          ? togglePick(img.path)
                          : setSelected(img)
                    }
                    className={`relative block aspect-square w-full overflow-hidden rounded-2xl bg-gray-100 transition ${
                      isLibrary && !pick ? "cursor-grab active:cursor-grabbing" : ""
                    } ${
                      isPicked
                        ? "ring-4 ring-violet-500 ring-offset-2"
                        : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-2"
                    } ${selecting && !isLibrary ? "opacity-40" : ""}`}
                    aria-label={displayName(img)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.altText ?? fileName(img.path)}
                      draggable={false}
                      loading="lazy"
                      className="h-full w-full object-contain p-2"
                    />

                    {selecting && isLibrary && (
                      <span
                        className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                          isPicked ? "border-violet-600 bg-violet-600 text-white" : "border-white bg-black/20"
                        }`}
                      >
                        {isPicked && <Check size={16} strokeWidth={3} />}
                      </span>
                    )}

                    {isLibrary && img.shareScope === "third_party" && !selecting && (
                      <span
                        className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium text-emerald-700 shadow-sm"
                        title="Reps can see and use this image"
                      >
                        <Globe size={12} /> Reps
                      </span>
                    )}

                    {pick && (
                      <span className="absolute bottom-2.5 right-2.5 rounded-full bg-violet-600 px-3 py-1.5 text-sm font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100">
                        Use image
                      </span>
                    )}

                    {!selecting && !pick && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyUrl(img.url);
                        }}
                        className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-gray-800 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100"
                      >
                        {copied === img.url ? (
                          <>
                            <Check size={14} className="text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy link
                          </>
                        )}
                      </span>
                    )}
                  </button>
                  <div
                    className="mt-2.5 truncate px-0.5 text-[15px] text-gray-800"
                    title={displayName(img)}
                  >
                    {displayName(img)}
                  </div>
                  {/* Say where it lives when that isn't the open folder (product titles already do). */}
                  {isLibrary && (searching || img.folder !== folder) && (
                    <div className="truncate px-0.5 text-sm text-gray-500">
                      {searching ? pathName(img.folder) : nameOf(img.folder)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length > visible && (
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                onClick={() => setVisible((v) => v + BATCH * 2)}
                className="rounded-full border border-gray-300 bg-white px-6 py-2.5 text-[15px] font-medium text-gray-800 hover:bg-gray-50"
              >
                Show more
              </button>
              <span className="text-sm text-gray-500 tabular-nums">
                Showing {visible} of {filtered.length}
              </span>
            </div>
          )}
          </>
        )}
      </section>

      {/* Empty folder housekeeping, out of the way at the bottom */}
      {folderEmpty && canWriteHere && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => folder && void handleDeleteFolder(folder)}
            disabled={folderBusy}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 size={16} /> Delete this empty folder
          </button>
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
