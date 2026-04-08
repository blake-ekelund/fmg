"use client";

import { useCallback, useReducer } from "react";
import { useUser } from "@/components/UserContext";
import { useDashboardTasks } from "./hooks/useDashboardTasks";
import { useDashboardRecentlyCompleted } from "./hooks/useDashboardRecentlyCompleted";
import { supabase } from "@/lib/supabaseClient";
import { Circle, CheckCircle2, Plus, ListTodo } from "lucide-react";
import { AddTaskModal } from "@/components/tasks/AddTaskModal";
import Link from "next/link";
import clsx from "clsx";
import { useState } from "react";
import type { Task } from "@/components/tasks/AddTaskModal";

const PRIORITY_DOT: Record<string, string> = {
  High: "bg-rose-400",
  Medium: "bg-amber-400",
  Low: "bg-gray-300",
};

function formatDue(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/* ─── Progress Ring (compact) ─── */
function ProgressRing({ done, total, size = 36 }: { done: number; total: number; size?: number }) {
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? done / total : 0;
  const offset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="#10b981" strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700 ease-out"
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="fill-gray-700 text-[9px] font-bold">
        {done}/{total}
      </text>
    </svg>
  );
}

/* ─── Compact task row ─── */
function TaskRow({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 py-1 group">
      <button
        onClick={() => onComplete(task.id)}
        className="text-gray-300 hover:text-emerald-500 transition-colors shrink-0"
      >
        <Circle size={14} />
      </button>
      <span className="text-xs text-gray-700 truncate flex-1">{task.name}</span>
      {task.priority && (
        <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority] ?? "bg-gray-300")} />
      )}
    </div>
  );
}

/* ─── Main header panel ─── */
export default function HeaderTaskPanel() {
  const { profile } = useUser();
  const [refreshKey, forceRefresh] = useReducer((x: number) => x + 1, 0);
  const { overdue, dueToday, dueThisWeek, loading } = useDashboardTasks(profile?.first_name, refreshKey);
  const [showModal, setShowModal] = useState(false);

  const handleComplete = useCallback(async (id: string) => {
    await supabase.from("tasks").update({ status: "done", completed: true }).eq("id", id);
    forceRefresh();
  }, []);

  const totalTasks = overdue.length + dueToday.length + dueThisWeek.length;

  // Combine and limit to ~6 tasks for the compact view
  const urgentTasks = [...overdue, ...dueToday, ...dueThisWeek].slice(0, 6);
  const hasMore = totalTasks > 6;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 w-full lg:w-[340px] xl:w-[380px] shrink-0">
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div id="widget-tasks" className="rounded-2xl border border-gray-200 bg-white p-4 w-full lg:w-[340px] xl:w-[380px] shrink-0 scroll-mt-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <ProgressRing done={0} total={totalTasks} size={36} />
            <div>
              <div className="text-sm font-semibold text-gray-800">My Tasks</div>
              <div className="text-[10px] text-gray-400">
                {totalTasks === 0 ? "All clear" : `${totalTasks} this week`}
                {overdue.length > 0 && (
                  <span className="text-rose-500 font-medium"> · {overdue.length} overdue</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            title="New task"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Task list */}
        {totalTasks === 0 ? (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <CheckCircle2 size={20} className="mr-2 text-emerald-400" />
            <span className="text-xs font-medium">You're all caught up!</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {overdue.length > 0 && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400 mt-1 mb-0.5">
                Overdue
              </div>
            )}
            {overdue.slice(0, 3).map((t) => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} />
            ))}

            {dueToday.length > 0 && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 mt-2 mb-0.5">
                Due Today
              </div>
            )}
            {dueToday.slice(0, 3).map((t) => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} />
            ))}

            {dueThisWeek.length > 0 && overdue.length + dueToday.length < 5 && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 mt-2 mb-0.5">
                  This Week
                </div>
                {dueThisWeek.slice(0, Math.max(1, 6 - overdue.length - dueToday.length)).map((t) => (
                  <TaskRow key={t.id} task={t} onComplete={handleComplete} />
                ))}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
          <Link href="/task-list" className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">
            {hasMore ? `View all ${totalTasks} tasks` : "Task board"} →
          </Link>
        </div>
      </div>

      <AddTaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          forceRefresh();
        }}
      />
    </>
  );
}
