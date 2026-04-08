"use client";

import Link from "next/link";
import clsx from "clsx";
import type { SocialPipelineCounts } from "../hooks/useDashboardSocialPipeline";

const STAGES: { key: keyof SocialPipelineCounts; label: string; accent: string; bg: string }[] = [
  { key: "ai_draft", label: "AI Draft", accent: "border-l-purple-400", bg: "bg-purple-50" },
  { key: "human_review", label: "Human Review", accent: "border-l-blue-400", bg: "bg-blue-50" },
  { key: "ready", label: "Ready", accent: "border-l-emerald-400", bg: "bg-emerald-50" },
];

type Props = {
  counts: SocialPipelineCounts;
  loading: boolean;
};

export default function SocialPipelineView({ counts, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const total = counts.ai_draft + counts.human_review + counts.ready;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {STAGES.map((s) => (
          <div key={s.key} className={clsx("rounded-xl border-l-4 p-3", s.accent, s.bg)}>
            <div className="text-2xl font-bold tabular-nums text-gray-900">{counts[s.key]}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{total} post{total !== 1 ? "s" : ""} in pipeline</span>
        <Link href="/social-media" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View social media
        </Link>
      </div>
    </div>
  );
}
