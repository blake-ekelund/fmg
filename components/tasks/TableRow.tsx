"use client";

import { supabase } from "@/lib/supabaseClient";

type TableRowProps = {
  id: string;
  name: string;
  description?: string | null;
  owner?: string | null;
  priority?: string | null;
  notes?: string | null;
  completed?: boolean | null;
  created_at: string;

  onOpen: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onRequestDelete: (id: string) => void;
};

const PRIORITY_STYLES: Record<string, string> = {
  High: "text-red-600",
  Medium: "text-orange-600",
  Low: "text-gray-500",
};

export function TableRow({
  id,
  name,
  description,
  owner,
  priority,
  notes,
  completed = false,
  created_at,
  onOpen,
  onToggleComplete,
  onRequestDelete,
}: TableRowProps) {
  const normalizedPriority = priority ?? "Medium";

  async function handleToggle(value: boolean) {
    onToggleComplete(id, value);
    await supabase.from("tasks").update({ completed: value }).eq("id", id);
  }

  return (
    <div
      className="
        grid items-center
        px-4 py-3 text-sm
        hover:bg-gray-50 transition
        cursor-pointer
      "
      style={{
        gridTemplateColumns:
          "40px 2fr 1fr 110px 140px 2fr 120px 80px",
      }}
      onClick={() => onOpen(id)}
    >
      {/* Checkbox */}
      <div>
        <input
          type="checkbox"
          checked={completed ?? false}
          onChange={(e) => handleToggle(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      </div>

      {/* Task */}
      <div className="min-w-0">
        <div
          className={`font-medium truncate ${
            completed ? "line-through text-gray-400" : "text-gray-900"
          }`}
        >
          {name}
        </div>
        {description && (
          <div className="text-xs text-gray-500 truncate">
            {description}
          </div>
        )}
      </div>

      {/* Owner */}
      <div className="truncate text-gray-700">
        {owner || "—"}
      </div>

      {/* Priority */}
      <div>
        <span className={PRIORITY_STYLES[normalizedPriority]}>
          {normalizedPriority}
        </span>
      </div>

      {/* Created */}
      <div className="text-gray-600">
        {new Date(created_at).toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>

      {/* Notes */}
      <div className="truncate text-xs text-gray-500">
        {notes || "—"}
      </div>

      {/* Status */}
      <div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs ${
            completed
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {completed ? "Completed" : "Open"}
        </span>
      </div>

      {/* Actions */}
      <div className="text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(id);
          }}
          className="text-xs text-gray-400 hover:text-red-600 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
