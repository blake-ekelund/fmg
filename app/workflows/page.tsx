"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Mail,
  Clock,
  AlertTriangle,
  UserMinus,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import clsx from "clsx";

/* ─── Types ─── */
type StepType = "trigger" | "delay" | "email" | "condition";

type FlowStep = {
  id: string;
  type: StepType;
  title: string;
  subtitle?: string;
  details?: string[];
  delayDays?: number;
  discount?: string;
  freightCap?: string;
  offerDays?: number;
  ccRecipient?: string;
};

type WorkflowData = {
  id: string;
  name: string;
  description: string;
  status: "active" | "draft" | "paused";
  triggerLabel: string;
  triggerColor: string;
  triggerMonths: number;
  steps: FlowStep[];
  stats?: {
    enrolled: number;
    emailsSent: number;
    converted: number;
    conversionRate: string;
  };
};

/* ─── Icons by type ─── */
function StepIcon({ type, size = 16 }: { type: StepType; size?: number }) {
  switch (type) {
    case "trigger":
      return <Zap size={size} className="text-violet-600" />;
    case "email":
      return <Mail size={size} className="text-blue-600" />;
    case "delay":
      return <Clock size={size} className="text-amber-600" />;
    default:
      return <Zap size={size} className="text-gray-400" />;
  }
}

function stepBg(type: StepType) {
  switch (type) {
    case "trigger":
      return "bg-violet-50";
    case "email":
      return "bg-blue-50";
    case "delay":
      return "bg-amber-50";
    default:
      return "bg-gray-50";
  }
}

function stepBorder(type: StepType) {
  switch (type) {
    case "trigger":
      return "border-violet-200";
    case "email":
      return "border-blue-200";
    case "delay":
      return "border-amber-200";
    default:
      return "border-gray-200";
  }
}

function stepLabel(type: StepType) {
  switch (type) {
    case "trigger":
      return "Trigger";
    case "email":
      return "Email";
    case "delay":
      return "Delay";
    default:
      return "Step";
  }
}

/* ─── Flow Visual Step ─── */
function FlowStepCard({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={clsx(
          "w-full max-w-sm rounded-xl border-2 bg-white shadow-sm overflow-hidden transition-all hover:shadow-md",
          stepBorder(step.type)
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={clsx(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              stepBg(step.type)
            )}
          >
            <StepIcon type={step.type} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {step.title}
            </div>
            {step.subtitle && (
              <div className="text-[11px] text-gray-500">{step.subtitle}</div>
            )}
          </div>
        </div>
        {step.details && step.details.length > 0 && (
          <div className="px-4 pb-3 space-y-1.5">
            {step.details.map((d, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-gray-600"
              >
                <CheckCircle2
                  size={13}
                  className="text-gray-300 mt-0.5 shrink-0"
                />
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="w-0.5 h-6 bg-gray-200" />
          <ChevronDown size={14} className="text-gray-300 -mt-1" />
        </div>
      )}
    </div>
  );
}

/* ─── Editable Step Row ─── */
function EditableStepRow({
  step,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
}: {
  step: FlowStep;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (s: FlowStep) => void;
  onDelete: () => void;
}) {
  const isTrigger = step.type === "trigger";

  return (
    <tr className="border-b border-gray-100 last:border-b-0 group">
      {/* Order / Move */}
      <td className="px-3 py-3 w-16">
        <div className="flex items-center gap-1">
          <GripVertical size={14} className="text-gray-300" />
          <div className="flex flex-col gap-0.5">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ArrowUp size={12} className="text-gray-500" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ArrowDown size={12} className="text-gray-500" />
            </button>
          </div>
        </div>
      </td>

      {/* Step # */}
      <td className="px-3 py-3 w-12 text-center">
        <span className="text-xs font-bold text-gray-400">{index + 1}</span>
      </td>

      {/* Type */}
      <td className="px-3 py-3 w-28">
        <div
          className={clsx(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium",
            stepBg(step.type),
            step.type === "trigger" && "text-violet-700",
            step.type === "email" && "text-blue-700",
            step.type === "delay" && "text-amber-700"
          )}
        >
          <StepIcon type={step.type} size={12} />
          {stepLabel(step.type)}
        </div>
      </td>

      {/* Title */}
      <td className="px-3 py-3">
        <input
          type="text"
          value={step.title}
          onChange={(e) => onUpdate({ ...step, title: e.target.value })}
          disabled={isTrigger}
          className={clsx(
            "w-full text-sm font-medium bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none transition-colors px-0 py-0.5",
            isTrigger ? "text-gray-500 cursor-not-allowed" : "text-gray-800"
          )}
        />
      </td>

      {/* Timing */}
      <td className="px-3 py-3 w-32">
        {step.type === "delay" ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={90}
              value={step.delayDays ?? 21}
              onChange={(e) =>
                onUpdate({ ...step, delayDays: Number(e.target.value) })
              }
              className="w-14 text-sm text-center bg-amber-50 border border-amber-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-300"
            />
            <span className="text-xs text-gray-500">days</span>
          </div>
        ) : step.type === "email" ? (
          <span className="text-xs text-gray-400">Immediate</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Discount (email only) */}
      <td className="px-3 py-3 w-28">
        {step.type === "email" && step.discount !== undefined ? (
          <input
            type="text"
            value={step.discount}
            onChange={(e) => onUpdate({ ...step, discount: e.target.value })}
            className="w-full text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
            placeholder="e.g. 10%"
          />
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* CC */}
      <td className="px-3 py-3 w-32">
        {step.type === "email" && step.ccRecipient !== undefined ? (
          <input
            type="text"
            value={step.ccRecipient}
            onChange={(e) =>
              onUpdate({ ...step, ccRecipient: e.target.value })
            }
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="e.g. Sales Rep"
          />
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Delete */}
      <td className="px-3 py-3 w-12">
        {!isTrigger && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}

/* ─── Workflow Card ─── */
function WorkflowCard({
  workflow,
  expanded,
  onToggle,
  onUpdateWorkflow,
}: {
  workflow: WorkflowData;
  expanded: boolean;
  onToggle: () => void;
  onUpdateWorkflow: (wf: WorkflowData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editSteps, setEditSteps] = useState<FlowStep[]>(workflow.steps);

  function startEdit() {
    setEditSteps([...workflow.steps]);
    setEditing(true);
  }

  function cancelEdit() {
    setEditSteps(workflow.steps);
    setEditing(false);
  }

  function saveEdit() {
    onUpdateWorkflow({ ...workflow, steps: editSteps });
    setEditing(false);
  }

  function moveStep(from: number, to: number) {
    const arr = [...editSteps];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setEditSteps(arr);
  }

  function updateStep(idx: number, step: FlowStep) {
    const arr = [...editSteps];
    arr[idx] = step;
    setEditSteps(arr);
  }

  function deleteStep(idx: number) {
    setEditSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function addStep(type: StepType) {
    const id = `${workflow.id}-${type}-${Date.now()}`;
    const newStep: FlowStep =
      type === "delay"
        ? {
            id,
            type: "delay",
            title: "Wait",
            subtitle: "Delay before next step",
            delayDays: 7,
          }
        : {
            id,
            type: "email",
            title: "New Email",
            subtitle: "Email step",
            details: [],
            discount: "",
            freightCap: "10%",
            offerDays: 30,
            ccRecipient: "",
          };
    setEditSteps((prev) => [...prev, newStep]);
  }

  const triggerIcon =
    workflow.id === "at-risk" ? (
      <AlertTriangle size={22} className="text-amber-600" />
    ) : (
      <UserMinus size={22} className="text-rose-600" />
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              workflow.triggerColor
            )}
          >
            {triggerIcon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-semibold text-gray-800">
                {workflow.name}
              </h3>
              <span
                className={clsx(
                  "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                  workflow.status === "active" &&
                    "bg-emerald-100 text-emerald-700",
                  workflow.status === "draft" && "bg-gray-100 text-gray-500",
                  workflow.status === "paused" && "bg-amber-100 text-amber-700"
                )}
              >
                {workflow.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {workflow.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {workflow.stats && (
            <div className="hidden md:flex items-center gap-5 text-xs text-gray-500">
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm tabular-nums">
                  {workflow.stats.enrolled.toLocaleString()}
                </div>
                <div>Enrolled</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm tabular-nums">
                  {workflow.stats.emailsSent.toLocaleString()}
                </div>
                <div>Emails Sent</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-emerald-600 text-sm tabular-nums">
                  {workflow.stats.conversionRate}
                </div>
                <div>Converted</div>
              </div>
            </div>
          )}
          {expanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Toggle: Visual ↔ Edit */}
          <div className="flex items-center justify-end gap-2 px-6 py-3 bg-gray-50/50 border-b border-gray-100">
            {!editing ? (
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-white hover:shadow-sm border border-gray-200 transition-all"
              >
                <Pencil size={12} />
                Edit Steps
              </button>
            ) : (
              <>
                <button
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition"
                >
                  <X size={12} />
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 transition shadow-sm"
                >
                  <Save size={12} />
                  Save Changes
                </button>
              </>
            )}
          </div>

          {editing ? (
            /* ─── Edit Table ─── */
            <div className="px-6 py-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-2.5 text-left font-medium w-16" />
                      <th className="px-3 py-2.5 text-center font-medium w-12">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium w-28">
                        Type
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Title
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium w-32">
                        Timing
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium w-28">
                        Discount
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium w-32">
                        CC
                      </th>
                      <th className="px-3 py-2.5 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {editSteps.map((step, i) => (
                      <EditableStepRow
                        key={step.id}
                        step={step}
                        index={i}
                        total={editSteps.length}
                        onMoveUp={() => i > 0 && moveStep(i, i - 1)}
                        onMoveDown={() =>
                          i < editSteps.length - 1 && moveStep(i, i + 1)
                        }
                        onUpdate={(s) => updateStep(i, s)}
                        onDelete={() => deleteStep(i)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add step buttons */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => addStep("email")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                >
                  <Mail size={12} />
                  Add Email
                </button>
                <button
                  onClick={() => addStep("delay")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition"
                >
                  <Clock size={12} />
                  Add Delay
                </button>
              </div>
            </div>
          ) : (
            /* ─── Visual Flow ─── */
            <div className="bg-gradient-to-b from-gray-50/50 to-white px-6 py-8">
              <div className="flex flex-col items-center space-y-0">
                {workflow.steps.map((step, i) => (
                  <FlowStepCard
                    key={step.id}
                    step={step}
                    isLast={i === workflow.steps.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Default Workflow Data ─── */
const DEFAULT_WORKFLOWS: WorkflowData[] = [
  {
    id: "at-risk",
    name: "At Risk — Win Back",
    description:
      "Triggered when a wholesale customer hasn't ordered in 6 months. Two-touch email sequence with a special incentive.",
    status: "draft",
    triggerLabel: "At Risk (6 months)",
    triggerColor: "bg-amber-100",
    triggerMonths: 6,
    stats: { enrolled: 0, emailsSent: 0, converted: 0, conversionRate: "—" },
    steps: [
      {
        id: "ar-trigger",
        type: "trigger",
        title: "Customer becomes At Risk",
        subtitle: "No order in 6 months",
        details: [
          "Triggers when a wholesale customer crosses the 180-day mark since last order",
        ],
      },
      {
        id: "ar-email-1",
        type: "email",
        title: 'Email #1 — "We Miss You"',
        subtitle: "Sent immediately on trigger",
        discount: "10%",
        freightCap: "10%",
        offerDays: 30,
        ccRecipient: "Sales Rep",
        details: [
          "Special product incentive — 10% off reorder",
          "10% freight cap",
          "Offer good for 30 days",
          "Include last order summary",
          "Include digital catalog",
          "Link to wholesale website",
          "CC sales rep on email",
        ],
      },
      {
        id: "ar-delay",
        type: "delay",
        title: "Wait 3 Weeks",
        subtitle: "21-day delay before follow-up",
        delayDays: 21,
        details: [
          "If customer places an order during this window, exit workflow",
        ],
      },
      {
        id: "ar-email-2",
        type: "email",
        title: 'Email #2 — "One Week Left"',
        subtitle: "Reminder of expiring offer",
        discount: "10%",
        freightCap: "10%",
        offerDays: 30,
        ccRecipient: "Sales Rep",
        details: [
          "Reminder of the 10% off special offer",
          "Include last order summary",
          "Include digital catalog",
          "Link to wholesale website",
          "CC sales rep on email",
        ],
      },
    ],
  },
  {
    id: "churned",
    name: "Churned — Re-Engagement",
    description:
      "Triggered when a wholesale customer hasn't ordered in 12 months. Aggressive incentive to win them back.",
    status: "draft",
    triggerLabel: "Churned (12 months)",
    triggerColor: "bg-rose-100",
    triggerMonths: 12,
    stats: { enrolled: 0, emailsSent: 0, converted: 0, conversionRate: "—" },
    steps: [
      {
        id: "ch-trigger",
        type: "trigger",
        title: "Customer becomes Churned",
        subtitle: "No order in 12 months",
        details: [
          "Triggers when a wholesale customer crosses the 365-day mark since last order",
        ],
      },
      {
        id: "ch-email-1",
        type: "email",
        title: 'Email #1 — "We Miss You"',
        subtitle: "Sent immediately on trigger",
        discount: "20%",
        freightCap: "10%",
        offerDays: 30,
        ccRecipient: "Maria",
        details: [
          "Special product incentive — 20% off reorder",
          "10% freight cap",
          "Offer good for 30 days",
          "Include last order summary",
          "Include digital catalog",
          "Link to wholesale website",
          "CC Maria on email",
        ],
      },
      {
        id: "ch-delay",
        type: "delay",
        title: "Wait 3 Weeks",
        subtitle: "21-day delay before follow-up",
        delayDays: 21,
        details: [
          "If customer places an order during this window, exit workflow",
        ],
      },
      {
        id: "ch-email-2",
        type: "email",
        title: 'Email #2 — "One Week Left"',
        subtitle: "Reminder of expiring offer",
        discount: "20%",
        freightCap: "10%",
        offerDays: 30,
        ccRecipient: "Maria",
        details: [
          "Reminder of the 20% off special offer",
          "Include last order summary",
          "Include digital catalog",
          "Link to wholesale website",
          "CC Maria on email",
        ],
      },
    ],
  },
];

/* ─── Page ─── */
export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowData[]>(DEFAULT_WORKFLOWS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["at-risk"])
  );

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const updateWorkflow = useCallback((updated: WorkflowData) => {
    setWorkflows((prev) =>
      prev.map((wf) => (wf.id === updated.id ? updated : wf))
    );
  }, []);

  const activeCount = workflows.filter((w) => w.status === "active").length;
  const draftCount = workflows.filter((w) => w.status === "draft").length;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Automated email sequences triggered by customer behavior.
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

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Active Workflows
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {activeCount}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Draft
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {draftCount}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Total Enrolled
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {workflows.reduce((s, w) => s + (w.stats?.enrolled ?? 0), 0)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Emails Sent
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {workflows.reduce((s, w) => s + (w.stats?.emailsSent ?? 0), 0)}
          </div>
        </div>
      </div>

      {/* Workflows */}
      <div className="space-y-4">
        {workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            expanded={expandedIds.has(wf.id)}
            onToggle={() => toggle(wf.id)}
            onUpdateWorkflow={updateWorkflow}
          />
        ))}
      </div>
    </div>
  );
}
