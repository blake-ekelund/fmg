"use client";

import Link from "next/link";
import { Clock, Eye, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import type { PipelinePost, PipelineSummary } from "../hooks/useDashboardContentPipeline";

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  human_review: {
    label: "Review",
    icon: <Eye size={11} />,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
  ai_draft: {
    label: "AI Draft",
    icon: <Clock size={11} />,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
  },
  ready: {
    label: "Ready",
    icon: <CheckCircle2 size={11} />,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
};

const BRAND_BADGE: Record<string, string> = {
  NI: "bg-amber-50 text-amber-700 border-amber-200",
  Sassy: "bg-pink-50 text-pink-700 border-pink-200",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type Props = {
  posts: PipelinePost[];
  summary: PipelineSummary;
  loading: boolean;
  type: "blog" | "social";
  showBrand?: boolean;
};

export default function ContentPipelineView({
  posts,
  summary,
  loading,
  type,
  showBrand = false,
}: Props) {
  const filtered = posts.filter((p) => p.type === type);

  // Recount summary for this type only
  const typeSummary: PipelineSummary = { ai_draft: 0, human_review: 0, ready: 0 };
  for (const p of filtered) {
    if (p.status in typeSummary) typeSummary[p.status as keyof PipelineSummary]++;
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const total = typeSummary.ai_draft + typeSummary.human_review + typeSummary.ready;
  const href = type === "blog" ? "/blog-posts" : "/social-media";
  const label = type === "blog" ? "Blog posts" : "Social media";

  return (
    <div className="space-y-3">
      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {typeSummary.human_review > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold bg-blue-50 border-blue-200 text-blue-700">
            <Eye size={11} />
            {typeSummary.human_review} needs review
          </span>
        )}
        {typeSummary.ai_draft > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium bg-purple-50 border-purple-200 text-purple-600">
            <Clock size={11} />
            {typeSummary.ai_draft} AI draft{typeSummary.ai_draft !== 1 ? "s" : ""}
          </span>
        )}
        {typeSummary.ready > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium bg-emerald-50 border-emerald-200 text-emerald-600">
            <CheckCircle2 size={11} />
            {typeSummary.ready} ready
          </span>
        )}
        {total === 0 && (
          <span className="text-xs text-gray-400">No {type === "blog" ? "blog posts" : "social posts"} in pipeline</span>
        )}
      </div>

      {/* Post list */}
      {filtered.length > 0 && (
        <div className="space-y-0.5">
          {filtered.slice(0, 8).map((post) => {
            const cfg = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.ai_draft;
            const brandStyle = BRAND_BADGE[post.brand] ?? "";
            return (
              <Link
                key={post.id}
                href={href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors group"
              >
                {/* Brand badge */}
                {showBrand && (
                  <span
                    className={clsx(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 uppercase tracking-wide",
                      brandStyle
                    )}
                  >
                    {post.brand}
                  </span>
                )}

                {/* Title */}
                <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-blue-600 transition-colors">
                  {post.title}
                </span>

                {/* Platform (social only) */}
                {post.type === "social" && post.platform && (
                  <span className="text-[10px] text-gray-400 shrink-0 hidden md:inline">
                    {post.platform}
                  </span>
                )}

                {/* Status pill */}
                <span
                  className={clsx(
                    "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0",
                    cfg.bg,
                    cfg.color
                  )}
                >
                  {cfg.icon}
                  {cfg.label}
                </span>

                {/* Time ago */}
                <span className="text-[10px] text-gray-300 shrink-0 w-10 text-right hidden sm:inline">
                  {timeAgo(post.updated_at)}
                </span>
              </Link>
            );
          })}

          {filtered.length > 8 && (
            <div className="text-[11px] text-gray-400 px-3 py-1">
              + {filtered.length - 8} more
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <Link
          href={href}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View all {label.toLowerCase()}
        </Link>
      </div>
    </div>
  );
}
