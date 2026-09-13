"use client";

import clsx from "clsx";
import type { BlogBrand, BlogStatus } from "@/lib/blogPosts";

/** Small shared pieces for the blog board and editor. */

export function BrandPill({ brand }: { brand: BlogBrand }) {
  return (
    <span
      className={clsx(
        "rounded px-2 py-0.5 text-[10px] font-semibold",
        brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600",
      )}
    >
      {brand}
    </span>
  );
}

const STATUS_LABEL: Record<BlogStatus, string> = {
  generating: "Generating",
  ai_draft: "AI draft (old)",
  human_review: "Draft",
  ready: "Draft",
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Live",
  archived: "Archived",
  deleted: "Deleted",
};

const STATUS_STYLE: Record<BlogStatus, string> = {
  generating: "bg-gray-100 text-gray-500",
  ai_draft: "bg-gray-100 text-gray-500",
  human_review: "bg-amber-50 text-amber-700",
  ready: "bg-amber-50 text-amber-700",
  draft: "bg-amber-50 text-amber-700",
  scheduled: "bg-emerald-50 text-emerald-700",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-500",
  deleted: "bg-gray-100 text-gray-400",
};

export function StatusPill({ status }: { status: BlogStatus }) {
  return (
    <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "in 3 days", "2 hours ago", "just now". Coarse on purpose. */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  let n: number;
  let unit: string;
  if (abs < min) return future ? "in a moment" : "just now";
  if (abs < hour) {
    n = Math.round(abs / min);
    unit = "minute";
  } else if (abs < day) {
    n = Math.round(abs / hour);
    unit = "hour";
  } else if (abs < 30 * day) {
    n = Math.round(abs / day);
    unit = "day";
  } else {
    n = Math.round(abs / (30 * day));
    unit = "month";
  }
  const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return future ? `in ${label}` : `${label} ago`;
}

/** ISO ↔ the value an <input type="datetime-local"> wants (local wall time). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
