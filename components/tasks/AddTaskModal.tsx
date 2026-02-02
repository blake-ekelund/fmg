"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export type Task = {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  priority: string | null;
  notes: string | null;
  completed: boolean | null;
  created_at: string;
};

type Props = {
  open: boolean;
  task?: Task | null;
  onClose: () => void;
  onSaved: () => void;
};

export function AddTaskModal({ open, task, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description ?? "");
      setOwner(task.owner ?? "");
      setPriority(task.priority ?? "Medium");
      setNotes(task.notes ?? "");
      setCompleted(task.completed ?? false);
    }
  }, [task]);

  if (!open) return null;

  async function save() {
    if (!name.trim()) return;

    if (task?.id) {
      await supabase
        .from("tasks")
        .update({
          name,
          description,
          owner,
          priority,
          notes,
          completed,
        })
        .eq("id", task.id);
    } else {
      await supabase.from("tasks").insert({
        name,
        description,
        owner,
        priority,
        notes,
        completed,
      });
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal wrapper (controls spacing) */}
      <div className="relative w-full px-4 md:px-0 md:flex md:items-center md:justify-center">
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="
            w-full
            max-w-xl
            max-h-[90vh]
            bg-white
            rounded-3xl
            shadow-xl
            flex
            flex-col
          "
        >
          {/* Header */}
          <div className="relative px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-medium">
              {task ? "Edit Task" : "Add Task"}
            </h2>

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="
                absolute
                top-4
                right-4
                rounded-full
                p-2
                text-gray-500
                hover:bg-gray-100
                transition
              "
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Task name"
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm resize-none"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
              >
                <option value="">Owner</option>
                <option>Blake</option>
                <option>Brooke</option>
                <option>Julie</option>
                <option>Liz</option>
              </select>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
              >
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm resize-none"
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={completed}
                onChange={() => setCompleted(!completed)}
              />
              Mark as complete
            </label>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
            <button
              onClick={onClose}
              className="text-sm text-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
