"use client";

import { Plus, X, Calendar, Clock, Edit2, Trash2 } from "lucide-react";
import { ContentItem } from "./types";

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "bg-pink-100 text-pink-700 border-pink-200",
  Facebook: "bg-blue-100 text-blue-700 border-blue-200",
  TikTok: "bg-slate-100 text-slate-700 border-slate-200",
  Shopify: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Subscriber-List": "bg-amber-100 text-amber-700 border-amber-200",
};

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-yellow-100 text-yellow-700",
  Review: "bg-sky-100 text-sky-700",
  Published: "bg-violet-100 text-violet-700",
};

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function SidePanel({
  selectedDate,
  items,
  upcomingItems,
  onAddNew,
  onEditItem,
  onDeleteItem,
  onClose,
}: {
  selectedDate: string | null;
  items: ContentItem[];
  upcomingItems: ContentItem[];
  onAddNew: () => void;
  onEditItem: (item: ContentItem) => void;
  onDeleteItem: (item: ContentItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-[320px] shrink-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          {selectedDate ? (
            <>
              <div className="text-sm font-semibold text-gray-800">
                {formatDate(selectedDate)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {items.length} item{items.length !== 1 ? "s" : ""} scheduled
              </div>
            </>
          ) : (
            <div className="text-sm font-semibold text-gray-800">
              Select a day
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedDate && (
            <button
              onClick={onAddNew}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition"
              title="Add content"
            >
              <Plus size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content for selected day */}
      <div className="flex-1 overflow-y-auto">
        {selectedDate && items.length > 0 && (
          <div className="p-3 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
              Scheduled Content
            </div>
            {items.map((item) => {
              const platformColor = PLATFORM_COLORS[item.platform] ?? "bg-gray-100 text-gray-600";
              const statusColor = STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-600";

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2 group hover:border-gray-200 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${platformColor}`}>
                          {item.platform}
                        </span>
                        {item.content_type && (
                          <span className="text-[10px] text-gray-400">
                            {item.content_type}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-gray-800 mt-1 truncate">
                        {item.description || item.content_type || "Untitled"}
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${statusColor}`}>
                      {item.status}
                    </span>
                  </div>

                  {false /* caption not in type */ && (
                    <div className="text-[11px] text-gray-500 line-clamp-2">
                      {false /* caption not in type */}
                    </div>
                  )}

                  {false /* publish_time not in type */ && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                      <Clock size={10} />
                      {false /* publish_time not in type */}
                    </div>
                  )}

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => onEditItem(item)}
                      className="p-1 rounded hover:bg-white text-gray-400 hover:text-gray-600 transition"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteItem(item)}
                      className="p-1 rounded hover:bg-white text-gray-400 hover:text-rose-500 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedDate && items.length === 0 && (
          <div className="p-6 text-center">
            <Calendar size={24} className="mx-auto text-gray-300 mb-2" />
            <div className="text-xs text-gray-400 mb-3">Nothing scheduled</div>
            <button
              onClick={onAddNew}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
            >
              <Plus size={12} />
              Add Content
            </button>
          </div>
        )}

        {!selectedDate && (
          <div className="p-6 text-center">
            <Calendar size={24} className="mx-auto text-gray-300 mb-2" />
            <div className="text-xs text-gray-400">
              Click a day on the calendar to view or add content
            </div>
          </div>
        )}

        {/* Upcoming section */}
        {upcomingItems.length > 0 && (
          <div className="p-3 border-t border-gray-100">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-2">
              Upcoming ({upcomingItems.length})
            </div>
            <div className="space-y-1.5">
              {upcomingItems.slice(0, 8).map((item) => {
                const platformColor = PLATFORM_COLORS[item.platform] ?? "bg-gray-100 text-gray-600";

                return (
                  <button
                    key={item.id}
                    onClick={() => onEditItem(item)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left transition"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border shrink-0 ${platformColor}`}>
                      {item.platform?.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-gray-700 truncate">
                        {item.description || item.content_type || "Untitled"}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(item.publish_date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
