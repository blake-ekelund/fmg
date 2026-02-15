"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ContentStatus, WORKFLOW_ORDER } from "../../types";
import { Check } from "lucide-react";

type Props = {
  contentId: string | null;
};

type ProfileRef = {
  first_name: string;
  email: string;
};

type ContentRow = {
  status: ContentStatus;
  created_at: string;
  created_by_profile: ProfileRef | ProfileRef[] | null;
};

type ActivityRow = {
  id: string;
  content_id: string;
  metadata: { from?: ContentStatus; to?: ContentStatus } | null;
  created_at: string;
  performed_by_profile: ProfileRef | ProfileRef[] | null;
};

type StageEntry = {
  timestamp: string | null;
  actor: string | null;
};

function isProfileRef(v: unknown): v is ProfileRef {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.first_name === "string" && typeof r.email === "string";
}

function pickProfile(v: unknown): ProfileRef | null {
  if (Array.isArray(v)) {
    const first = v[0];
    return isProfileRef(first) ? first : null;
  }
  return isProfileRef(v) ? v : null;
}

function formatActor(profile: ProfileRef | null): string | null {
  if (!profile) return null;
  const name = profile.first_name.trim();
  return name ? name : profile.email;
}

export function ActivitySection({ contentId }: Props) {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [currentStatus, setCurrentStatus] = useState<ContentStatus>("Draft");
  const [loading, setLoading] = useState(true);

  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!contentId) return;

    let mounted = true;

    async function load() {
      setLoading(true);

      // Content + creator
      const { data: content, error: contentError } = await supabase
        .from("marketing_content")
        .select(
          `
            status,
            created_at,
            created_by_profile:created_by (
              first_name,
              email
            )
          `
        )
        .eq("id", contentId)
        .single();

      if (contentError) console.error(contentError);

      if (mounted && content) {
        const row = content as unknown as ContentRow;

        setCurrentStatus(row.status);
        setCreatedAt(row.created_at);

        const profile = pickProfile(row.created_by_profile);
        setCreatedBy(formatActor(profile));
      }

      // Activity + actor
      const { data: activityData, error: activityError } = await supabase
        .from("marketing_content_activity")
        .select(
          `
            id,
            content_id,
            metadata,
            created_at,
            performed_by_profile:performed_by (
              first_name,
              email
            )
          `
        )
        .eq("content_id", contentId)
        .eq("event_type", "status_changed")
        .order("created_at", { ascending: true });

      if (activityError) console.error(activityError);

      if (mounted && activityData) {
        setActivity(activityData as unknown as ActivityRow[]);
      }

      if (mounted) setLoading(false);
    }

    load();

    // Optional realtime: if you want names on realtime inserts too, you’d need to re-fetch,
    // because realtime INSERT payload won’t include joined profile fields.
    const channel = supabase
      .channel(`workflow-${contentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "marketing_content_activity",
          filter: `content_id=eq.${contentId}`,
        },
        async () => {
          // re-fetch to get joined profile
          const { data } = await supabase
            .from("marketing_content_activity")
            .select(
              `
                id,
                content_id,
                metadata,
                created_at,
                performed_by_profile:performed_by (
                  first_name,
                  email
                )
              `
            )
            .eq("content_id", contentId)
            .eq("event_type", "status_changed")
            .order("created_at", { ascending: true });

          if (mounted && data) setActivity(data as unknown as ActivityRow[]);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [contentId]);

  const statusMap = useMemo(() => {
    const map: Partial<Record<ContentStatus, StageEntry>> = {};

    for (const event of activity) {
      const toStatus = event.metadata?.to;
      if (!toStatus || map[toStatus]) continue;

      const profile = pickProfile(event.performed_by_profile);
      map[toStatus] = {
        timestamp: event.created_at,
        actor: formatActor(profile),
      };
    }

    return map;
  }, [activity]);

  if (!contentId) {
    return <div className="text-sm text-gray-500">Save this content to view workflow.</div>;
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading workflow…</div>;
  }

  const currentIndex = WORKFLOW_ORDER.indexOf(currentStatus);

  return (
    <div className="space-y-4 text-sm">
      {WORKFLOW_ORDER.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        const entry: StageEntry | undefined =
          step === "Draft"
            ? { timestamp: createdAt, actor: createdBy }
            : statusMap[step];

        const circleClass = isComplete
          ? "bg-blue-600 border-blue-600 text-white"
          : isCurrent
          ? "bg-blue-600 border-blue-600 text-white"
          : "bg-white border-gray-300 text-gray-300";

        return (
          <div key={step} className="relative pl-8">
            {/* Circle */}
            <span
              className={`absolute left-0 top-1 h-5 w-5 rounded-full flex items-center justify-center border transition ${circleClass}`}
            >
              {isComplete ? <Check size={12} /> : null}
            </span>

            {/* Connector */}
            {index !== WORKFLOW_ORDER.length - 1 && (
              <span className="absolute left-2.5 top-6 bottom-0 w-px bg-gray-200" />
            )}

            <div
              className={`rounded-xl border p-3 transition ${
                isComplete || isCurrent
                  ? "bg-white border-gray-200"
                  : "bg-gray-50 border-gray-200 opacity-60"
              }`}
            >
              <div
                className={`font-medium ${
                  isComplete || isCurrent ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {step}
              </div>

              {entry?.timestamp ? (
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <div>{new Date(entry.timestamp).toLocaleString()}</div>
                  {entry.actor ? <div className="text-gray-400">by {entry.actor}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
