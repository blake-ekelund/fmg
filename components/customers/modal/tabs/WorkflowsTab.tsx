"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Mail,
  MailOpen,
  MousePointerClick,
  Clock,
  AlertTriangle,
  UserMinus,
  CheckCircle2,
  Zap,
} from "lucide-react";
import clsx from "clsx";

type Enrollment = {
  id: string;
  workflow_id: string;
  status: string;
  current_step: string | null;
  enrolled_at: string;
  completed_at: string | null;
  exited_at: string | null;
  exit_reason: string | null;
  email1_sent_at: string | null;
  email1_opened_at: string | null;
  email1_clicked_at: string | null;
  email2_sent_at: string | null;
  email2_opened_at: string | null;
  email2_clicked_at: string | null;
  notes: string | null;
};

const WORKFLOW_META: Record<string, { name: string; color: string; icon: React.ReactNode }> = {
  "at-risk": {
    name: "At Risk — Win Back",
    color: "bg-amber-100 border-amber-200",
    icon: <AlertTriangle size={18} className="text-amber-600" />,
  },
  churned: {
    name: "Churned — Re-Engagement",
    color: "bg-rose-100 border-rose-200",
    icon: <UserMinus size={18} className="text-rose-600" />,
  },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function EmailStep({
  label,
  sent,
  opened,
  clicked,
}: {
  label: string;
  sent: string | null;
  opened: string | null;
  clicked: string | null;
}) {
  const isSent = !!sent;
  return (
    <div className={clsx(
      "rounded-xl border px-4 py-3 space-y-2",
      isSent ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"
    )}>
      <div className="text-xs font-semibold text-gray-700">{label}</div>
      <div className="space-y-1">
        <div className={clsx("flex items-center gap-2 text-xs", isSent ? "text-blue-600" : "text-gray-400")}>
          <Mail size={12} />
          <span>{isSent ? `Sent ${fmtDate(sent)}` : "Not sent yet"}</span>
        </div>
        {isSent && (
          <>
            <div className={clsx("flex items-center gap-2 text-xs", opened ? "text-emerald-600" : "text-gray-400")}>
              <MailOpen size={12} />
              <span>{opened ? `Opened ${fmtDate(opened)}` : "Not opened"}</span>
            </div>
            {clicked && (
              <div className="flex items-center gap-2 text-xs text-violet-600">
                <MousePointerClick size={12} />
                <span>Clicked {fmtDate(clicked)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type Props = {
  customerId: string;
};

export default function WorkflowsTab({ customerId }: Props) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("workflow_enrollments")
        .select("*")
        .eq("customer_id", customerId)
        .order("enrolled_at", { ascending: false });

      setEnrollments((data as Enrollment[]) ?? []);
      setLoading(false);
    }
    load();
  }, [customerId]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <Zap size={22} className="text-gray-400" />
        </div>
        <div className="text-sm font-medium text-gray-600 mb-1">
          Not enrolled in any workflows
        </div>
        <div className="text-xs text-gray-400 text-center max-w-xs">
          Select this customer from the list and use &quot;Assign Workflow&quot; to
          enroll them in a re-engagement sequence.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {enrollments.map((e) => {
        const meta = WORKFLOW_META[e.workflow_id] || {
          name: e.workflow_id,
          color: "bg-gray-100 border-gray-200",
          icon: <Zap size={18} className="text-gray-400" />,
        };

        const statusCfg: Record<string, { bg: string; text: string; label: string }> = {
          enrolled: { bg: "bg-blue-100", text: "text-blue-700", label: "Enrolled" },
          in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "In Progress" },
          completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completed" },
          exited: { bg: "bg-gray-100", text: "text-gray-500", label: "Exited" },
        };
        const sc = statusCfg[e.status] || statusCfg.enrolled;

        return (
          <div key={e.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center border", meta.color)}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800">{meta.name}</div>
                <div className="text-[11px] text-gray-500">
                  Enrolled {fmtDate(e.enrolled_at)}
                </div>
              </div>
              <span className={clsx("px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider", sc.bg, sc.text)}>
                {sc.label}
              </span>
            </div>

            {/* Email progress */}
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EmailStep
                label='Email #1 — "We Miss You"'
                sent={e.email1_sent_at}
                opened={e.email1_opened_at}
                clicked={e.email1_clicked_at}
              />
              <EmailStep
                label='Email #2 — "One Week Left"'
                sent={e.email2_sent_at}
                opened={e.email2_opened_at}
                clicked={e.email2_clicked_at}
              />
            </div>

            {/* Outcome */}
            {(e.completed_at || e.exited_at) && (
              <div className="px-5 pb-4">
                <div className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                  e.completed_at ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                )}>
                  {e.completed_at ? (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Completed {fmtDate(e.completed_at)}</span>
                    </>
                  ) : (
                    <>
                      <Clock size={14} />
                      <span>Exited {fmtDate(e.exited_at)} — {e.exit_reason || "No reason given"}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
