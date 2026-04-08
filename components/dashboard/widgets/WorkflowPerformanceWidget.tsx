"use client";

import { useDashboardWorkflows } from "../hooks/useDashboardWorkflows";
import { Zap, Users, Mail, CheckCircle2, Percent } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

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

export default function WorkflowPerformanceWidget() {
  const { workflows, loading } = useDashboardWorkflows();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Workflow Performance</h2>
        </div>
        <Link href="/workflows" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View workflows
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
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
        </div>
      )}
    </div>
  );
}
