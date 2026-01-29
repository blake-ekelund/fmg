"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Task, Workspace, WorkspaceMember } from "./types";
import TasksTable from "./ui/TasksTable";
import TaskModal from "./ui/TaskModal";

export default function WorkspacePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data: ws } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", auth.user.id)
        .single();

      setWorkspace(ws);

      const [{ data: m }, { data: t }] = await Promise.all([
        supabase
          .from("workspace_members")
          .select("*")
          .eq("workspace_id", ws.id),
        supabase
          .from("tasks")
          .select("*")
          .eq("workspace_id", ws.id)
          .order("created_at", { ascending: false }),
      ]);

      setMembers(m ?? []);
      setTasks((t ?? []) as Task[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Workspace
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl">
            Shared tasks and coordination across your team.
          </p>
        </div>

        <button
          onClick={() => {
            setActiveTask(null);
            setModalOpen(true);
          }}
          className="rounded-xl bg-orange-800 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          New Task
        </button>
      </header>

      {/* Tasks */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-2">
          Tasks
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          What needs to be done, who owns it, and when it’s finished.
        </p>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <TasksTable
            tasks={tasks}
            onEdit={(t) => {
              setActiveTask(t);
              setModalOpen(true);
            }}
            onToggleDone={async (task, next) => {
              await supabase
                .from("tasks")
                .update({
                  is_done: next,
                  done_at: next ? new Date().toISOString() : null,
                })
                .eq("id", task.id);

              setTasks((prev) =>
                prev.map((t) =>
                  t.id === task.id
                    ? { ...t, is_done: next, done_at: next ? new Date().toISOString() : null }
                    : t
                )
              );
            }}
          />
        )}
      </section>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={activeTask}
        workspaceId={workspace?.id ?? null}
        members={members}
        onSaved={loadAll}
      />
    </div>
  );
}
