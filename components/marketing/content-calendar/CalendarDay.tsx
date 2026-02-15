import { ContentItem, Platform, ContentStatus } from "./types";
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
  { icon: React.ComponentType<any>; className: string }
> = {
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
  Shopify: {
    icon: ShoppingBag,
    className: "bg-emerald-100 text-emerald-700",
  },
  "Subscriber-List": {
    icon: Mail,
    className: "bg-purple-100 text-purple-700",
  },
};

const STATUS_DOT: Record<ContentStatus, string> = {
  Draft: "bg-gray-400",        // neutral
  "In Review": "bg-amber-500", // caution / pending
  Reviewed: "bg-sky-500",      // verified
  Published: "bg-emerald-600", // live / success
};

export default function CalendarDay({
  day,
  dateISO,
  items,
  past,
  isToday,
  onClick,
}: {
  day: number;
  dateISO: string;
  items: ContentItem[];
  past: boolean;
  isToday?: boolean;
  onClick: () => void;
}) {
  const visibleItems = items.slice(0, 3);
  const overflowCount = items.length - visibleItems.length;

  return (
    <div
      onClick={onClick}
      className={`
        group
        bg-white
        h-24 lg:h-28
        p-2
        border-t border-l border-gray-100
        cursor-pointer
        transition
        ${past ? "opacity-40" : "hover:bg-gray-50"}
        ${isToday ? "ring-2 ring-blue-200 z-10" : ""}
      `}
    >
      {/* Day number */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-medium ${
            isToday
              ? "text-blue-700"
              : "text-gray-700"
          }`}
        >
          {day}
        </span>

        {items.length > 0 && (
          <span className="text-[10px] text-gray-400">
            {items.length}
          </span>
        )}
      </div>

      {/* Content items */}
      <div className="mt-1 space-y-1">
        {visibleItems.map((item) => {
          const meta =
            PLATFORM_META[item.platform];

          const PlatformIcon =
            meta?.icon ?? Mail; // safe fallback

          return (
            <div
              key={item.id}
              className={`
                flex items-center gap-1.5
                rounded-full
                px-2 py-0.5
                text-[11px]
                font-medium
                truncate
                ${meta?.className ?? "bg-gray-100 text-gray-700"}
              `}
            >
              {/* Status dot */}
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  STATUS_DOT[item.status]
                }`}
              />

              {/* Platform icon */}
              <PlatformIcon
                size={12}
                className="opacity-80"
              />

              {/* Platform name */}
              <span className="truncate">
                {item.platform}
              </span>
            </div>
          );
        })}

        {overflowCount > 0 && (
          <div className="text-[10px] text-gray-400 pl-1">
            +{overflowCount} more
          </div>
        )}
      </div>
    </div>
  );
}
