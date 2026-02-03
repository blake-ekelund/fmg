import { useMemo } from "react";
import CalendarDay from "./CalendarDay";
import { ContentItem } from "./types";

export default function CalendarView({
  month,
  items,
  onSelectDate,
}: {
  month: Date;
  items: ContentItem[];
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
              onClick={() => onSelectDate(dateISO)}
            />
          );
        })}
      </div>
    </>
  );
}
