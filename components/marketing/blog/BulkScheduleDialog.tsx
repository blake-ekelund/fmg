"use client";

import { useMemo, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import clsx from "clsx";
import type { BlogPostSummary } from "@/lib/blogPosts";
import { formatDateTime } from "./bits";

/**
 * Schedule (or reschedule) several blog posts at once: a start day and time,
 * and either all at that moment or spaced one per day / week in the order
 * they're listed. Shows every post's resulting time before anything changes.
 */

type Spacing = "same" | "day" | "week";

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function tomorrowAt9(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default function BulkScheduleDialog({
  posts,
  busy,
  onCancel,
  onConfirm,
}: {
  posts: BlogPostSummary[];
  busy: boolean;
  onCancel: () => void;
  /** One ISO time per post, in the same order. */
  onConfirm: (times: string[]) => void;
}) {
  const start = tomorrowAt9();
  const [date, setDate] = useState(dateValue(start));
  const [time, setTime] = useState("09:00");
  const [spacing, setSpacing] = useState<Spacing>(posts.length > 1 ? "day" : "same");
  const [now] = useState(() => Date.now());

  const times = useMemo(() => {
    const first = new Date(`${date}T${time}`);
    if (Number.isNaN(first.getTime())) return null;
    const step = spacing === "day" ? 1 : spacing === "week" ? 7 : 0;
    return posts.map((_, i) => {
      const d = new Date(first);
      d.setDate(d.getDate() + i * step);
      return d.toISOString();
    });
  }, [date, time, spacing, posts]);

  const inPast = !!times && new Date(times[0]).getTime() < now + 60_000;
  const rescheduling = posts.some((p) => p.status === "scheduled");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={busy ? undefined : onCancel}>
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <CalendarClock size={20} className="text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            {rescheduling ? "Reschedule" : "Schedule"} {posts.length} post{posts.length === 1 ? "" : "s"}
          </h3>
          <button onClick={onCancel} disabled={busy} className="ml-auto rounded-full p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-gray-700">
              {posts.length > 1 && spacing !== "same" ? "First one on" : "Day"}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              />
            </label>
          </div>

          {posts.length > 1 && (
            <div>
              <div className="text-sm font-medium text-gray-700">How should they go out?</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["same", "All at once"],
                    ["day", "One per day"],
                    ["week", "One per week"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSpacing(v)}
                    className={clsx(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition",
                      spacing === v ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700 hover:border-gray-300",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-medium text-gray-700">They&apos;ll go live</div>
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {posts.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-gray-800">{p.title || "Untitled post"}</span>
                  <span className="shrink-0 text-gray-500">{times ? formatDateTime(times[i]) : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-400">In the order they&apos;re listed. Each goes live on its brand&apos;s site within about five minutes of its time.</p>
          </div>

          {inPast && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              That time has already passed — pick a later one. (To publish right away, open a post and publish it.)
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onCancel} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => times && onConfirm(times)}
            disabled={busy || !times || inPast}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {rescheduling ? "Reschedule" : "Schedule"} {posts.length === 1 ? "post" : `${posts.length} posts`}
          </button>
        </div>
      </div>
    </div>
  );
}
