"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Clock,
  AlertCircle,
  Trash2,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/ui/PageHeader";
import { AddTaskModal, type Task, type TaskStatus } from "@/components/tasks/AddTaskModal";
import { DeleteTaskModal } from "@/components/tasks/DeleteTaskModal";

/* ─── Constants ─── */

const OWNERS = ["Blake", "Brooke", "Julie", "Liz"];

const OWNER_COLORS: Record<string, string> = {
  Blake: "bg-blue-500",
  Brooke: "bg-purple-500",
  Julie: "bg-amber-500",
  Liz: "bg-rose-500",
};

type ViewMode = "list" | "calendar";

/* ─── Main Page ─── */

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");

  // Filters
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showDone, setShowDone] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>("todo");
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ─── Filtering ─── */

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!showDone && (t.status ?? "todo") === "done") return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter && t.owner !== ownerFilter) return false;
      return true;
    });
  }, [tasks, search, ownerFilter, showDone]);

  /* ─── Sorted flat list ─── */

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      // Status weight: in_progress first, then todo, then done
      const sw: Record<string, number> = { in_progress: 0, todo: 1, done: 2 };
      const sa = sw[(a.status ?? "todo")] ?? 1;
      const sb = sw[(b.status ?? "todo")] ?? 1;
      if (sa !== sb) return sa - sb;
      // Priority weight
      const pw: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
      const pa = pw[a.priority ?? "Medium"] ?? 1;
      const pb = pw[b.priority ?? "Medium"] ?? 1;
      if (pa !== pb) return pa - pb;
      // Due date
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filteredTasks]);

  /* ─── Actions ─── */

  function openNewTask(status: TaskStatus = "todo") {
    setEditTask(null);
    setDefaultStatus(status);
    setModalOpen(true);
  }

  function openEditTask(task: Task) {
    setEditTask(task);
    setModalOpen(true);
  }

  async function changeStatus(task: Task, newStatus: TaskStatus) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newStatus, completed: newStatus === "done" } : t
      )
    );
    await supabase
      .from("tasks")
      .update({ status: newStatus, completed: newStatus === "done" })
      .eq("id", task.id);
  }

  async function confirmDelete() {
    if (!deleteTask) return;
    await supabase.from("tasks").delete().eq("id", deleteTask.id);
    setDeleteTask(null);
    loadTasks();
  }

  return (
    <>
      <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
        <PageHeader subtitle="Manage and track team tasks">
          <button
            onClick={() => openNewTask("todo")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-sm transition"
          >
            <Plus size={15} />
            New Task
          </button>
        </PageHeader>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Owner pills */}
          <div className="flex gap-1">
            {OWNERS.map((o) => (
              <button
                key={o}
                onClick={() => setOwnerFilter(ownerFilter === o ? "" : o)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition inline-flex items-center gap-1.5",
                  ownerFilter === o
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                )}
              >
                <span className={clsx("h-2 w-2 rounded-full", OWNER_COLORS[o])} />
                {o}
              </button>
            ))}
          </div>

          {/* Show completed toggle */}
          <button
            onClick={() => setShowDone(!showDone)}
            className={clsx(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              showDone
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
            )}
          >
            Show completed
          </button>

          {/* View toggle */}
          <div className="flex gap-0.5 ml-auto rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => setView("list")}
              className={clsx(
                "rounded-md px-2.5 py-1.5 transition",
                view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={clsx(
                "rounded-md px-2.5 py-1.5 transition",
                view === "calendar" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <CalendarDays size={14} />
            </button>
          </div>
        </div>

        {/* ─── Content ─── */}
        {view === "list" ? (
          <ListView
            tasks={sortedTasks}
            loading={loading}
            onClickTask={openEditTask}
            onStatusChange={changeStatus}
            onDelete={(t) => setDeleteTask(t)}
            onAdd={openNewTask}
          />
        ) : (
          <CalendarView
            tasks={filteredTasks}
            month={calMonth}
            onMonthChange={setCalMonth}
            onClickTask={openEditTask}
            onAdd={(date) => {
              setEditTask(null);
              setDefaultStatus("todo");
              setModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Modals */}
      <AddTaskModal
        open={modalOpen}
        task={editTask}
        defaultStatus={defaultStatus}
        onClose={() => setModalOpen(false)}
        onSaved={loadTasks}
      />
      <DeleteTaskModal
        open={!!deleteTask}
        taskName={deleteTask?.name}
        onCancel={() => setDeleteTask(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════
   LIST VIEW — single flat table
   ═══════════════════════════════════════════════════ */

function ListView({
  tasks,
  loading,
  onClickTask,
  onStatusChange,
  onDelete,
  onAdd,
}: {
  tasks: Task[];
  loading: boolean;
  onClickTask: (t: Task) => void;
  onStatusChange: (t: Task, s: TaskStatus) => void;
  onDelete: (t: Task) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading tasks…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-sm text-gray-400">No tasks match your filters</div>
        <button
          onClick={() => onAdd("todo")}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
        >
          <Plus size={14} /> Create a task
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Table header */}
      <div className="hidden md:grid grid-cols-[1fr_130px_90px_100px_80px_36px] gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Task</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Status</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Priority</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Due Date</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Owner</span>
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onClick={() => onClickTask(task)}
            onStatusChange={(s) => onStatusChange(task, s)}
            onDelete={() => onDelete(task)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Task Row ─── */

const STATUS_DROPDOWN: { value: TaskStatus; label: string; dot: string }[] = [
  { value: "todo", label: "To Do", dot: "bg-gray-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-blue-500" },
  { value: "done", label: "Done", dot: "bg-green-500" },
];

function TaskRow({
  task,
  onClick,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onClick: () => void;
  onStatusChange: (s: TaskStatus) => void;
  onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const isOverdue = task.due_date && new Date(task.due_date + "T23:59:59") < new Date() && !isDone;
  const currentStatus = STATUS_DROPDOWN.find((s) => s.value === (task.status ?? "todo")) ?? STATUS_DROPDOWN[0];

  return (
    <div
      onClick={onClick}
      className={clsx(
        "grid grid-cols-1 md:grid-cols-[1fr_130px_90px_100px_80px_36px] gap-2 md:gap-3 px-4 py-3 group cursor-pointer transition items-center",
        isOverdue ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-gray-50"
      )}
    >
      {/* Task name + description */}
      <div className="min-w-0">
        <div className={clsx("text-sm font-medium truncate", isDone ? "text-gray-400 line-through" : "text-gray-900")}>
          {task.name}
        </div>
        {task.description && (
          <div className="text-xs text-gray-500 truncate mt-0.5">{task.description}</div>
        )}
      </div>

      {/* Status dropdown */}
      <div onClick={(e) => e.stopPropagation()}>
        <select
          value={task.status ?? "todo"}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          className={clsx(
            "w-full rounded-lg border px-2 py-1.5 text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300 transition",
            task.status === "done"
              ? "border-green-200 bg-green-50 text-green-700"
              : task.status === "in_progress"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          )}
        >
          {STATUS_DROPDOWN.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div>
        {task.priority ? (
          <span
            className={clsx("text-[10px] font-medium rounded px-1.5 py-0.5", {
              "bg-red-100 text-red-700": task.priority === "High",
              "bg-amber-100 text-amber-700": task.priority === "Medium",
              "bg-gray-100 text-gray-500": task.priority === "Low",
            })}
          >
            {task.priority}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Due date */}
      <div>
        {task.due_date ? (
          <span
            className={clsx("inline-flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap", {
              "text-red-600 font-medium": isOverdue,
              "text-gray-500": !isOverdue,
            })}
          >
            {isOverdue && <AlertCircle size={10} />}
            <Clock size={10} />
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Owner avatar */}
      <div>
        {task.owner ? (
          <span
            className={clsx(
              "inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold text-white",
              OWNER_COLORS[task.owner] ?? "bg-gray-400"
            )}
            title={task.owner}
          >
            {task.owner[0]}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Delete */}
      <div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CALENDAR VIEW
   ═══════════════════════════════════════════════════ */

function CalendarView({
  tasks,
  month,
  onMonthChange,
  onClickTask,
  onAdd,
}: {
  tasks: Task[];
  month: Date;
  onMonthChange: (d: Date) => void;
  onClickTask: (t: Task) => void;
  onAdd: (date: string) => void;
}) {
  const year = month.getFullYear();
  const mo = month.getMonth();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build a map of date → tasks
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (!t.due_date) return;
      if (!map[t.due_date]) map[t.due_date] = [];
      map[t.due_date].push(t);
    });
    return map;
  }, [tasks]);

  // Calendar grid: weeks × 7 days
  const firstDay = new Date(year, mo, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, mo + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  function dateStr(day: number) {
    return `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Count tasks without due dates
  const unscheduled = tasks.filter((t) => !t.due_date && t.status !== "done");

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onMonthChange(new Date(year, mo - 1, 1))}
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition"
        >
          <ChevronLeft size={16} />
        </button>

        <h2 className="text-sm font-semibold text-gray-900">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>

        <button
          onClick={() => onMonthChange(new Date(year, mo + 1, 1))}
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100 last:border-b-0">
            {week.map((day, di) => {
              if (day === null) {
                return <div key={di} className="min-h-[100px] bg-gray-50/50" />;
              }

              const ds = dateStr(day);
              const dayTasks = tasksByDate[ds] ?? [];
              const isToday = ds === todayStr;

              return (
                <div
                  key={di}
                  className={clsx(
                    "min-h-[100px] p-1.5 transition hover:bg-gray-50/50 cursor-pointer",
                    isToday && "bg-blue-50/30"
                  )}
                  onClick={() => onAdd(ds)}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={clsx(
                        "text-xs font-medium tabular-nums h-6 w-6 flex items-center justify-center rounded-full",
                        isToday
                          ? "bg-blue-600 text-white"
                          : "text-gray-700"
                      )}
                    >
                      {day}
                    </span>
                  </div>

                  {/* Task chips */}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickTask(t);
                        }}
                        className={clsx(
                          "w-full text-left rounded px-1.5 py-0.5 text-[10px] font-medium truncate transition",
                          t.status === "done"
                            ? "bg-green-50 text-green-700 line-through"
                            : t.priority === "High"
                            ? "bg-red-50 text-red-700"
                            : t.priority === "Medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-gray-100 text-gray-700"
                        )}
                      >
                        {t.name}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[9px] text-gray-400 font-medium px-1.5">
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              No Due Date
            </span>
            <span className="text-[10px] font-medium text-gray-400 tabular-nums">
              {unscheduled.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                onClick={() => onClickTask(t)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:shadow-sm inline-flex items-center gap-1.5",
                  t.priority === "High"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : t.priority === "Medium"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-gray-200 bg-gray-50 text-gray-700"
                )}
              >
                {t.owner && (
                  <span className={clsx("h-2 w-2 rounded-full shrink-0", OWNER_COLORS[t.owner] ?? "bg-gray-400")} />
                )}
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
