"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EnrollmentRow = {
  workflow_id: string;
  status: string;
  email1_sent_at: string | null;
  email2_sent_at: string | null;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  enrolled: number;
  emailsSent: number;
  completed: number;
  conversionRate: string;
  color: string;
};

const WORKFLOW_META: Record<string, { name: string; color: string }> = {
  "at-risk": { name: "At Risk — Win Back", color: "amber" },
  churned: { name: "Churned — Re-Engagement", color: "rose" },
};

export function useDashboardWorkflows() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("workflow_enrollments")
        .select("workflow_id, status, email1_sent_at, email2_sent_at");

      const rows = (data as EnrollmentRow[]) ?? [];

      const grouped: Record<string, EnrollmentRow[]> = {};
      for (const r of rows) {
        (grouped[r.workflow_id] ??= []).push(r);
      }

      const summaries: WorkflowSummary[] = Object.entries(WORKFLOW_META).map(
        ([id, meta]) => {
          const entries = grouped[id] ?? [];
          const enrolled = entries.length;
          const emailsSent = entries.filter((e) => e.email1_sent_at).length +
            entries.filter((e) => e.email2_sent_at).length;
          const completed = entries.filter((e) => e.status === "completed").length;
          const conversionRate =
            enrolled > 0 ? `${Math.round((completed / enrolled) * 100)}%` : "—";

          return { id, name: meta.name, enrolled, emailsSent, completed, conversionRate, color: meta.color };
        }
      );

      setWorkflows(summaries);
      setLoading(false);
    })();
  }, []);

  return { workflows, loading };
}
