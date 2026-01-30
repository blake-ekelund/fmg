// /marketing/content/TableView.tsx
"use client";

import { ContentItem } from "./types";
import {
  Instagram,
  Facebook,
  Music2,
  FileText,
} from "lucide-react";

/* ---------------------------------------------
   Visual mappings
--------------------------------------------- */
const PLATFORM_META = {
  Instagram: {
    icon: Instagram,
    className: "bg-pink-100 text-pink-700",
  },
  Facebook: {
    icon: Facebook,
    className: "bg-blue-100 text-blue-700",
  },
  TikTok: {
    icon: Music2,
    className: "bg-neutral-900 text-white",
  },
  Blog: {
    icon: FileText,
    className: "bg-emerald-100 text-emerald-700",
  },
} as const;

const STATUS_META = {
  "Not Started": "bg-gray-100 text-gray-600",
  "In Progress": "bg-yellow-100 text-yellow-700",
  Ready: "bg-green-100 text-green-700",
} as const;

export default function TableView({
  items,
  onSelectItem,
}: {
  items: ContentItem[];
  onSelectItem: (item: ContentItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <table className="w-full text-sm">
        {/* Header */}
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-5 py-3 text-left font-medium">
              Date
            </th>
            <th className="px-5 py-3 text-left font-medium">
              Platform
            </th>
            <th className="px-5 py-3 text-left font-medium">
              Type
            </th>
            <th className="px-5 py-3 text-left font-medium">
              Strategy
            </th>
            <th className="px-5 py-3 text-left font-medium">
              Description
            </th>
            <th className="px-5 py-3 text-left font-medium">
              Status
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const PlatformIcon =
              PLATFORM_META[item.platform].icon;

            return (
              <tr
                key={item.id}
                onClick={() => onSelectItem(item)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                {/* Date */}
                <td className="px-5 py-4 whitespace-nowrap text-gray-700">
                  {item.publish_date}
                </td>

                {/* Platform */}
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      PLATFORM_META[item.platform].className
                    }`}
                  >
                    <PlatformIcon
                      size={14}
                      className="opacity-80"
                    />
                    {item.platform}
                  </span>
                </td>

                {/* Content Type */}
                <td className="px-5 py-4 text-gray-800">
                  {item.content_type}
                </td>

                {/* Strategy */}
                <td className="px-5 py-4 text-gray-600">
                  {item.strategy}
                </td>

                {/* Description */}
                <td className="px-5 py-4 text-gray-600 max-w-sm truncate">
                  {item.description}
                </td>

                {/* Status */}
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
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
