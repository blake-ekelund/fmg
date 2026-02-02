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
    <>
      {/* ========================================================= */}
      {/* MOBILE GRID CARD                                          */}
      {/* ========================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(id)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(id)}
        className="
          md:hidden
          rounded-2xl
          border border-gray-200
          bg-white
          p-4
          space-y-3
          cursor-pointer
          transition
          hover:bg-gray-50
          focus:outline-none
          focus:ring-2
          focus:ring-gray-200
        "
      >
        {/* Top row: checkbox + title (truncated) + status */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={completed ?? false}
            onChange={(e) => handleToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 rounded border-gray-300 accent-orange-800"
          />

          {/* Title + description (flexes + truncates) */}
          <div className="flex-1 min-w-0">
            <div
              className={`font-medium leading-snug truncate ${
                completed
                  ? "line-through text-gray-400"
                  : "text-gray-900"
              }`}
            >
              {name}
            </div>

            {description && (
              <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                {description}
              </div>
            )}
          </div>

          {/* Status (never collapses) */}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
              completed
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {completed ? "Completed" : "Open"}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className={PRIORITY_STYLES[normalizedPriority]}>
            {normalizedPriority}
          </span>
          <span>{owner || "—"}</span>
          <span>
            {new Date(created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* Notes */}
        {notes && (
          <div className="text-xs text-gray-500 line-clamp-2">
            {notes}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end pt-1">
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

      {/* ========================================================= */}
      {/* DESKTOP TABLE ROW (UNCHANGED)                             */}
      {/* ========================================================= */}
      <div
        className="
          hidden md:grid
          items-start
          px-4 py-3.5
          text-sm
          cursor-pointer
          transition
          hover:bg-gray-50
        "
        style={{
          gridTemplateColumns:
            "40px 2fr 1fr 110px 140px 2fr 120px 80px",
        }}
        onClick={() => onOpen(id)}
      >
        {/* Checkbox */}
        <div className="pt-1">
          <input
            type="checkbox"
            checked={completed ?? false}
            onChange={(e) => handleToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 accent-orange-800"
          />
        </div>

        {/* Task */}
        <div className="min-w-0 space-y-0.5">
          <div
            className={`font-medium leading-snug ${
              completed
                ? "line-through text-gray-400"
                : "text-gray-900"
            }`}
          >
            {name}
          </div>

          {description && (
            <div className="text-xs text-gray-500 line-clamp-2">
              {description}
            </div>
          )}
        </div>

        {/* Owner */}
        <div className="truncate text-gray-700 pt-0.5">
          {owner || "—"}
        </div>

        {/* Priority */}
        <div className="pt-0.5">
          <span className={PRIORITY_STYLES[normalizedPriority]}>
            {normalizedPriority}
          </span>
        </div>

        {/* Created */}
        <div className="text-gray-600 pt-0.5">
          {new Date(created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>

        {/* Notes */}
        <div className="text-xs text-gray-500 line-clamp-2 pt-0.5">
          {notes || "—"}
        </div>

        {/* Status */}
        <div className="pt-0.5">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              completed
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {completed ? "Completed" : "Open"}
          </span>
        </div>

        {/* Actions */}
        <div className="text-right pt-0.5">
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
    </>
  );
}
