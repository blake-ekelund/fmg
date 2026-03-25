"use client";

import { Workflow, Plus } from "lucide-react";

export default function WorkflowsPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automate customer engagement with reusable workflows.
          </p>
        </div>

        <button
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
          onClick={() => alert("Create workflow — coming soon")}
        >
          <Plus size={16} />
          New Workflow
        </button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-gray-200 bg-white/60">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Workflow size={24} className="text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">No workflows yet</h3>
        <p className="text-xs text-gray-400 max-w-sm text-center">
          Create your first workflow to automate customer engagement — send emails, assign tasks, and
          trigger actions based on customer behavior.
        </p>
      </div>
    </div>
  );
}
