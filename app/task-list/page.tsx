"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Table } from "@/components/tasks/Table";
import { TableHeader } from "@/components/tasks/TableHeader";
import { TableRow } from "@/components/tasks/TableRow";
import { AddTaskModal, Task } from "@/components/tasks/AddTaskModal";
import { DeleteTaskModal } from "@/components/tasks/DeleteTaskModal";
import { FiltersRow } from "@/components/tasks/FiltersRow";

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  // Filters (defaults matter)
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open"); // ✅ default
  const [owner, setOwner] = useState("");       // All Owners
  const [priority, setPriority] = useState(""); // All Priorities

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    setTasks(data ?? []);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  function openTask(id: string) {
    const task = tasks.find((t) => t.id === id) ?? null;
    setActiveTask(task);
    setOpen(true);
  }

  function toggleComplete(id: string, completed: boolean) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed } : t))
    );
  }

  async function confirmDelete() {
    if (!deleteTask) return;

    await supabase.from("tasks").delete().eq("id", deleteTask.id);
    setDeleteTask(null);
    loadTasks();
  }

  // Derived filtered list
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (
        search &&
        !task.name.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }

      if (status === "completed" && !task.completed) return false;
      if (status === "open" && task.completed) return false;

      if (owner && task.owner !== owner) return false;
      if (priority && task.priority !== priority) return false;

      return true;
    });
  }, [tasks, search, status, owner, priority]);

  return (
    <>
      <div className="px-8 py-10 space-y-10">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">
              Tasks
            </h1>
            <p className="mt-3 text-gray-500">
              Click a task to edit. Changes save immediately.
            </p>
          </div>

          <button
            onClick={() => {
              setActiveTask(null);
              setOpen(true);
            }}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            Add New Task
          </button>
        </header>

        {/* Filters */}
        <FiltersRow
          search={search}
          status={status}
          owner={owner}
          priority={priority}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onOwnerChange={setOwner}
          onPriorityChange={setPriority}
        />

        {/* Table */}
        <section>
          <Table>
            <TableHeader />
            {filteredTasks.map((task) => (
              <TableRow
                key={task.id}
                {...task}
                onOpen={openTask}
                onToggleComplete={toggleComplete}
                onRequestDelete={(id) => {
                  const t =
                    tasks.find((x) => x.id === id) ?? null;
                  setDeleteTask(t);
                }}
              />
            ))}
          </Table>
        </section>
      </div>

      <AddTaskModal
        open={open}
        task={activeTask}
        onClose={() => setOpen(false)}
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
