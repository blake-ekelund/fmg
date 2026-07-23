"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  MailOpen,
  MousePointerClick,
  TrendingUp,
  MinusCircle,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Cohort = {
  key: string;
  automationId: string;
  automationName: string;
  label: string;
  number: number;
  firstReleasedAt: string | null;
  size: number;
  sent: number;
  opened: number;
  clicked: number;
  wonBack: number;
  unsubscribed: number;
  noAction: number;
  stillActive: number;
  isTest: boolean;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [automations, setAutomations] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/cohorts", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setCohorts((json.cohorts as Cohort[]) ?? []);
      setAutomations((json.automations as { id: string; name: string }[]) ?? []);
      setTruncated(!!json.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  /* Test batches are hidden by default: their mail went to a tester, so their
     open and click numbers say nothing about the campaign and would quietly
     poison the headline rates. */
  const [showTests, setShowTests] = useState(false);

  const shown = useMemo(
    () =>
      cohorts
        .filter((c) => (filter === "all" ? true : c.automationId === filter))
        .filter((c) => showTests || !c.isTest),
    [cohorts, filter, showTests],
  );

  const testCount = useMemo(() => cohorts.filter((c) => c.isTest).length, [cohorts]);

  /* Totals across the visible set — the baseline each batch is measured against. */
  const totals = useMemo(() => {
    const t = { size: 0, sent: 0, opened: 0, clicked: 0, wonBack: 0, noAction: 0, unsubscribed: 0 };
    for (const c of shown) {
      t.size += c.size;
      t.sent += c.sent;
      t.opened += c.opened;
      t.clicked += c.clicked;
      t.wonBack += c.wonBack;
      t.noAction += c.noAction;
      t.unsubscribed += c.unsubscribed;
    }
    return t;
  }, [shown]);

  return (
    <div className="w-full space-y-4 p-5 md:px-7 max-w-[1200px] mx-auto">
      <Link
        href="/automations"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition hover:text-brand-700"
      >
        <ArrowLeft size={12} /> Automations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Cohort results</h1>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Every released batch and what came of it. Each customer counts once,
            in their most-committed outcome.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {testCount > 0 && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-secondary">
              <input
                type="checkbox"
                checked={showTests}
                onChange={(e) => setShowTests(e.target.checked)}
                className="h-3 w-3 cursor-pointer rounded border-line-strong accent-brand-700"
              />
              Show {testCount} test batch{testCount === 1 ? "" : "es"}
            </label>
          )}
        {automations.length > 1 && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-secondary focus:border-brand-400 focus:outline-none"
          >
            <option value="all">All automations</option>
            {automations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft px-3 py-2 text-[11px] text-critical">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {error}
        </div>
      )}

      {truncated && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] text-warning">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          Showing the most recent enrollments only — older batches may be
          incomplete.
        </div>
      )}

      {/* Headline rates across the filtered set */}
      {!loading && shown.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi
            icon={MailOpen}
            label="Open rate"
            value={`${pct(totals.opened, totals.size)}%`}
            detail={`${totals.opened} of ${totals.size}`}
          />
          <Kpi
            icon={MousePointerClick}
            label="Click rate"
            value={`${pct(totals.clicked, totals.size)}%`}
            detail={`${totals.clicked} clicked through`}
          />
          <Kpi
            icon={TrendingUp}
            label="Win-backs"
            value={`${pct(totals.wonBack, totals.size)}%`}
            detail={`${totals.wonBack} ordered`}
            good
          />
          <Kpi
            icon={MinusCircle}
            label="No action"
            value={`${pct(totals.noAction, totals.size)}%`}
            detail={`${totals.noAction} customers`}
            muted
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-[11px] text-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Loading cohorts…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-14 text-center shadow-card">
          <Layers size={22} className="mx-auto mb-2 text-ink-subtle" />
          <p className="text-xs font-medium text-ink">No batches released yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] text-ink-muted">
            Switch a status-change automation to{" "}
            <span className="font-medium">Weekly batches</span> and the first
            cohort appears here after its release day.
          </p>
          <Link
            href="/automations"
            className="mt-3 inline-block text-[11px] font-medium text-brand-700 hover:underline"
          >
            Go to Automations
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-[11px]">
                <thead>
                  <tr className="border-b border-line bg-surface-muted text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Released</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2 text-right">Sent</th>
                    <th className="px-3 py-2 text-right">Opened</th>
                    <th className="px-3 py-2 text-right">Clicked</th>
                    <th className="px-3 py-2 text-right">Won back</th>
                    <th className="px-3 py-2 text-right">No action</th>
                    <th className="px-3 py-2 text-right">Unsub</th>
                    <th className="px-3 py-2">Mix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((c) => (
                    <tr
                      key={c.key}
                      className={clsx(
                        "transition-colors hover:bg-surface-muted",
                        c.isTest && "bg-warning-soft/40",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-ink">{c.label}</span>
                          {c.isTest && (
                            <span className="shrink-0 rounded bg-warning-soft px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                              Test
                            </span>
                          )}
                        </div>
                        {filter === "all" && (
                          <div className="text-[10px] text-ink-subtle">{c.automationName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{shortDate(c.firstReleasedAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{c.size}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{c.sent}</td>
                      <RateCell n={c.opened} of={c.size} />
                      <RateCell n={c.clicked} of={c.size} />
                      <RateCell n={c.wonBack} of={c.size} strong />
                      <RateCell n={c.noAction} of={c.size} muted />
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                        {c.unsubscribed}
                      </td>
                      <td className="px-3 py-2">
                        <MixBar cohort={c} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {shown.map((c) => (
              <li
                key={c.key}
                className="rounded-xl border border-line bg-surface p-3 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-ink">{c.label}</span>
                      {c.isTest && (
                        <span className="shrink-0 rounded bg-warning-soft px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                          Test
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-ink-subtle">
                      {c.automationName} · {shortDate(c.firstReleasedAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                    {c.size}
                  </span>
                </div>

                <div className="mt-2">
                  <MixBar cohort={c} />
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Open" value={`${pct(c.opened, c.size)}%`} />
                  <MiniStat label="Click" value={`${pct(c.clicked, c.size)}%`} />
                  <MiniStat label="Won" value={`${pct(c.wonBack, c.size)}%`} strong />
                  <MiniStat label="None" value={`${pct(c.noAction, c.size)}%`} muted />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {shown.length > 0 && (
        <p className="text-[10px] text-ink-subtle">
          Open rate depends on tracking pixels, which Gmail and Apple Mail
          prefetch and many gateways block — treat it as noisy. Clicks and
          win-backs come from real link redirects and order activity, so those
          are the numbers to judge a batch on. Replies aren&apos;t tracked:
          mail is outbound-only, so customers reply straight to the rep&apos;s
          own mailbox.
        </p>
      )}
    </div>
  );
}

/* ─── Pieces ─── */

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  good,
  muted,
}: {
  icon: typeof MailOpen;
  label: string;
  value: string;
  detail: string;
  good?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-1.5">
        <Icon
          size={12}
          className={good ? "text-positive" : muted ? "text-ink-subtle" : "text-brand-600"}
        />
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className={clsx(
          "mt-1 text-lg font-semibold tabular-nums leading-none",
          good ? "text-positive" : muted ? "text-ink-muted" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-ink-subtle">{detail}</div>
    </div>
  );
}

function RateCell({
  n,
  of,
  strong,
  muted,
}: {
  n: number;
  of: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td className="px-3 py-2 text-right">
      <span
        className={clsx(
          "tabular-nums font-medium",
          strong ? "text-positive" : muted ? "text-ink-muted" : "text-ink-secondary",
        )}
      >
        {pct(n, of)}%
      </span>
      <span className="ml-1 text-[10px] tabular-nums text-ink-subtle">({n})</span>
    </td>
  );
}

/** Single stacked bar: won back → clicked → no action → unsubscribed. */
function MixBar({ cohort }: { cohort: Cohort }) {
  const total = Math.max(cohort.size, 1);
  const segments = [
    { n: cohort.wonBack, cls: "bg-positive", title: "Won back" },
    { n: cohort.clicked, cls: "bg-brand-500", title: "Clicked" },
    { n: cohort.noAction, cls: "bg-line-strong", title: "No action" },
    { n: cohort.unsubscribed, cls: "bg-critical", title: "Unsubscribed" },
  ].filter((s) => s.n > 0);

  return (
    <div className="flex h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-surface-sunken">
      {segments.map((s) => (
        <div
          key={s.title}
          className={s.cls}
          style={{ width: `${(s.n / total) * 100}%` }}
          title={`${s.title}: ${s.n}`}
        />
      ))}
    </div>
  );
}

function MiniStat({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={clsx(
          "text-xs font-semibold tabular-nums",
          strong ? "text-positive" : muted ? "text-ink-muted" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-subtle">{label}</div>
    </div>
  );
}
