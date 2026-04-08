"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { ContentItem } from "@/components/marketing/content-calendar/types";

const STATUS_DOT: Record<string, string> = {
  Draft: "bg-gray-300",
  Review: "bg-amber-400",
  Published: "bg-emerald-400",
};

const PLATFORM_LABEL: Record<string, { short: string; color: string }> = {
  Instagram: { short: "IG", color: "text-pink-600 bg-pink-50" },
  Facebook: { short: "FB", color: "text-blue-600 bg-blue-50" },
  TikTok: { short: "TT", color: "text-gray-800 bg-gray-100" },
  Shopify: { short: "Shop", color: "text-green-600 bg-green-50" },
  "Subscriber-List": { short: "Email", color: "text-violet-600 bg-violet-50" },
};

const BRAND_BADGE: Record<string, string> = {
  NI: "bg-amber-50 text-amber-700 border-amber-200",
  Sassy: "bg-pink-50 text-pink-700 border-pink-200",
};

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(dateStr: string): { day: string; weekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate().toString(),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
  };
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function getWeekDates(centerOffset: number): string[] {
  const dates: string[] = [];
  // Show 7 days centered around the selected day
  for (let i = -3; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + centerOffset + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type Props = {
  items: ContentItem[];
  loading: boolean;
  targetDate: string;
  dateOffset: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSetOffset?: (offset: number) => void;
  showBrand?: boolean;
};

export default function ContentCalendarView({
  items,
  loading,
  targetDate,
  dateOffset,
  onPrev,
  onNext,
  onToday,
  onSetOffset,
  showBrand = false,
}: Props) {
  const weekDates = getWeekDates(dateOffset);

  return (
    <div className="space-y-3">
      {/* Week strip */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 grid grid-cols-7 gap-0.5">
          {weekDates.map((dateStr) => {
            const { day, weekday } = formatDateShort(dateStr);
            const selected = dateStr === targetDate;
            const today = isToday(dateStr);
            const offset =
              Math.round(
                (new Date(dateStr + "T00:00:00").getTime() -
                  new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime()) /
                  86400000
              );

            return (
              <button
                key={dateStr}
                onClick={() => onSetOffset?.(offset)}
                className={clsx(
                  "flex flex-col items-center py-1.5 rounded-lg text-center transition-all",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : today
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <span className="text-[9px] font-medium uppercase">
                  {weekday}
                </span>
                <span
                  className={clsx(
                    "text-sm font-bold",
                    selected ? "text-white" : ""
                  )}
                >
                  {day}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onNext}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Today button */}
      {dateOffset !== 0 && (
        <div className="flex justify-center">
          <button
            onClick={onToday}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            Back to today
          </button>
        </div>
      )}

      {/* Selected day label */}
      <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
        {formatDateFull(targetDate)}
      </div>

      {/* Content list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <CalendarDays size={28} className="mb-2 text-gray-300" />
          <span className="text-xs font-medium">
            Nothing scheduled{isToday(targetDate) ? " today" : ""}
          </span>
          <Link
            href="/content-calendar"
            className="text-[11px] text-blue-500 hover:text-blue-700 font-medium mt-1"
          >
            Open calendar to add content
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const plat = PLATFORM_LABEL[item.platform] ?? {
              short: item.platform,
              color: "text-gray-600 bg-gray-50",
            };
            const brandStyle = BRAND_BADGE[item.brand] ?? "";
            const dot = STATUS_DOT[item.status] ?? STATUS_DOT.Draft;

            return (
              <Link
                key={item.id}
                href="/content-calendar"
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors group"
              >
                {/* Status dot */}
                <span className={clsx("w-2 h-2 rounded-full shrink-0", dot)} />

                {/* Brand badge */}
                {showBrand && (
                  <span
                    className={clsx(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 uppercase tracking-wide",
                      brandStyle
                    )}
                  >
                    {item.brand}
                  </span>
                )}

                {/* Platform chip */}
                <span
                  className={clsx(
                    "px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0",
                    plat.color
                  )}
                >
                  {plat.short}
                </span>

                {/* Description */}
                <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-blue-600 transition-colors">
                  {item.content_type}: {item.description}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/content-calendar"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View full calendar
        </Link>
      </div>
    </div>
  );
}
