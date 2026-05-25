"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Star,
  MessageSquare,
  ShoppingBag,
  Users,
  Mail,
  Calendar,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type Audience = "all" | "d2c" | "wholesale";

type Response = {
  id: string;
  customer_type: "d2c" | "wholesale" | null;
  customer_ref: string | null;
  customer_name: string | null;
  customer_email: string | null;
  rating: number | null;
  what_went_well: string | null;
  what_didnt_go_well: string | null;
  what_to_improve: string | null;
  created_at: string;
};

const PAGE_SIZE = 50;

export default function CustomerFeedbackPage() {
  const [rows, setRows] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("all");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("quarterly_check_in_responses")
      .select(
        "id, customer_type, customer_ref, customer_name, customer_email, rating, what_went_well, what_didnt_go_well, what_to_improve, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (audience !== "all") q = q.eq("customer_type", audience);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Response[]);
    }
    setLoading(false);
  }, [audience]);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = useMemo(() => {
    const total = rows.length;
    const withRating = rows.filter((r) => r.rating != null);
    const avg =
      withRating.length > 0
        ? withRating.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
          withRating.length
        : null;
    return { total, avg, ratedCount: withRating.length };
  }, [rows]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1100px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Customer Feedback
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Responses from the quarterly check-in form. Most recent first.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          {(
            [
              { v: "all", label: "All" },
              { v: "d2c", label: "D2C" },
              { v: "wholesale", label: "Wholesale" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setAudience(opt.v)}
              className={clsx(
                "px-3 py-1.5 rounded-md transition font-medium",
                audience === opt.v
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Responses" value={summary.total.toLocaleString()} />
        <StatCard
          label="Avg. rating"
          value={
            summary.avg != null
              ? `${summary.avg.toFixed(1)} / 5`
              : "—"
          }
          hint={
            summary.avg != null
              ? `${summary.ratedCount} rated`
              : "no ratings yet"
          }
        />
        <StatCard
          label="Newest"
          value={
            rows[0]
              ? formatDate(rows[0].created_at)
              : "—"
          }
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center">
          <MessageSquare
            size={20}
            className="mx-auto text-gray-300 mb-2"
          />
          <div className="text-sm text-gray-500">No feedback yet.</div>
          <div className="text-[11px] text-gray-400 mt-1">
            Responses will show up here as customers submit the check-in form.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ResponseCard key={r.id} response={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-lg font-semibold text-gray-900 mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function ResponseCard({ response }: { response: Response }) {
  const typeIcon =
    response.customer_type === "d2c" ? (
      <ShoppingBag size={11} />
    ) : response.customer_type === "wholesale" ? (
      <Users size={11} />
    ) : null;
  const typeLabel =
    response.customer_type === "d2c"
      ? "D2C"
      : response.customer_type === "wholesale"
        ? "Wholesale"
        : "Unknown";

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {response.customer_name?.trim() || "Anonymous"}
            </div>
            <div className="text-[11px] text-gray-500 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="inline-flex items-center gap-1">
                {typeIcon}
                {typeLabel}
              </span>
              {response.customer_email && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={11} />
                  {response.customer_email}
                </span>
              )}
              {response.customer_ref && (
                <span className="text-gray-400">
                  ref {response.customer_ref}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {response.rating != null && (
            <div className="inline-flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={13}
                  className={clsx(
                    n <= (response.rating ?? 0)
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-200",
                  )}
                />
              ))}
            </div>
          )}
          <div className="text-[11px] text-gray-400 inline-flex items-center gap-1">
            <Calendar size={11} />
            {formatDate(response.created_at)}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeedbackBlock
          label="What went well"
          text={response.what_went_well}
          tone="green"
        />
        <FeedbackBlock
          label="What didn't go well"
          text={response.what_didnt_go_well}
          tone="amber"
        />
        <FeedbackBlock
          label="What we can do better"
          text={response.what_to_improve}
          tone="blue"
        />
      </div>
    </div>
  );
}

function FeedbackBlock({
  label,
  text,
  tone,
}: {
  label: string;
  text: string | null;
  tone: "green" | "amber" | "blue";
}) {
  return (
    <div>
      <div
        className={clsx(
          "text-[11px] font-medium uppercase tracking-wide mb-1",
          tone === "green" && "text-green-700",
          tone === "amber" && "text-amber-700",
          tone === "blue" && "text-blue-700",
        )}
      >
        {label}
      </div>
      {text && text.trim().length > 0 ? (
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {text}
        </div>
      ) : (
        <div className="text-xs text-gray-300 italic">No response</div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
