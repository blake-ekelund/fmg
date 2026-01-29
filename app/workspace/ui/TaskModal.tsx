"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Task, TaskComment, WorkspaceMember } from "../types";
import { X } from "lucide-react";

export default function TaskModal({
  open,
  onClose,
  task,
  workspaceId,
  members,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  workspaceId: string | null;
  members: WorkspaceMember[];
  onSaved: () => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const isEdit = Boolean(task);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
  }, [open, task]);

  async function save() {
    if (!workspaceId || !title.trim()) return;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    if (!isEdit) {
      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        title,
        description: description || null,
        owner_id: auth.user.id,
        created_by: auth.user.id,
      });
    } else {
      await supabase
        .from("tasks")
        .update({ title, description })
        .eq("id", task!.id);
    }

    onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-medium">
              {isEdit ? "Edit Task" : "New Task"}
            </h2>
            <p className="text-sm text-gray-500">
              {isEdit ? "Update task details" : "Create a new task"}
            </p>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-xl bg-orange-800 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
