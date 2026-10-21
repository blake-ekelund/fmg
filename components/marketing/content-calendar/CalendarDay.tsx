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
      className={`group flex h-24 cursor-pointer flex-col p-1.5 transition lg:h-28 ${
        past ? "bg-gray-50/80 hover:bg-gray-100/70" : "bg-white hover:bg-gray-50"
      }`}
    >
      {/* Day number — today is a filled dot */}
      <div className="flex items-center justify-between">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
            isToday ? "bg-gray-900 text-white" : past ? "text-gray-400" : "text-gray-700"
          }`}
        >
          {day}
        </span>

        {items.length > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold tabular-nums text-gray-500">
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
                ${promo.isStart && !promo.isEnd ? "rounded-l ml-0 -mr-1.5" : ""}
                ${!promo.isStart && promo.isEnd ? "rounded-r -ml-1.5 mr-0" : ""}
                ${!promo.isStart && !promo.isEnd ? "-mx-1.5" : ""}
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
              title={`${item.platform} · ${item.content_type} · ${item.status}${item.description ? `\n${item.description}` : ""}`}
              className={`flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                meta?.className ?? "bg-gray-100 text-gray-700"
              } ${past ? "opacity-70" : ""}`}
            >
              {/* Status dot */}
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />

              {/* Platform icon */}
              <PlatformIcon size={11} className="shrink-0 opacity-80" />

              {/* What it is — the description when there is one, else the format */}
              <span className="truncate">{item.description?.trim() || item.content_type || item.platform}</span>
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
