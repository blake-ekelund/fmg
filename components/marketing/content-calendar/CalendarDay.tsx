import { ContentItem, Platform, ContentStatus } from "./types";
import type { DayPromo } from "./CalendarView";
import {
  Instagram,
  Facebook,

  ShoppingBag,
  Mail,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ---------------------------------------------
   Visual mappings
--------------------------------------------- */
const PLATFORM_META: Record<
  Platform,
  { icon: LucideIcon; className: string }
> = {
  Instagram: {
    icon: Instagram,
    className: "bg-pink-100 text-pink-700",
  },
  Facebook: {
    icon: Facebook,
    className: "bg-blue-100 text-blue-700",
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
  Review: "bg-sky-500",      // verified
  Published: "bg-emerald-600", // live / success
};

export default function CalendarDay({
  day,
  dateISO,
  items,
  promos = [],
  past,
  isToday,
  onClick,
}: {
  day: number;
  dateISO: string;
  items: ContentItem[];
  promos?: DayPromo[];
  past: boolean;
  isToday?: boolean;
  onClick: () => void;
}) {
  const hasPromos = promos.length > 0;
  // Show fewer content items when promos take space
  const maxVisible = hasPromos ? 2 : 3;
  const visibleItems = items.slice(0, maxVisible);
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
        flex flex-col
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

      {/* Promotion bars */}
      {hasPromos && (
        <div className="mt-0.5 space-y-0.5">
          {promos.slice(0, 2).map((promo) => (
            <div
              key={promo.id}
              className={`
                flex items-center gap-1
                ${promo.color} ${promo.textColor}
                text-[10px] font-semibold
                leading-tight
                h-[16px]
                overflow-hidden
                ${promo.isStart && promo.isEnd ? "rounded" : ""}
                ${promo.isStart && !promo.isEnd ? "rounded-l ml-0 -mr-2" : ""}
                ${!promo.isStart && promo.isEnd ? "rounded-r -ml-2 mr-0" : ""}
                ${!promo.isStart && !promo.isEnd ? "-mx-2" : ""}
                px-1
              `}
              title={`${promo.name}${promo.code ? ` (${promo.code})` : ""}`}
            >
              {promo.isWeekStart && (
                <>
                  <Tag size={9} className="flex-shrink-0" />
                  <span className="truncate">
                    {promo.code || promo.name}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Content items */}
      <div className="mt-0.5 space-y-0.5 flex-1 min-h-0">
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
