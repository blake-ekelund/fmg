"use client";

import { Camera, Package, Share2 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { RecentAsset } from "../hooks/useDashboardAssets";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export default function RecentAssetsView({
  assets,
  loading,
}: {
  assets: RecentAsset[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Camera size={28} className="mb-2 text-gray-300" />
        <span className="text-sm font-medium">No assets uploaded yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {assets.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2"
        >
          <div className="shrink-0">
            {a.type === "photo" ? (
              <Camera size={14} className="text-violet-500" />
            ) : (
              <Package size={14} className="text-blue-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-800 truncate">
              {a.title}
            </div>
            <div className="text-[11px] text-gray-400">
              {a.type === "photo" ? "Photo Share" : "Media Kit"}
              {a.allow_third_party && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-500">
                  <Share2 size={9} /> 3rd party
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
            {timeAgo(a.uploaded_at)}
          </span>
        </div>
      ))}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/assets"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View all assets
        </Link>
      </div>
    </div>
  );
}
