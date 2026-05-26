"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Star,
  MessageSquare,
  ShoppingBag,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type Audience = "all" | "d2c" | "wholesale";
type SortKey = "customer_name" | "rating" | "created_at";
type SortDir = "asc" | "desc";

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

const PAGE_SIZE = 25;

export default function CustomerFeedbackPage() {
  const [rows, setRows] = useState<Response[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Reset to page 0 whenever the filter or sort changes — the current page
  // index may not exist in the new filtered/ordered set.
  useEffect(() => {
    setPage(0);
  }, [audience, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible defaults per column: text asc, rating/date desc (largest first).
      setSortDir(key === "customer_name" ? "asc" : "desc");
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("quarterly_check_in_responses")
      .select(
        "id, customer_type, customer_ref, customer_name, customer_email, rating, what_went_well, what_didnt_go_well, what_to_improve, created_at",
        { count: "exact" },
      )
      .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
      // Stable secondary sort so ties (e.g. two anonymous rows) don't flicker.
      .order("created_at", { ascending: false })
      .range(from, to);
    if (audience !== "all") q = q.eq("customer_type", audience);
    const { data, count, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
      setTotalCount(0);
    } else {
      setRows((data ?? []) as Response[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [audience, page, sortKey, sortDir]);

  useEffect(() => {
    reload();
  }, [reload]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + rows.length, totalCount);

  return (
    <div className="px-4 md:px-8 py-4 md:py-5 space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
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

        {!loading && !error && totalCount > 0 && (
          <div className="ml-auto text-xs text-gray-500 tabular-nums">
            {totalCount.toLocaleString()} response
            {totalCount === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50/60">
              <SortableTh
                label="Customer"
                sortKey="customer_name"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                widthClass="w-[200px]"
              />
              <th className="px-3 py-2.5 text-left font-medium w-[110px]">
                Type
              </th>
              <SortableTh
                label="Rating"
                sortKey="rating"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                widthClass="w-[110px]"
              />
              <th className="px-3 py-2.5 text-left font-medium">What went well</th>
              <th className="px-3 py-2.5 text-left font-medium">
                What didn&apos;t go well
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                What we can do better
              </th>
              <SortableTh
                label="Date"
                sortKey="created_at"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                widthClass="w-[110px]"
              />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 bg-red-50/40">
                  <div className="text-sm text-red-700">{error}</div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center">
                  <MessageSquare
                    size={20}
                    className="mx-auto text-gray-300 mb-2"
                  />
                  <div className="text-sm text-gray-500">No feedback yet.</div>
                  <div className="text-[11px] text-gray-400 mt-1">
                    Responses will show up here as customers submit the
                    check-in form.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => <FeedbackRow key={r.id} response={r} />)
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && !error && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
            <div>
              Showing{" "}
              <span className="font-medium text-gray-700 tabular-nums">
                {pageStart + 1}–{pageEnd}
              </span>{" "}
              of{" "}
              <span className="font-medium text-gray-700 tabular-nums">
                {totalCount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={12} />
                Prev
              </button>
              <span className="px-2 tabular-nums">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={safePage >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  widthClass,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  widthClass?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={clsx(
        "px-3 py-2.5 text-left font-medium select-none cursor-pointer hover:text-gray-600 transition-colors group",
        widthClass,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp size={11} className="text-gray-600" />
          ) : (
            <ChevronDown size={11} className="text-gray-600" />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </span>
    </th>
  );
}

function FeedbackRow({ response }: { response: Response }) {
  return (
    <tr className="hover:bg-gray-50/60 transition align-top">
      {/* Customer */}
      <td className="px-3 py-2.5">
        <div className="text-xs font-medium text-gray-900 truncate max-w-[200px]">
          {response.customer_name?.trim() || "Anonymous"}
        </div>
        {response.customer_email && (
          <div
            className="text-[11px] text-gray-500 truncate max-w-[200px]"
            title={response.customer_email}
          >
            {response.customer_email}
          </div>
        )}
      </td>

      {/* Type */}
      <td className="px-3 py-2.5">
        <TypeBadge type={response.customer_type} />
      </td>

      {/* Rating */}
      <td className="px-3 py-2.5">
        {response.rating != null ? (
          <div className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                size={12}
                className={clsx(
                  n <= (response.rating ?? 0)
                    ? "fill-amber-400 text-amber-400"
                    : "text-gray-200",
                )}
              />
            ))}
          </div>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      <TextCell text={response.what_went_well} />
      <TextCell text={response.what_didnt_go_well} />
      <TextCell text={response.what_to_improve} />

      {/* Date */}
      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
        {formatDate(response.created_at)}
      </td>
    </tr>
  );
}

function TextCell({ text }: { text: string | null }) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return (
      <td className="px-3 py-2.5">
        <span className="text-xs text-gray-300">—</span>
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5">
      <div
        className="text-xs text-gray-700 leading-relaxed line-clamp-2 max-w-[280px]"
        title={trimmed}
      >
        {trimmed}
      </div>
    </td>
  );
}

function TypeBadge({ type }: { type: "d2c" | "wholesale" | null }) {
  if (type === "d2c") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
        <ShoppingBag size={11} />
        D2C
      </span>
    );
  }
  if (type === "wholesale") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
        <Users size={11} />
        Wholesale
      </span>
    );
  }
  return <span className="text-xs text-gray-300">—</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
