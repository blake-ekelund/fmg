"use client";

import type { Task } from "../types";
import { Pencil } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function TasksTable({
  tasks,
  onEdit,
  onToggleDone,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task, nextDone: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 border-b border-gray-200">
          <tr>
            <th className="py-3 pr-4">Done</th>
            <th className="py-3 pr-4">Task</th>
            <th className="py-3 pr-4">Owner</th>
            <th className="py-3 pr-4">Created</th>
            <th className="py-3 pr-4">Completed</th>
            <th className="py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-gray-500">
                No tasks yet.
              </td>
            </tr>
          ) : (
            tasks.map((t) => (
              <tr
                key={t.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    onChange={(e) => onToggleDone(t, e.target.checked)}
                    className="h-4 w-4 accent-orange-800"
                  />
                </td>

                <td className="py-3 pr-4">
                  <div className="font-medium text-gray-900">
                    {t.title}
                  </div>
                  {t.description && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.description}
                    </div>
                  )}
                </td>

                <td className="py-3 pr-4 text-xs text-gray-600 font-mono">
                  {t.owner_id}
                </td>

                <td className="py-3 pr-4 text-xs text-gray-500">
                  {formatDate(t.created_at)}
                </td>

                <td className="py-3 pr-4 text-xs text-gray-500">
                  {formatDate(t.done_at)}
                </td>

                <td className="py-3 text-right">
                  <button
                    onClick={() => onEdit(t)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-100"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
