"use client";

import { useUser } from "@/components/UserContext";
import { useDashboardTasks } from "../hooks/useDashboardTasks";
import { supabase } from "@/lib/supabaseClient";
import { ListTodo, CheckCircle2, Circle } from "lucide-react";
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

export default function MyTasksWidget() {
  const { profile } = useUser();
  const { overdue, dueToday, dueThisWeek, loading } = useDashboardTasks(profile?.first_name);

  const handleComplete = async (id: string) => {
    await supabase.from("tasks").update({ status: "done", completed: true }).eq("id", id);
    // Optimistic — just remove from the lists by forcing a re-render via page
    window.location.reload();
  };

  const totalTasks = overdue.length + dueToday.length + dueThisWeek.length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListTodo size={18} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">My Tasks</h2>
        </div>
        <Link href="/task-list" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View all
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : totalTasks === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <CheckCircle2 size={32} className="mb-2 text-emerald-400" />
          <span className="text-sm font-medium">You're all caught up!</span>
        </div>
      ) : (
        <div className="space-y-3">
          <TaskGroup label="Overdue" tasks={overdue} accent="border-rose-400" onComplete={handleComplete} />
          <TaskGroup label="Due Today" tasks={dueToday} accent="border-amber-400" onComplete={handleComplete} />
          <TaskGroup label="This Week" tasks={dueThisWeek} accent="border-sky-400" onComplete={handleComplete} />
        </div>
      )}
    </div>
  );
}
