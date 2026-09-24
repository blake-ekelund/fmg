"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, Loader2, Search, Star, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Status = "pending" | "approved" | "rejected";

type Review = {
  id: string;
  created_at: string;
  store: "sassy" | "ni";
  part: string | null;
  product_name: string | null;
  rating: number;
  title: string | null;
  body: string;
  display_name: string;
  email: string;
  verified: boolean;
  source: "insert" | "email" | "invoice" | null;
  consent_feature: boolean;
  status: Status;
  reviewed_at: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PAGE_SIZE = 20;

const STATUS_TABS: { key: "all" | Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_CHIP: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-gray-100 text-gray-500",
};

const SOURCE_LABEL: Record<NonNullable<Review["source"]>, string> = {
  insert: "insert QR",
  email: "email link",
  invoice: "invoice link",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}
        />
      ))}
    </span>
  );
}

/**
 * Product reviews from D2C customers, collected on each storefront's /review
 * page (QR code on the order insert, email link, invoice link). Everything
 * arrives pending; nothing is shown publicly until approved here — and even
 * then only reviews whose author ticked "you may feature my review".
 */
export default function ProductReviewsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | Status>("pending");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/product-reviews", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.reviews ?? []);
      setNotReady(Boolean(json.notReady));
      setError(null);
    } catch {
      setError("Couldn't load reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function setStatus(id: string, status: Status) {
    setSaving(id);
    // Optimistic — a moderation queue should feel instant.
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const res = await fetch(`/api/product-reviews/${id}`, {
        method: "PATCH",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Couldn't update (${res.status})`);
        setRows(before);
      }
    } catch {
      setError("Couldn't update that review.");
      setRows(before);
    } finally {
      setSaving(null);
    }
  }

  const scoped = useMemo(
    () => rows.filter((r) => storeFilter === "all" || r.store === storeFilter),
    [rows, storeFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    for (const r of scoped) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [scoped]);

  const stats = useMemo(() => {
    const avg = scoped.length
      ? scoped.reduce((s, r) => s + r.rating, 0) / scoped.length
      : null;
    const verified = scoped.filter((r) => r.verified).length;
    return {
      total: scoped.length,
      avg,
      pending: scoped.filter((r) => r.status === "pending").length,
      verifiedPct: scoped.length ? Math.round((verified / scoped.length) * 100) : null,
    };
  }, [scoped]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!q) return true;
      return [r.title, r.body, r.display_name, r.email, r.product_name, r.part]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [scoped, query, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        Product reviews from customers, left on{" "}
        <strong className="font-medium">sassyandco.com/review</strong> and{" "}
        <strong className="font-medium">naturalinspirations.com/review</strong> — from
        the insert QR code, email links, and invoice links. Everything arrives{" "}
        <strong className="font-medium">pending</strong>; only approved reviews whose
        author allowed featuring may be shown publicly.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading reviews…
        </div>
      ) : notReady ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <Star size={24} className="mx-auto text-gray-300" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">
            Reviews table isn&apos;t set up yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Run{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
              supabase/migrations/20260924010000_product_reviews.sql
            </code>
            . Reviews appear here as soon as customers start leaving them.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No reviews yet. Share{" "}
          <strong className="font-medium">sassyandco.com/review?src=insert</strong> /{" "}
          <strong className="font-medium">naturalinspirations.com/review?src=insert</strong>{" "}
          on the order inserts to start collecting them.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Reviews" value={String(stats.total)} />
            <Stat
              label="Avg. rating"
              value={stats.avg ? `${stats.avg.toFixed(1)} / 5` : "—"}
            />
            <Stat
              label="Awaiting moderation"
              value={String(stats.pending)}
              alert={stats.pending > 0}
            />
            <Stat
              label="Verified purchases"
              value={stats.verifiedPct === null ? "—" : `${stats.verifiedPct}%`}
              hint="left from a personal order link"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search review, name, email, product"
                className="w-72 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {STATUS_TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setTab(t.key);
                      setPage(0);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      active
                        ? "bg-gray-900 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.label}
                    <span className={active ? "ml-1 text-gray-300" : "ml-1 text-gray-400"}>
                      {counts[t.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto">
              <select
                value={storeFilter}
                onChange={(e) => {
                  setStoreFilter(e.target.value as typeof storeFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">Both stores</option>
                <option value="sassy">Sassy</option>
                <option value="ni">NI</option>
              </select>
            </div>
          </div>

          {pageItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
              No reviews match these filters.
            </div>
          ) : (
            <ul className="space-y-3">
              {pageItems.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} />
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[r.status]}`}
                    >
                      {r.status}
                    </span>
                    <span
                      className={
                        r.store === "sassy"
                          ? "inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700"
                          : "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                      }
                    >
                      {r.store === "sassy" ? "Sassy" : "NI"}
                    </span>
                    {r.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        <BadgeCheck size={11} /> verified purchase
                      </span>
                    ) : null}
                    {r.consent_feature ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        <Check size={11} /> may feature
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-400">
                        internal only
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-gray-400">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 text-xs font-medium text-gray-500">
                    {r.product_name || r.part || "Product not specified"}
                    {r.part && r.product_name ? (
                      <span className="ml-1.5 font-mono text-gray-400">{r.part}</span>
                    ) : null}
                  </div>
                  {r.title ? (
                    <div className="mt-1 text-sm font-semibold text-gray-900">{r.title}</div>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {r.body}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-700">{r.display_name}</span>
                    <a
                      href={`mailto:${r.email}`}
                      className="text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
                    >
                      {r.email}
                    </a>
                    {r.source ? <span>via {SOURCE_LABEL[r.source]}</span> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1 border-t border-gray-50 pt-3">
                    <button
                      type="button"
                      disabled={saving === r.id || r.status === "approved"}
                      onClick={() => setStatus(r.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={saving === r.id || r.status === "rejected"}
                      onClick={() => setStatus(r.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <X size={12} /> Reject
                    </button>
                    {r.status !== "pending" ? (
                      <button
                        type="button"
                        disabled={saving === r.id}
                        onClick={() => setStatus(r.id, "pending")}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-gray-700 disabled:opacity-40"
                      >
                        Back to pending
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 ? (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {filtered.length} review{filtered.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 ${alert ? "border-amber-200" : "border-gray-200"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${alert ? "text-amber-700" : "text-gray-900"}`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
}
