"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Task } from "@/components/tasks/AddTaskModal";

export function useDashboardRecentlyCompleted(ownerName: string | undefined, refreshKey?: number) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerName) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .ilike("owner", ownerName)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(4);

      setTasks((data as Task[]) ?? []);
      setLoading(false);
    })();
  }, [ownerName, refreshKey]);

  return { tasks, loading };
}
