"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Check,
  Loader2,
  MessageSquare,
  Search,
  Star,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { NEGATIVE_TAGS, PERSONALITY_TAGS } from "@/lib/storefrontFeedback";

type Status = "new" | "reviewed" | "actioned" | "archived";

type Feedback = {
  id: string;
  store: "sassy" | "ni";
  ux_rating: number | null;
  personality_tags: string[] | null;
  personality: string | null;
  had_issues: boolean | null;
  issues: string | null;
  recommendations: string | null;
  name: string | null;
  email: string | null;
  consent_publish: boolean;
  code: string | null;
  source: string | null;
  status: Status;
  internal_note: string | null;
  created_at: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PAGE_SIZE = 20;

const STATUS_TABS: { key: "all" | Status | "bugs"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "bugs", label: "Reported bugs" },
  { key: "reviewed", label: "Reviewed" },
  { key: "actioned", label: "Actioned" },
  { key: "archived", label: "Archived" },
];

const STATUS_CHIP: Record<Status, string> = {
  new: "bg-amber-50 text-amber-700",
  reviewed: "bg-blue-50 text-blue-700",
  actioned: "bg-emerald-50 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
};

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-300">no rating</span>;
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

function Answer({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
        {children}
      </p>
    </div>
  );
}

/**
 * Pre-purchase site feedback from the storefront carts, each entry paired with
 * the single-use reward code it earned.
 *
 * These are reviews of the STORE, not of products — the shopper hadn't
 * received anything when they wrote them. So the page leads with the things
 * that are only knowable from inside a live session: what broke, and what they
 * wanted and couldn't find.
 *
 * `redeemed` tells us which reward codes actually got spent. The gap between
 * "left feedback" and "left feedback and then bought" is the only number that
 * says whether the trade is worth running.
 */
export default function FeedbackPage() {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [redeemed, setRedeemed] = useState<Record<string, string>>({});
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | Status | "bugs">("all");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-feedback", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.feedback ?? []);
      setRedeemed(json.redeemed ?? {});
      setNotReady(Boolean(json.notReady));
      setError(null);
    } catch {
      setError("Couldn't load feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function setStatus(id: string, status: Status) {
    setSaving(id);
    // Optimistic — this is a triage queue, and waiting a round-trip to see
    // your own click land makes it feel broken.
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const res = await fetch(`/api/storefront-feedback/${id}`, {
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
      setError("Couldn't update that entry.");
      setRows(before);
    } finally {
      setSaving(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: rows.length,
      bugs: rows.filter((r) => r.had_issues).length,
    };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const stats = useMemo(() => {
    const withCode = rows.filter((r) => r.code);
    const spent = withCode.filter((r) => redeemed[r.code!] !== undefined);
    const rated = rows.filter((r) => r.ux_rating);
    const avg = rated.length
      ? rated.reduce((s, r) => s + (r.ux_rating ?? 0), 0) / rated.length
      : null;
    return {
      total: rows.length,
      avg,
      bugs: rows.filter((r) => r.had_issues).length,
      converted: spent.length,
      conversion: withCode.length
        ? Math.round((spent.length / withCode.length) * 100)
        : null,
    };
  }, [rows, redeemed]);

  /** How often each adjective was picked — the fastest read on the brand. */
  const tagTally = useMemo(() => {
    const t = new Map<string, number>();
    for (const r of rows) {
      for (const tag of r.personality_tags ?? []) {
        t.set(tag, (t.get(tag) ?? 0) + 1);
      }
    }
    return PERSONALITY_TAGS.map((tag) => ({ tag, n: t.get(tag) ?? 0 })).filter(
      (x) => x.n > 0
    );
  }, [rows]);
  const tagMax = Math.max(1, ...tagTally.map((x) => x.n));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "bugs" ? !r.had_issues : tab !== "all" && r.status !== tab) {
        return false;
      }
      if (storeFilter !== "all" && r.store !== storeFilter) return false;
      if (!q) return true;
      return [
        r.personality,
        r.issues,
        r.recommendations,
        r.name,
        r.email,
        r.code,
        ...(r.personality_tags ?? []),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, tab, storeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        What shoppers said about the <strong className="font-medium">storefront</strong>{" "}
        — collected in the cart, before checkout, in exchange for a single-use
        reward code. These are not product reviews: nobody had received an order
        when they wrote them. Only entries marked{" "}
        <strong className="font-medium">publishable</strong> may be quoted.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading feedback…
        </div>
      ) : notReady ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <MessageSquare size={24} className="mx-auto text-gray-300" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">
            Feedback table isn&apos;t set up yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Run{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
              supabase/migrations/20260723060000_storefront_feedback.sql
            </code>
            . Once it exists, feedback appears here the moment shoppers start
            leaving it.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No feedback yet. Make sure the reward batch exists under{" "}
          <strong className="font-medium">Discount Codes</strong> — the cart
          offer stays hidden until a code can actually be minted.
        </div>
      ) : (
        <>
          {/* Roll-up */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Responses" value={String(stats.total)} />
            <Stat
              label="Avg. ease of use"
              value={stats.avg ? `${stats.avg.toFixed(1)} / 5` : "—"}
            />
            <Stat
              label="Reported bugs"
              value={String(stats.bugs)}
              hint="said something broke"
              alert={stats.bugs > 0}
            />
            <Stat
              label="Codes redeemed"
              value={
                stats.conversion === null
                  ? "—"
                  : `${stats.converted} · ${stats.conversion}%`
              }
              hint="feedback that became an order"
            />
          </div>

          {/* How the site reads */}
          {tagTally.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">
                How the site reads
              </div>
              <div className="mt-3 space-y-1.5">
                {tagTally.map(({ tag, n }) => {
                  const bad = NEGATIVE_TAGS.has(tag);
                  return (
                    <div key={tag} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-gray-600">
                        {tag}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${bad ? "bg-red-300" : "bg-emerald-300"}`}
                          style={{ width: `${(n / tagMax) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-gray-500">
                        {n}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Filters */}
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
                placeholder="Search answers, name, email, code"
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

          {/* Entries */}
          {pageItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
              No feedback matches these filters.
            </div>
          ) : (
            <ul className="space-y-3">
              {pageItems.map((r) => {
                const spentOn = r.code ? redeemed[r.code] : undefined;
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars rating={r.ux_rating} />
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
                      {r.had_issues ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          <Bug size={11} /> reported a bug
                        </span>
                      ) : null}
                      {r.consent_publish ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          <Check size={11} /> publishable
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

                    {r.personality_tags?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {r.personality_tags.map((t) => (
                          <span
                            key={t}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              NEGATIVE_TAGS.has(t)
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {r.issues ? <Answer label="What broke">{r.issues}</Answer> : null}
                    {r.recommendations ? (
                      <Answer label="What they'd change">{r.recommendations}</Answer>
                    ) : null}
                    {r.personality ? (
                      <Answer label="On the vibe">{r.personality}</Answer>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                      <span>{r.name || "anonymous"}</span>
                      {r.email ? (
                        <a
                          href={`mailto:${r.email}`}
                          className="text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
                        >
                          {r.email}
                        </a>
                      ) : null}
                      {r.code ? (
                        <span className="font-mono text-gray-600">{r.code}</span>
                      ) : null}
                      {spentOn !== undefined ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                          <Check size={11} /> redeemed
                          {spentOn ? ` · order ${spentOn}` : ""}
                        </span>
                      ) : r.code ? (
                        <span className="text-gray-400">code unspent</span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1 border-t border-gray-50 pt-3">
                      {(["reviewed", "actioned", "archived"] as Status[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={saving === r.id || r.status === s}
                          onClick={() => setStatus(r.id, s)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          {s === "archived" ? "Archive" : `Mark ${s}`}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pageCount > 1 ? (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
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
      className={`rounded-xl border bg-white px-4 py-3 ${alert ? "border-red-200" : "border-gray-200"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${alert ? "text-red-700" : "text-gray-900"}`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
}
