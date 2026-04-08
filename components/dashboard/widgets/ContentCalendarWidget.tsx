"use client";

import { useUser } from "@/components/UserContext";
import { useBrand } from "@/components/BrandContext";
import { useDashboardContentCalendar } from "../hooks/useDashboardContentCalendar";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { ContentItem } from "@/components/marketing/content-calendar/types";

const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Review: "bg-amber-100 text-amber-700",
  Published: "bg-emerald-100 text-emerald-700",
};

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: "text-pink-600",
  Facebook: "text-blue-600",
  TikTok: "text-gray-800",
  Shopify: "text-green-600",
  "Subscriber-List": "text-violet-600",
};

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function groupByDay(items: ContentItem[]): [string, ContentItem[]][] {
  const map = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = item.publish_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries());
}

export default function ContentCalendarWidget() {
  const { profile } = useUser();
  const { brand } = useBrand();
  const { items, loading } = useDashboardContentCalendar(brand);

  // Role gate: only owner/admin
  if (!profile || (profile.access !== "owner" && profile.access !== "admin")) {
    return null;
  }

  const grouped = groupByDay(items);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Content This Week</h2>
        </div>
        <Link href="/content-calendar" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View calendar
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <CalendarDays size={32} className="mb-2" />
          <span className="text-sm font-medium">No content scheduled this week</span>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, dayItems]) => (
            <div key={date}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                {dayLabel(date)}
              </div>
              <div className="space-y-1.5">
                {dayItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className={clsx("font-medium text-xs w-20 shrink-0", PLATFORM_COLOR[item.platform] ?? "text-gray-600")}>
                      {item.platform}
                    </span>
                    <span className="text-gray-700 truncate flex-1">{item.content_type}: {item.description}</span>
                    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0", STATUS_STYLE[item.status] ?? STATUS_STYLE.Draft)}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
