import { useMemo } from "react";
import CalendarDay from "./CalendarDay";
import { ContentItem } from "./types";
import type { Promotion } from "@/components/promotions/types";

export type DayPromo = {
  id: string;
  name: string;
  code: string | null;
  color: string;       // tailwind bg class
  textColor: string;   // tailwind text class
  isStart: boolean;     // first day of range (or first visible day in this week)
  isEnd: boolean;       // last day of range (or last visible day in this week)
  isWeekStart: boolean; // first day in this calendar week (show label)
};

const PROMO_COLORS = [
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
];

export default function CalendarView({
  month,
  items,
  promotions = [],
  onSelectDate,
}: {
  month: Date;
  items: ContentItem[];
  promotions?: Promotion[];
  onSelectDate: (iso: string) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();

  const first = new Date(year, m, 1);
  const last = new Date(year, m + 1, 0);

  const startDayIndex = first.getDay();
  const totalDays = last.getDate();

  function iso(d: Date) {
    return d.toISOString().split("T")[0];
  }

  function isPast(d: Date) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return d < t;
  }

  function isToday(d: Date) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return d.getTime() === t.getTime();
  }

  /* ---------------------------------------------
     Pre-group items by date (performance)
  --------------------------------------------- */
  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const item of items) {
      if (!map[item.publish_date]) {
        map[item.publish_date] = [];
      }
      map[item.publish_date].push(item);
    }
    return map;
  }, [items]);

  /* ---------------------------------------------
     Pre-compute promotions per date
  --------------------------------------------- */
  const promosByDate = useMemo(() => {
    const map: Record<string, DayPromo[]> = {};

    // Only include active/scheduled promotions with date ranges
    const relevant = promotions.filter(
      (p) => (p.status === "active" || p.status === "scheduled") && p.starts_at
    );

    const monthStart = iso(first);
    const monthEnd = iso(last);

    relevant.forEach((promo, idx) => {
      const colorSet = PROMO_COLORS[idx % PROMO_COLORS.length];
      const promoStart = promo.starts_at.split("T")[0];
      const promoEnd = promo.ends_at ? promo.ends_at.split("T")[0] : monthEnd;

      // Clamp to visible month
      const visStart = promoStart < monthStart ? monthStart : promoStart;
      const visEnd = promoEnd > monthEnd ? monthEnd : promoEnd;

      // Walk each day in the range
      const cur = new Date(visStart + "T00:00:00");
      const end = new Date(visEnd + "T00:00:00");

      while (cur <= end) {
        const dateISO = iso(cur);
        const dayOfWeek = cur.getDay(); // 0=Sun

        if (!map[dateISO]) map[dateISO] = [];
        map[dateISO].push({
          id: promo.id,
          name: promo.name,
          code: promo.code,
          color: colorSet.bg,
          textColor: colorSet.text,
          isStart: dateISO === promoStart,
          isEnd: dateISO === promoEnd,
          isWeekStart: dateISO === promoStart || dayOfWeek === 0,
        });

        cur.setDate(cur.getDate() + 1);
      }
    });

    return map;
  }, [promotions, first, last]);

  return (
    <>
      {/* Day labels */}
      <div className="grid grid-cols-7 text-xs text-gray-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center py-1 font-medium"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className="
          grid
          grid-cols-7
          gap-px
          bg-gray-200
          rounded-xl
          overflow-hidden
        "
      >
        {/* Leading empty days */}
        {Array.from({ length: startDayIndex }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="
              bg-white
              h-24 lg:h-28
            "
          />
        ))}

        {/* Month days */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const date = new Date(year, m, day);
          const dateISO = iso(date);

          return (
            <CalendarDay
              key={dateISO}
              day={day}
              dateISO={dateISO}
              past={isPast(date)}
              isToday={isToday(date)}
              items={itemsByDate[dateISO] ?? []}
              promos={promosByDate[dateISO] ?? []}
              onClick={() => onSelectDate(dateISO)}
            />
          );
        })}
      </div>
    </>
  );
}
