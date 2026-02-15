"use client";

import { ContentItem, Platform } from "./types";
import {
  Instagram,
  Facebook,
  Music2,
  ShoppingBag,
  Mail,
} from "lucide-react";

/* ---------------------------------------------
   Visual mappings
--------------------------------------------- */
const PLATFORM_META: Record<
  Platform,
  {
    icon: React.ComponentType<any>;
    className: string;
  }
> = {
  Instagram: {
    icon: Instagram,
    className:
      "bg-pink-100 text-pink-700",
  },
  Facebook: {
    icon: Facebook,
    className:
      "bg-blue-100 text-blue-700",
  },
  TikTok: {
    icon: Music2,
    className:
      "bg-neutral-900 text-white",
  },
  Shopify: {
    icon: ShoppingBag,
    className:
      "bg-emerald-100 text-emerald-700",
  },
  "Subscriber-List": {
    icon: Mail,
    className:
      "bg-purple-100 text-purple-700",
  },
};

const BRAND_META = {
  NI: "bg-sky-100 text-sky-700",
  Sassy: "bg-rose-100 text-rose-700",
} as const;

const STATUS_META = {
  "Not Started":
    "bg-gray-100 text-gray-600",
  "In Progress":
    "bg-yellow-100 text-yellow-700",
  Ready:
    "bg-green-100 text-green-700",
} as const;

export default function TableView({
  items,
  onSelectItem,
}: {
  items: ContentItem[];
  onSelectItem: (
    item: ContentItem
  ) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium w-28">
              Date
            </th>

            <th className="px-4 py-2 text-left font-medium w-48">
              Channel
            </th>

            <th className="px-4 py-2 text-left font-medium w-32">
              Type
            </th>

            <th className="hidden md:table-cell px-4 py-2 text-left font-medium">
              Strategy
            </th>

            <th className="hidden md:table-cell px-4 py-2 text-left font-medium">
              Description
            </th>

            <th className="px-4 py-2 text-left font-medium w-36">
              Status
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const meta =
              PLATFORM_META[item.platform];

            const PlatformIcon =
              meta?.icon ?? Mail;

            return (
              <tr
                key={item.id}
                onClick={() =>
                  onSelectItem(item)
                }
                className="
                  cursor-pointer
                  hover:bg-gray-50
                  transition-colors
                  align-top
                "
              >
                {/* Date */}
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {item.publish_date}
                </td>

                {/* Brand + Platform */}
                <td className="px-4 py-3 space-y-1">
                  <div
                    className={`inline-flex rounded-full px-2.5 py-1 font-medium ${
                      BRAND_META[item.brand]
                    }`}
                  >
                    {item.brand}
                  </div>

                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                      meta?.className ??
                      "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <PlatformIcon
                      size={12}
                      className="opacity-80"
                    />
                    {item.platform}
                  </div>
                </td>

                {/* Type */}
                <td className="px-4 py-3 text-gray-800">
                  {item.content_type}
                </td>

                {/* Strategy */}
                <td className="hidden md:table-cell px-4 py-3 text-gray-600 leading-snug">
                  <div className="line-clamp-2">
                    {item.strategy}
                  </div>
                </td>

                {/* Description */}
                <td className="hidden md:table-cell px-4 py-3 text-gray-600 leading-snug">
                  <div className="line-clamp-3">
                    {item.description || "—"}
                  </div>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 font-medium ${
                      STATUS_META[item.status]
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
