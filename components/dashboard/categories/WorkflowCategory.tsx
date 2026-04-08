"use client";

import { useDashboardWorkflows } from "../hooks/useDashboardWorkflows";
import { Zap, Users, Mail, CheckCircle2, Percent } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import DashboardWidgetShell from "../DashboardWidgetShell";

const COLOR_MAP: Record<string, { bg: string; icon: string }> = {
  amber: { bg: "bg-amber-100", icon: "text-amber-600" },
  rose: { bg: "bg-rose-100", icon: "text-rose-600" },
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-gray-400 mb-0.5">{icon}</div>
      <div className="text-sm font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
    </div>
  );
}

function WorkflowContent() {
  const { workflows, loading } = useDashboardWorkflows();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workflows.map((wf) => {
        const colors = COLOR_MAP[wf.color] ?? COLOR_MAP.amber;
        return (
          <div key={wf.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={clsx("p-1.5 rounded-md", colors.bg)}>
                <Zap size={14} className={colors.icon} />
              </div>
              <span className="text-sm font-semibold text-gray-800">{wf.name}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Stat icon={<Users size={13} />} label="Enrolled" value={wf.enrolled} />
              <Stat icon={<Mail size={13} />} label="Sent" value={wf.emailsSent} />
              <Stat icon={<CheckCircle2 size={13} />} label="Converted" value={wf.completed} />
              <Stat icon={<Percent size={13} />} label="Rate" value={wf.conversionRate} />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-gray-100">
        <Link href="/workflows" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View workflows
        </Link>
      </div>
    </div>
  );
}

export default function WorkflowCategory() {
  return (
    <DashboardWidgetShell
      id="widget-workflows"
      icon={Zap}
      title="Workflow Performance"
      storageKey="workflows"
      defaultCollapsed
      tabs={[{ label: "Overview", content: <WorkflowContent /> }]}
    />
  );
}
