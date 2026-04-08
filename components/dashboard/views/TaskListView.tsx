"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { Task } from "@/components/tasks/AddTaskModal";

const PRIORITY_STYLE: Record<string, string> = {
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-gray-100 text-gray-500",
};

function formatDueDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <button
        onClick={() => onComplete(task.id)}
        className="text-gray-300 hover:text-emerald-500 transition-colors shrink-0"
      >
        <Circle size={16} />
      </button>
      <span className="text-sm text-gray-800 truncate flex-1">{task.name}</span>
      {task.priority && (
        <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.Low)}>
          {task.priority}
        </span>
      )}
      {task.due_date && (
        <span className="text-[11px] text-gray-400 shrink-0">{formatDueDate(task.due_date)}</span>
      )}
    </div>
  );
}

function TaskGroup({ label, tasks, accent, onComplete }: {
  label: string;
  tasks: Task[];
  accent: string;
  onComplete: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className={clsx("border-l-2 pl-3 py-1", accent)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      {tasks.map((t) => <TaskRow key={t.id} task={t} onComplete={onComplete} />)}
    </div>
  );
}

type Props = {
  overdue: Task[];
  dueToday: Task[];
  dueThisWeek: Task[];
  loading: boolean;
  onComplete: (id: string) => void;
};

export default function TaskListView({ overdue, dueToday, dueThisWeek, loading, onComplete }: Props) {
  const totalTasks = overdue.length + dueToday.length + dueThisWeek.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (totalTasks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <CheckCircle2 size={32} className="mb-2 text-emerald-400" />
        <span className="text-sm font-medium">You're all caught up!</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TaskGroup label="Overdue" tasks={overdue} accent="border-rose-400" onComplete={onComplete} />
      <TaskGroup label="Due Today" tasks={dueToday} accent="border-amber-400" onComplete={onComplete} />
      <TaskGroup label="This Week" tasks={dueThisWeek} accent="border-sky-400" onComplete={onComplete} />
      <div className="pt-2 border-t border-gray-100">
        <Link href="/task-list" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View all tasks
        </Link>
      </div>
    </div>
  );
}
