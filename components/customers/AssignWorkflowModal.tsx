"use client";

import { useState } from "react";
import { X, Zap, AlertTriangle, UserMinus, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type Workflow = {
  id: string;
  name: string;
  description: string;
  icon: "at-risk" | "churned";
};

const WORKFLOWS: Workflow[] = [
  {
    id: "at-risk",
    name: "At Risk — Win Back",
    description:
      "10% off reorder + freight cap. 2-email sequence over 3 weeks. CC sales rep.",
    icon: "at-risk",
  },
  {
    id: "churned",
    name: "Churned — Re-Engagement",
    description:
      "20% off reorder + freight cap. 2-email sequence over 3 weeks. CC Maria.",
    icon: "churned",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  customerType: "wholesale" | "d2c";
  /** Map of id → display name for selected customers */
  customerNames: Record<string, string>;
  onComplete: () => void;
};

export default function AssignWorkflowModal({
  open,
  onClose,
  selectedIds,
  customerType,
  customerNames,
  onComplete,
}: Props) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    skipped: number;
  } | null>(null);

  if (!open) return null;

  async function handleAssign() {
    if (!selectedWorkflow) return;
    setSaving(true);
    setResult(null);

    const ids = Array.from(selectedIds);
    const rows = ids.map((id) => ({
      workflow_id: selectedWorkflow,
      customer_type: customerType,
      customer_id: id,
      customer_name: customerNames[id] || id,
      status: "enrolled",
      current_step: "trigger",
    }));

    // Upsert — skip duplicates
    const { data, error } = await supabase
      .from("workflow_enrollments")
      .upsert(rows, { onConflict: "workflow_id,customer_id", ignoreDuplicates: true })
      .select();

    const inserted = data?.length ?? 0;
    const skipped = ids.length - inserted;

    setSaving(false);
    setResult({ success: inserted, skipped });
  }

  function handleDone() {
    setResult(null);
    setSelectedWorkflow(null);
    onComplete();
    onClose();
  }

  const count = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Assign to Workflow
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {count} {customerType} customer{count !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              {/* Workflow options */}
              <div className="space-y-2.5">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Select a workflow
                </div>
                {WORKFLOWS.map((wf) => {
                  const isSelected = selectedWorkflow === wf.id;
                  return (
                    <button
                      key={wf.id}
                      onClick={() => setSelectedWorkflow(wf.id)}
                      className={clsx(
                        "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-gray-900 bg-gray-50 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                      )}
                    >
                      <div
                        className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          wf.icon === "at-risk"
                            ? "bg-amber-100"
                            : "bg-rose-100"
                        )}
                      >
                        {wf.icon === "at-risk" ? (
                          <AlertTriangle
                            size={20}
                            className="text-amber-600"
                          />
                        ) : (
                          <UserMinus size={20} className="text-rose-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-800">
                          {wf.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {wf.description}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Customer preview */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-2">
                  Enrolling {count} customer{count !== 1 ? "s" : ""}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {Array.from(selectedIds)
                    .slice(0, 10)
                    .map((id) => (
                      <div
                        key={id}
                        className="text-xs text-gray-600 flex items-center gap-2"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        <span className="truncate">
                          {customerNames[id] || id}
                        </span>
                      </div>
                    ))}
                  {count > 10 && (
                    <div className="text-xs text-gray-400 pl-3.5">
                      + {count - 10} more…
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Result */
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-emerald-600" />
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {result.success} customer{result.success !== 1 ? "s" : ""}{" "}
                enrolled
              </div>
              {result.skipped > 0 && (
                <div className="text-sm text-gray-500 mt-1">
                  {result.skipped} already enrolled (skipped)
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                Assigned to{" "}
                <span className="font-medium text-gray-600">
                  {WORKFLOWS.find((w) => w.id === selectedWorkflow)?.name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedWorkflow || saving}
                className={clsx(
                  "inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition shadow-sm",
                  selectedWorkflow && !saving
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enrolling…
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    Enroll {count} Customer{count !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleDone}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition shadow-sm"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
