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

  return (
    <>
      <div className="grid grid-cols-7 text-xs text-gray-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: startDayIndex }).map((_, i) => (
          <div key={i} className="bg-white h-28" />
        ))}

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
              items={items.filter(
                (item) => item.publish_date === dateISO
              )}
              onClick={() => onSelectDate(dateISO)}
            />
          );
        })}
      </div>
    </>
  );
}
