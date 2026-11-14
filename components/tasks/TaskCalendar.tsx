"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import clsx from "clsx";

import { getOwnerColor } from "@/lib/team-owners";
import type { Task } from "@/components/tasks/AddTaskModal";

/* ─── Date helpers (local-time, no UTC drift) ─── */

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ═══════════════════════════════════════════════════
   TASK CALENDAR — month grid, tasks on their due date
   ═══════════════════════════════════════════════════ */

export function TaskCalendar({
  tasks,
  onClickTask,
  onNewTaskOnDay,
}: {
  tasks: Task[];
  onClickTask: (t: Task) => void;
  onNewTaskOnDay: (iso: string) => void;
}) {
  // The month currently in view — start on the month containing today.
  const [month, setMonth] = useState<Date>(() => {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const last = new Date(year, m + 1, 0);
  const startDayIndex = first.getDay();
  const totalDays = last.getDate();

  const todayISO = localISO(startOfToday());

  // Group tasks by due date (ignore the undated — they have no cell to live in).
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      (map[t.due_date] ??= []).push(t);
    }
    // Within a day, surface the not-done ones first.
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const ad = (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0);
        if (ad !== 0) return ad;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [tasks]);

  const undatedCount = useMemo(
    () => tasks.filter((t) => !t.due_date && t.status !== "done").length,
    [tasks],
  );

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function shiftMonth(delta: number) {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToday() {
    const t = startOfToday();
    setMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }

  return (
    <div className="space-y-2">
      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => shiftMonth(-1)}
          className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:border-gray-300 hover:text-gray-900 transition"
          aria-label="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => shiftMonth(1)}
          className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:border-gray-300 hover:text-gray-900 transition"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
        <span className="text-sm font-semibold text-gray-900 min-w-[150px]">{monthLabel}</span>
        <button
          onClick={goToday}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:border-gray-300 hover:text-gray-900 transition"
        >
          Today
        </button>
        {undatedCount > 0 && (
          <span className="ml-auto text-xs text-gray-400">
            {undatedCount} task{undatedCount === 1 ? "" : "s"} with no due date
          </span>
        )}
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px rounded-xl bg-gray-200 overflow-hidden border border-gray-200">
        {/* Leading blanks */}
        {Array.from({ length: startDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-gray-50/60 h-28 lg:h-32" />
        ))}

        {/* Days */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const date = new Date(year, m, day);
          const iso = localISO(date);
          const isToday = iso === todayISO;
          const isPast = iso < todayISO;
          const dayTasks = tasksByDate[iso] ?? [];

          return (
            <CalendarDay
              key={iso}
              day={day}
              iso={iso}
              isToday={isToday}
              isPast={isPast}
              tasks={dayTasks}
              onClickTask={onClickTask}
              onNewTask={() => onNewTaskOnDay(iso)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Single day cell ─── */

const MAX_VISIBLE = 3;

function CalendarDay({
  day,
  iso,
  isToday,
  isPast,
  tasks,
  onClickTask,
  onNewTask,
}: {
  day: number;
  iso: string;
  isToday: boolean;
  isPast: boolean;
  tasks: Task[];
  onClickTask: (t: Task) => void;
  onNewTask: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, MAX_VISIBLE);
  const hiddenCount = tasks.length - visible.length;

  return (
    <div
      onClick={onNewTask}
      className={clsx(
        "group relative bg-white h-28 lg:h-32 p-1.5 flex flex-col cursor-pointer transition hover:bg-gray-50",
        isPast && "bg-gray-50/40",
      )}
    >
      {/* Day number + quick add */}
      <div className="flex items-center justify-between shrink-0">
        <span
          className={clsx(
            "inline-flex items-center justify-center text-[11px] font-semibold tabular-nums",
            isToday
              ? "h-5 w-5 rounded-full bg-gray-900 text-white"
              : isPast
                ? "text-gray-400"
                : "text-gray-600",
          )}
        >
          {day}
        </span>
        <Plus
          size={13}
          className="opacity-0 group-hover:opacity-100 text-gray-400 transition"
        />
      </div>

      {/* Task chips */}
      <div className="mt-0.5 flex-1 min-h-0 space-y-0.5 overflow-y-auto">
        {visible.map((t) => (
          <TaskChip key={t.id} task={t} isPast={isPast} onClick={onClickTask} />
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className="w-full text-left text-[10px] font-medium text-gray-400 hover:text-gray-700 px-1"
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Task chip ─── */

function TaskChip({
  task,
  isPast,
  onClick,
}: {
  task: Task;
  isPast: boolean;
  onClick: (t: Task) => void;
}) {
  const isDone = task.status === "done";
  const isOverdue = isPast && !isDone;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      title={task.name}
      className={clsx(
        "w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition",
        isDone
          ? "bg-gray-50 text-gray-400 line-through hover:bg-gray-100"
          : isOverdue
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "bg-gray-50 text-gray-700 hover:bg-gray-100",
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          task.owner ? getOwnerColor(task.owner) : "bg-gray-300",
        )}
      />
      <span className="truncate">{task.name}</span>
    </button>
  );
}
