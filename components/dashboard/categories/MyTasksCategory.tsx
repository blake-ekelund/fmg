"use client";

import { useCallback, useReducer } from "react";
import { useUser } from "@/components/UserContext";
import { useDashboardTasks } from "../hooks/useDashboardTasks";
import { useDashboardRecentlyCompleted } from "../hooks/useDashboardRecentlyCompleted";
import { supabase } from "@/lib/supabaseClient";
import { ListTodo, CheckCircle2 } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import TaskListView from "../views/TaskListView";
import InlineCreateTaskView from "../views/InlineCreateTaskView";
import PlaceholderView from "../views/PlaceholderView";

function RecentlyCompletedView({ tasks, loading }: { tasks: { id: string; name: string; created_at: string }[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <span className="text-sm font-medium">No completed tasks yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 py-1">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-gray-600 line-through decoration-gray-300 truncate">{t.name}</span>
        </div>
      ))}
    </div>
  );
}

export default function MyTasksCategory() {
  const { profile } = useUser();
  const [refreshKey, forceRefresh] = useReducer((x: number) => x + 1, 0);
  const { overdue, dueToday, dueThisWeek, loading } = useDashboardTasks(profile?.first_name, refreshKey);
  const { tasks: recentDone, loading: doneLoading } = useDashboardRecentlyCompleted(profile?.first_name, refreshKey);

  const handleComplete = useCallback(async (id: string) => {
    await supabase.from("tasks").update({ status: "done", completed: true }).eq("id", id);
    forceRefresh();
  }, []);

  const handleCreated = useCallback(() => {
    forceRefresh();
  }, []);

  const overdueCount = overdue.length;

  return (
    <DashboardWidgetShell
      id="widget-tasks"
      icon={ListTodo}
      title="My Tasks"
      storageKey="tasks"
      tabs={[
        {
          label: "List",
          badge: overdueCount > 0 ? overdueCount : undefined,
          content: (
            <TaskListView
              overdue={overdue}
              dueToday={dueToday}
              dueThisWeek={dueThisWeek}
              loading={loading}
              onComplete={handleComplete}
            />
          ),
        },
        {
          label: "Create",
          content: <InlineCreateTaskView onCreated={handleCreated} />,
        },
        {
          label: "Completed",
          content: <RecentlyCompletedView tasks={recentDone} loading={doneLoading} />,
        },
      ]}
    />
  );
}
