"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Mail,
  MailOpen,
  MousePointerClick,
  Clock,
  CheckCircle2,
  XCircle,
  LogOut,
  Search,
  Users,
} from "lucide-react";
import clsx from "clsx";

type Enrollment = {
  id: string;
  workflow_id: string;
  customer_type: string;
  customer_id: string;
  customer_name: string | null;
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

type Props = {
  workflowId: string;
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    enrolled: { bg: "bg-blue-100", text: "text-blue-700", label: "Enrolled" },
    in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "In Progress" },
    completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completed" },
    exited: { bg: "bg-gray-100", text: "text-gray-500", label: "Exited" },
  };
  const c = cfg[status] || cfg.enrolled;
  return (
    <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider", c.bg, c.text)}>
      {c.label}
    </span>
  );
}

function EmailTracker({ label, sent, opened, clicked }: {
  label: string;
  sent: string | null;
  opened: string | null;
  clicked: string | null;
}) {
  if (!sent) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-300">
        <Clock size={12} />
        <span>Not sent</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-blue-600">
        <Mail size={11} />
        <span>Sent {fmtDate(sent)}</span>
      </div>
      {opened ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <MailOpen size={11} />
          <span>Opened {fmtDate(opened)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MailOpen size={11} />
          <span>Not opened</span>
        </div>
      )}
      {clicked ? (
        <div className="flex items-center gap-1.5 text-xs text-violet-600">
          <MousePointerClick size={11} />
          <span>Clicked {fmtDate(clicked)}</span>
        </div>
      ) : null}
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export default function WorkflowEnrollments({ workflowId }: Props) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    load();
  }, [workflowId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("workflow_enrollments")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("enrolled_at", { ascending: false });

    setEnrollments((data as Enrollment[]) ?? []);
    setLoading(false);
  }

  async function handleRemove(id: string) {
    await supabase.from("workflow_enrollments").delete().eq("id", id);
    load();
  }

  async function handleUpdateStatus(id: string, status: string) {
    const updates: Record<string, string | null> = { status };
    if (status === "exited") {
      updates.exited_at = new Date().toISOString();
      updates.exit_reason = "Manual removal";
    }
    if (status === "completed") {
      updates.completed_at = new Date().toISOString();
    }
    await supabase.from("workflow_enrollments").update(updates).eq("id", id);
    load();
  }

  const filtered = enrollments.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(e.customer_name?.toLowerCase().includes(q) ||
          e.customer_id.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  const statusCounts = {
    all: enrollments.length,
    enrolled: enrollments.filter((e) => e.status === "enrolled").length,
    in_progress: enrollments.filter((e) => e.status === "in_progress").length,
    completed: enrollments.filter((e) => e.status === "completed").length,
    exited: enrollments.filter((e) => e.status === "exited").length,
  };

  if (loading) {
    return (
      <div className="px-6 py-8 text-center text-sm text-gray-400">
        Loading enrollments…
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <Users size={22} className="text-gray-400" />
        </div>
        <div className="text-sm font-medium text-gray-600 mb-1">
          No customers enrolled
        </div>
        <div className="text-xs text-gray-400 text-center max-w-xs">
          Go to the Wholesale or D2C customer list, select customers, and click
          &quot;Assign Workflow&quot; to enroll them.
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["all", "enrolled", "in_progress", "completed", "exited"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all tabular-nums",
                statusFilter === s
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}{" "}
              <span className="text-gray-400">({statusCounts[s]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">Customer</th>
              <th className="px-4 py-2.5 text-left font-medium w-24">Type</th>
              <th className="px-4 py-2.5 text-left font-medium w-28">Status</th>
              <th className="px-4 py-2.5 text-left font-medium w-24">Enrolled</th>
              <th className="px-4 py-2.5 text-left font-medium">Email #1</th>
              <th className="px-4 py-2.5 text-left font-medium">Email #2</th>
              <th className="px-4 py-2.5 text-right font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50/50 group">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-800">
                    {e.customer_name || e.customer_id}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    ID: {e.customer_id}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase",
                    e.customer_type === "wholesale" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                  )}>
                    {e.customer_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={e.status} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {fmtDate(e.enrolled_at)}
                </td>
                <td className="px-4 py-3">
                  <EmailTracker
                    label="Email #1"
                    sent={e.email1_sent_at}
                    opened={e.email1_opened_at}
                    clicked={e.email1_clicked_at}
                  />
                </td>
                <td className="px-4 py-3">
                  <EmailTracker
                    label="Email #2"
                    sent={e.email2_sent_at}
                    opened={e.email2_opened_at}
                    clicked={e.email2_clicked_at}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                    {e.status === "enrolled" && (
                      <button
                        onClick={() => handleUpdateStatus(e.id, "exited")}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
                        title="Remove from workflow"
                      >
                        <LogOut size={13} />
                      </button>
                    )}
                    {e.status !== "completed" && e.status !== "exited" && (
                      <button
                        onClick={() => handleUpdateStatus(e.id, "completed")}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition"
                        title="Mark completed"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 text-right">
        {filtered.length} of {enrollments.length} customers shown
      </div>
    </div>
  );
}
