"use client";

import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import ImageLibraryPage from "@/components/image-library/ImageLibraryPage";
import UnsplashPanel, { type UnsplashPick } from "./UnsplashPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen image's URL; the parent closes the modal. Unsplash
   *  picks also carry their alt text and the photographer credit to show. */
  onSelect: (url: string, unsplash?: UnsplashPick) => void;
  /** Image Library inbox new uploads land in when no folder is open. */
  inbox?: string;
  /** Replaces the email resize-and-upload (the blog keeps full resolution). */
  uploader?: (file: File, folder: string) => Promise<{ url: string } | { error: string }>;
  /** Kept for callers; the embedded library has its own empty states. */
  emptyHint?: string;
  /** Opened from another modal — sit above it. */
  stacked?: boolean;
};

/**
 * The email / blog editors' image picker. "Our library" IS the Image Library
 * (same folders, subfolders, product photos, search) in pick mode, so choosing
 * an image works exactly like browsing /marketing/assets. "Unsplash" is the
 * brand stock-photo tab.
 */
export default function MediaLibraryModal(props: Props) {
  // Mounting the body only while open gives every opening a fresh tab/search.
  return props.open ? <Picker {...props} /> : null;
}

function Picker({ onClose, onSelect, inbox = "email-uploads", uploader, stacked }: Props) {
  const [tab, setTab] = useState<"library" | "unsplash">("library");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${stacked ? "z-[70]" : "z-[60]"} flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-surface-muted shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Choose an image</h2>
          <div className="flex shrink-0 rounded-full bg-gray-100 p-1 text-sm font-medium">
            {(["library", "unsplash"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 transition ${
                  tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "library" ? "Our library" : "Unsplash"}
              </button>
            ))}
          </div>
          {tab === "unsplash" && (
            <div className="relative ml-2 max-w-xs flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search descriptions…"
                className="w-full rounded-full border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "library" ? (
            <ImageLibraryPage pick={{ onPick: (url) => onSelect(url), inbox, uploader }} />
          ) : (
            <div className="p-5">
              <UnsplashPanel query={query} onSelect={onSelect} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
