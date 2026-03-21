"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "High" | "Medium" | "Low";

export type Task = {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  priority: string | null;
  notes: string | null;
  completed: boolean | null;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
};

const OWNERS = ["Blake", "Brooke", "Julie", "Liz"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

type Props = {
  open: boolean;
  task?: Task | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSaved: () => void;
};

export function AddTaskModal({ open, task, defaultStatus, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? "todo");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description ?? "");
      setOwner(task.owner ?? "");
      setPriority((task.priority as TaskPriority) ?? "Medium");
      setStatus(task.status ?? "todo");
      setDueDate(task.due_date ?? "");
      setNotes(task.notes ?? "");
    } else {
      setName("");
      setDescription("");
      setOwner("");
      setPriority("Medium");
      setStatus(defaultStatus ?? "todo");
      setDueDate("");
      setNotes("");
    }
  }, [task, defaultStatus, open]);

  if (!open) return null;

  async function save() {
    if (!name.trim()) return;
    setSaving(true);

    const row = {
      name: name.trim(),
      description: description.trim() || null,
      owner: owner || null,
      priority,
      notes: notes.trim() || null,
      status,
      due_date: dueDate || null,
      completed: status === "done",
    };

    if (task?.id) {
      await supabase.from("tasks").update(row).eq("id", task.id);
    } else {
      await supabase.from("tasks").insert(row);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <span className="text-sm font-semibold text-gray-900">
            {task ? "Edit Task" : "New Task"}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => { e.preventDefault(); save(); }}
          className="px-6 py-5 space-y-4 overflow-y-auto flex-1"
        >
          {/* Task name */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Task Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Status pills */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Status
            </label>
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={clsx(
                    "flex-1 py-1.5 rounded-lg border text-xs font-medium transition",
                    status === s.value
                      ? s.value === "todo"
                        ? "bg-gray-100 text-gray-700 border-gray-300"
                        : s.value === "in_progress"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-green-50 text-green-700 border-green-200"
                      : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Owner + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Owner
              </label>
              <div className="flex flex-wrap gap-1.5">
                {OWNERS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOwner(owner === o ? "" : o)}
                    className={clsx(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                      owner === o
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Priority
              </label>
              <div className="flex gap-1.5">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={clsx(
                      "flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition",
                      priority === p
                        ? p === "High"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : p === "Medium"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-gray-100 text-gray-600 border-gray-300"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Due Date <span className="normal-case text-gray-300">(optional)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details…"
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes…"
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              {saving ? "Saving…" : task ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
