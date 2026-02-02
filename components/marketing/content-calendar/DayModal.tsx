"use client";

import { ContentItem, Platform } from "./types";
import {
  Instagram,
  Facebook,
  Music2,
  FileText,
  Plus,
  X,
  Trash2,
} from "lucide-react";

/**
 * Local-safe ISO → Date parser
 * Never use new Date("YYYY-MM-DD")
 */
function dateFromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const PLATFORM_ICONS: Record<Platform, any> = {
  Instagram,
  Facebook,
  TikTok: Music2,
  Blog: FileText,
};

export default function DayModal({
  date,
  items,
  onAddNew,
  onSelectItem,
  onDeleteItem,
  onClose,
}: {
  date: string;
  items: ContentItem[];
  onAddNew: () => void;
  onSelectItem: (item: ContentItem) => void;
  onDeleteItem: (item: ContentItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">
            {dateFromISO(date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>

          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={onAddNew}
          className="w-full flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium hover:bg-gray-50"
        >
          <Plus size={16} />
          Add New Content
        </button>

        {/* Scheduled items */}
        {items.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Scheduled Content
            </div>

            {items.map((item) => {
              const Icon = PLATFORM_ICONS[item.platform];

              return (
                <div
                  key={item.id}
                  className="group w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {/* Clickable content (edit/select) */}
                  <button
                    onClick={() => onSelectItem(item)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <Icon size={14} className="opacity-70" />

                    <div className="truncate">
                      <div className="font-medium truncate">
                        {item.platform} — {item.content_type}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {item.strategy}
                      </div>
                    </div>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-600"
                    title="Delete content"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
