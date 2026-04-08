"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import type { TaskStatus, TaskPriority } from "@/components/tasks/AddTaskModal";

const OWNERS = ["Blake", "Brooke", "Julie", "Liz"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

type Props = {
  onCreated: () => void;
};

export default function InlineCreateTaskView({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);

    await supabase.from("tasks").insert({
      name: name.trim(),
      description: description.trim() || null,
      owner: owner || null,
      priority,
      status: "todo" as TaskStatus,
      due_date: dueDate || null,
      completed: false,
    });

    setName("");
    setDescription("");
    setOwner("");
    setPriority("Medium");
    setDueDate("");
    setSaving(false);
    setSuccess(true);
    onCreated();
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Task Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      {/* Owner + Priority + Due Date row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Owner</label>
          <div className="flex flex-wrap gap-1">
            {OWNERS.map((o) => (
              <button
                key={o}
                onClick={() => setOwner(owner === o ? "" : o)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  owner === o ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:text-gray-700"
                )}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Priority</label>
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  priority === p ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:text-gray-700"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Add details..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
        />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          className={clsx(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            name.trim() && !saving
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
        >
          {saving ? "Creating..." : "Create Task"}
        </button>
        {success && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={14} /> Task created!
          </span>
        )}
      </div>
    </div>
  );
}
