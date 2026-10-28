"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { X, Search, Folder, FolderPlus, Check, Loader2 } from "lucide-react";
import SlideOver from "@/components/ui/SlideOver";

export type MoveTarget = {
  id: string;
  /** Last part of the path ("Ads"). */
  name: string;
  /** Whole path ("Sassy holiday › Ads"), for search and the button. */
  path: string;
  depth: number;
  count: number;
  thumb: string | null;
};

/**
 * "Move to folder" as a right-hand drawer: a big, readable folder list (with a
 * thumbnail and count each, subfolders indented), search, and a New folder
 * row. Pick a folder, then one button moves the selection. Moving only
 * re-labels the photos — their links never change.
 */
export default function MoveToFolderDrawer({
  open,
  onClose,
  count,
  folders,
  currentFolder,
  busy,
  onMove,
  onCreateFolder,
}: {
  open: boolean;
  onClose: () => void;
  /** How many photos are selected. */
  count: number;
  folders: MoveTarget[];
  /** The folder open on the page, marked "you are here". */
  currentFolder: string | null;
  busy: boolean;
  onMove: (folderId: string) => void;
  /** Creates a top-level folder and returns its id. */
  onCreateFolder: (name: string) => Promise<string | null>;
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? folders.filter((f) => f.path.toLowerCase().includes(needle)) : folders;
  }, [folders, q]);

  const target = folders.find((f) => f.id === chosen) ?? null;

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const id = await onCreateFolder(name);
      if (id) {
        setChosen(id);
        setNewName("");
        setAdding(false);
        setQ("");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} widthClass="max-w-[520px]">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-gray-200 px-6 py-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-gray-900">
            Move {count} photo{count === 1 ? "" : "s"}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">Pick a folder. Links stay the same, so emails keep working.</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {/* Search + new folder */}
      <div className="space-y-2 border-b border-gray-100 px-6 py-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a folder…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="New folder name"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            <button
              onClick={() => void create()}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Create
            </button>
            <button onClick={() => setAdding(false)} className="rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-[15px] font-medium text-gray-700 hover:text-gray-900"
          >
            <FolderPlus size={18} /> New folder
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {shown.map((f) => {
          const isChosen = f.id === chosen;
          const isHere = f.id === currentFolder;
          return (
            <button
              key={f.id}
              onClick={() => setChosen(f.id)}
              style={{ paddingLeft: q ? 12 : 12 + f.depth * 24 }}
              className={clsx(
                "flex w-full items-center gap-3 rounded-xl py-2.5 pr-3 text-left transition",
                isChosen ? "bg-gray-900 text-white" : "hover:bg-gray-50",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                {f.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Folder size={18} className="text-gray-400" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{q ? f.path : f.name}</span>
                <span className={clsx("block text-xs", isChosen ? "text-gray-300" : "text-gray-500")}>
                  {f.count} photo{f.count === 1 ? "" : "s"}
                  {isHere && " · you're here"}
                </span>
              </span>
              {isChosen && <Check size={18} className="shrink-0" />}
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No folder matches. Try New folder.</p>}
      </div>

      {/* Action */}
      <div className="border-t border-gray-200 px-6 py-4">
        <button
          onClick={() => target && onMove(target.id)}
          disabled={!target || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-[15px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {target ? `Move to ${target.path}` : "Choose a folder"}
        </button>
      </div>
    </SlideOver>
  );
}
