"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Task } from "@/components/tasks/AddTaskModal";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday: toDateStr(monday), sunday: toDateStr(sunday) };
}

export type DashboardTasks = {
  overdue: Task[];
  dueToday: Task[];
  dueThisWeek: Task[];
  loading: boolean;
};

export function useDashboardTasks(ownerName: string | undefined, refreshKey?: number): DashboardTasks {
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [dueToday, setDueToday] = useState<Task[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerName) {
      setLoading(false);
      return;
    }

    (async () => {
      const { monday, sunday } = getWeekBounds();
      const today = toDateStr(new Date());

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .ilike("owner", ownerName)
        .neq("status", "done")
        .lte("due_date", sunday)
        .order("due_date", { ascending: true });

      const tasks = (data as Task[]) ?? [];

      const od: Task[] = [];
      const td: Task[] = [];
      const tw: Task[] = [];

      for (const t of tasks) {
        if (!t.due_date) continue;
        if (t.due_date < today) od.push(t);
        else if (t.due_date === today) td.push(t);
        else if (t.due_date >= monday && t.due_date <= sunday) tw.push(t);
      }

      setOverdue(od);
      setDueToday(td);
      setDueThisWeek(tw);
      setLoading(false);
    })();
  }, [ownerName, refreshKey]);

  return { overdue, dueToday, dueThisWeek, loading };
}
