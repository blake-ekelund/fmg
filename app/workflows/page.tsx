"use client";

import { useState } from "react";
import {
  Workflow,
  Plus,
  Mail,
  Clock,
  AlertTriangle,
  UserMinus,
  ChevronDown,
  ChevronUp,
  Gift,
  ShoppingBag,
  BookOpen,
  Globe,
  Users,
  Zap,
  CheckCircle2,
  Circle,
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
  color: string;
  icon: React.ReactNode;
};

type WorkflowData = {
  id: string;
  name: string;
  description: string;
  status: "active" | "draft" | "paused";
  triggerLabel: string;
  triggerColor: string;
  triggerIcon: React.ReactNode;
  steps: FlowStep[];
  stats?: {
    enrolled: number;
    emailsSent: number;
    converted: number;
    conversionRate: string;
  };
};

/* ─── Flow Step Card ─── */
function FlowStepCard({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={clsx(
          "w-full max-w-sm rounded-xl border-2 bg-white shadow-sm overflow-hidden transition-all hover:shadow-md",
          step.color
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={clsx(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              step.type === "trigger" && "bg-violet-100",
              step.type === "email" && "bg-blue-100",
              step.type === "delay" && "bg-amber-100",
              step.type === "condition" && "bg-emerald-100"
            )}
          >
            {step.icon}
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

        {/* Details */}
        {step.details && step.details.length > 0 && (
          <div className="px-4 pb-3 space-y-1.5">
            {step.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
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

      {/* Connector line */}
      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="w-0.5 h-6 bg-gray-200" />
          <ChevronDown size={14} className="text-gray-300 -mt-1" />
        </div>
      )}
    </div>
  );
}

/* ─── Workflow Card (collapsed view) ─── */
function WorkflowCard({
  workflow,
  expanded,
  onToggle,
}: {
  workflow: WorkflowData;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header bar */}
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
            {workflow.triggerIcon}
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
          {/* Mini stats */}
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

      {/* Expanded flow */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/50 to-white px-6 py-8">
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
  );
}

/* ─── Workflow Data ─── */
const WORKFLOWS: WorkflowData[] = [
  {
    id: "at-risk",
    name: "At Risk — Win Back",
    description:
      "Triggered when a wholesale customer hasn't ordered in 6 months. Two-touch email sequence with a special incentive.",
    status: "draft",
    triggerLabel: "At Risk (6 months)",
    triggerColor: "bg-amber-100",
    triggerIcon: <AlertTriangle size={22} className="text-amber-600" />,
    stats: {
      enrolled: 0,
      emailsSent: 0,
      converted: 0,
      conversionRate: "—",
    },
    steps: [
      {
        id: "ar-trigger",
        type: "trigger",
        title: "Customer becomes At Risk",
        subtitle: "No order in 6 months",
        color: "border-violet-200",
        icon: <Zap size={16} className="text-violet-600" />,
        details: [
          "Triggers when a wholesale customer crosses the 180-day mark since last order",
        ],
      },
      {
        id: "ar-email-1",
        type: "email",
        title: 'Email #1 — "We Miss You"',
        subtitle: "Sent immediately on trigger",
        color: "border-blue-200",
        icon: <Mail size={16} className="text-blue-600" />,
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
        color: "border-amber-200",
        icon: <Clock size={16} className="text-amber-600" />,
        details: [
          "If customer places an order during this window, exit workflow",
        ],
      },
      {
        id: "ar-email-2",
        type: "email",
        title: 'Email #2 — "One Week Left"',
        subtitle: "Reminder of expiring offer",
        color: "border-blue-200",
        icon: <Mail size={16} className="text-blue-600" />,
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
    triggerIcon: <UserMinus size={22} className="text-rose-600" />,
    stats: {
      enrolled: 0,
      emailsSent: 0,
      converted: 0,
      conversionRate: "—",
    },
    steps: [
      {
        id: "ch-trigger",
        type: "trigger",
        title: "Customer becomes Churned",
        subtitle: "No order in 12 months",
        color: "border-violet-200",
        icon: <Zap size={16} className="text-violet-600" />,
        details: [
          "Triggers when a wholesale customer crosses the 365-day mark since last order",
        ],
      },
      {
        id: "ch-email-1",
        type: "email",
        title: 'Email #1 — "We Miss You"',
        subtitle: "Sent immediately on trigger",
        color: "border-blue-200",
        icon: <Mail size={16} className="text-blue-600" />,
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
        color: "border-amber-200",
        icon: <Clock size={16} className="text-amber-600" />,
        details: [
          "If customer places an order during this window, exit workflow",
        ],
      },
      {
        id: "ch-email-2",
        type: "email",
        title: 'Email #2 — "One Week Left"',
        subtitle: "Reminder of expiring offer",
        color: "border-blue-200",
        icon: <Mail size={16} className="text-blue-600" />,
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Active Workflows
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">0</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Draft
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">2</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Total Enrolled
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">0</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Emails Sent
          </div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">0</div>
        </div>
      </div>

      {/* Workflows */}
      <div className="space-y-4">
        {WORKFLOWS.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            expanded={expandedIds.has(wf.id)}
            onToggle={() => toggle(wf.id)}
          />
        ))}
      </div>
    </div>
  );
}
