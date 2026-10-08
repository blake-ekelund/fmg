"use client";

import clsx from "clsx";
import type { SocialStatus } from "@/lib/social/types";

/** Small shared pieces for the social board and composer. */

export const STATUS_LABEL: Record<SocialStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Posted",
  partial: "Partly posted",
  failed: "Failed",
};
export const STATUS_STYLE: Record<SocialStatus, string> = {
  draft: "bg-amber-50 text-amber-700",
  scheduled: "bg-emerald-50 text-emerald-700",
  publishing: "bg-sky-50 text-sky-700",
  published: "bg-green-100 text-green-800",
  partial: "bg-orange-50 text-orange-700",
  failed: "bg-red-50 text-red-700",
};

export function SocialStatusPill({ status }: { status: SocialStatus }) {
  return (
    <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
