"use client";

import { useMemo, useState } from "react";
import { ContentItem, Platform, ContentStatus } from "./types";
import {
  Instagram,
  Facebook,
  Music2,
  ShoppingBag,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ---------------------------------------------
   Visual mappings
--------------------------------------------- */
const PLATFORM_META: Record<
  Platform,
  { icon: React.ComponentType<any>; className: string }
> = {
  Instagram: {
    icon: Instagram,
    className:
      "bg-pink-50 text-pink-700 border-pink-200",
  },
  Facebook: {
    icon: Facebook,
    className:
      "bg-blue-50 text-blue-700 border-blue-200",
  },
  TikTok: {
    icon: Music2,
    className:
      "bg-neutral-900 text-white border-neutral-800",
  },
  Shopify: {
    icon: ShoppingBag,
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "Subscriber-List": {
    icon: Mail,
    className:
      "bg-purple-50 text-purple-700 border-purple-200",
  },
};

const STATUS_META: Record<
  ContentStatus,
  string
> = {
  Draft:
    "bg-gray-100 text-gray-600 border-gray-200",

  "In Review":
    "bg-amber-50 text-amber-700 border-amber-200",

  Reviewed:
    "bg-sky-50 text-sky-700 border-sky-200",

  Published:
    "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/* ---------------------------------------------
   Date helpers
--------------------------------------------- */

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return date.toISOString().split("T")[0];
}

function formatDayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "short",
      day: "numeric",
    }
  );
}

export default function MobileDayTable({
  items,
  onSelect,
}: {
  items: ContentItem[];
  onSelect: (item: ContentItem) => void;
}) {
  const [activeDate, setActiveDate] =
    useState(todayISO());

  const dayItems = useMemo(
    () =>
      items.filter(
        (i) => i.publish_date === activeDate
      ),
    [items, activeDate]
  );

  return (
    <div className="space-y-4">
      {/* Day Header Card */}
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            onClick={() =>
              setActiveDate((d) =>
                addDays(d, -1)
              )
            }
            className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="text-center">
            <div className="text-sm font-semibold text-gray-800">
              {formatDayLabel(activeDate)}
            </div>
            <div className="text-xs text-gray-500">
              {dayItems.length === 0
                ? "No scheduled content"
                : `${dayItems.length} item${
                    dayItems.length > 1
                      ? "s"
                      : ""
                  } scheduled`}
            </div>
          </div>

          <button
            onClick={() =>
              setActiveDate((d) =>
                addDays(d, 1)
              )
            }
            className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {activeDate !== todayISO() && (
          <button
            onClick={() =>
              setActiveDate(todayISO())
            }
            className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600"
          >
            Jump to Today
          </button>
        )}
      </div>

      {/* Content Card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {dayItems.length === 0 ? (
          <div className="py-10 text-sm text-gray-500 text-center">
            Nothing scheduled for this day
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">
                  Channel
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  Type
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {dayItems.map((item) => {
                const meta =
                  PLATFORM_META[item.platform];

                const Icon =
                  meta?.icon ?? Mail;

                return (
                  <tr
                    key={item.id}
                    onClick={() =>
                      onSelect(item)
                    }
                    className="
                      cursor-pointer
                      hover:bg-gray-50
                      active:bg-gray-100
                    "
                  >
                    {/* Platform */}
                    <td className="px-2 py-3">
                      <span
                        className={`
                          inline-flex
                          items-center
                          gap-1.5
                          rounded-full
                          border
                          px-2.5
                          py-1
                          font-medium
                          ${
                            meta?.className ??
                            "bg-gray-100 text-gray-700 border-gray-200"
                          }
                        `}
                      >
                        <Icon size={12} />
                        {item.platform}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="px-1 py-3 text-gray-700">
                      {item.content_type}
                    </td>

                    {/* Status */}
                    <td className="px-1 py-3">
                      <span
                        className={`
                          inline-flex
                          rounded-full
                          border
                          px-2.5
                          py-1
                          text-xs
                          font-medium
                          ${STATUS_META[item.status]}
                        `}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
