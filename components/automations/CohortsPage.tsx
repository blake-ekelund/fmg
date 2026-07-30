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

/* ─── Server shapes ─── */

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

type Campaign = {
  key: string;
  name: string;
  subject: string;
  date: string;
  isTest: boolean;
  size: number;
  sent: number;
  skipped: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  noAction: number;
};

/* ─── One unified row: a campaign is a one-step cohort ───
   wonBack is null for campaigns (no order-exit tracking on blasts yet), so the
   column renders "—" instead of a misleading 0%. */
type ResultRow = {
  kind: "cohort" | "campaign";
  key: string;
  title: string;
  subtitle: string;
  automationId: string | null;
  date: string | null;
  isTest: boolean;
  size: number;
  sent: number;
  opened: number;
  clicked: number;
  wonBack: number | null;
  unsubscribed: number;
  noAction: number;
  skipped: number;
  failed: number;
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
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [automations, setAutomations] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const [cohortRes, campaignRes] = await Promise.all([
        fetch("/api/automations/cohorts", { headers }),
        fetch("/api/email/campaign-results", { headers }),
      ]);
      const cohortJson = await cohortRes.json();
      const campaignJson = await campaignRes.json();
      if (!cohortRes.ok) {
        setError(cohortJson?.error ?? `Failed (${cohortRes.status})`);
        return;
      }

      const cohortRows: ResultRow[] = (((cohortJson.cohorts as Cohort[]) ?? [])).map((c) => ({
        kind: "cohort",
        key: `cohort:${c.key}`,
        title: c.label,
        subtitle: c.automationName,
        automationId: c.automationId,
        date: c.firstReleasedAt,
        isTest: c.isTest,
        size: c.size,
        sent: c.sent,
        opened: c.opened,
        clicked: c.clicked,
        wonBack: c.wonBack,
        unsubscribed: c.unsubscribed,
        noAction: c.noAction,
        skipped: 0,
        failed: 0,
      }));

      const campaignRows: ResultRow[] = campaignRes.ok
        ? (((campaignJson.campaigns as Campaign[]) ?? [])).map((c) => ({
            kind: "campaign",
            key: `campaign:${c.key}`,
            title: c.name,
            subtitle: c.subject || "Campaign blast",
            automationId: null,
            date: c.date,
            isTest: c.isTest,
            size: c.size,
            sent: c.sent,
            opened: c.opened,
            clicked: c.clicked,
            wonBack: null,
            unsubscribed: c.unsubscribed,
            noAction: c.noAction,
            skipped: c.skipped,
            failed: c.failed,
          }))
        : [];

      setRows(
        [...cohortRows, ...campaignRows].sort((a, b) =>
          (b.date ?? "").localeCompare(a.date ?? ""),
        ),
      );
      setAutomations((cohortJson.automations as { id: string; name: string }[]) ?? []);
      setTruncated(!!cohortJson.truncated);
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

  /* Test sends are hidden by default: their mail went to a tester, so their
     numbers say nothing about the campaign and would poison the rates. */
  const [showTests, setShowTests] = useState(false);

  const shown = useMemo(
    () =>
      rows
        .filter((r) => {
          if (filter === "all") return true;
          if (filter === "campaigns") return r.kind === "campaign";
          if (filter === "cohorts") return r.kind === "cohort";
          return r.automationId === filter;
        })
        .filter((r) => showTests || !r.isTest),
    [rows, filter, showTests],
  );

  const testCount = useMemo(() => rows.filter((r) => r.isTest).length, [rows]);
  const hasCampaigns = useMemo(() => rows.some((r) => r.kind === "campaign"), [rows]);

  /* Totals across the visible set. Win-backs only exist for automation
     batches, so that rate uses the cohort rows' audience as its denominator. */
  const totals = useMemo(() => {
    const t = { size: 0, opened: 0, clicked: 0, noAction: 0, wonBack: 0, cohortSize: 0 };
    for (const r of shown) {
      t.size += r.size;
      t.opened += r.opened;
      t.clicked += r.clicked;
      t.noAction += r.noAction;
      if (r.kind === "cohort") {
        t.wonBack += r.wonBack ?? 0;
        t.cohortSize += r.size;
      }
    }
    return t;
  }, [shown]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-4">
      <Link
        href="/automations"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition hover:text-brand-700"
      >
        <ArrowLeft size={12} /> Automations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Campaign results</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Every campaign blast and automation batch, and what came of it. Each
            customer counts once, in their most-committed outcome.
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
              Show {testCount} test send{testCount === 1 ? "" : "s"}
            </label>
          )}
          {(hasCampaigns || automations.length > 0) && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-secondary focus:border-brand-400 focus:outline-none"
            >
              <option value="all">All results</option>
              {hasCampaigns && <option value="campaigns">Campaign blasts</option>}
              {automations.length > 0 && <option value="cohorts">All automation batches</option>}
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
            value={totals.cohortSize > 0 ? `${pct(totals.wonBack, totals.cohortSize)}%` : "—"}
            detail={
              totals.cohortSize > 0
                ? `${totals.wonBack} ordered (automations)`
                : "automation batches only"
            }
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
          <Loader2 size={13} className="animate-spin" /> Loading results…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-14 text-center shadow-card">
          <Layers size={22} className="mx-auto mb-2 text-ink-subtle" />
          <p className="text-xs font-medium text-ink">No sends to report yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] text-ink-muted">
            Send a designed-template campaign from the customer lists, or release
            an automation batch — results land here.
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
              <table className="w-full min-w-[920px] text-[11px]">
                <thead>
                  <tr className="border-b border-line bg-surface-muted text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    <th className="px-3 py-2">Send</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Reached</th>
                    <th className="px-3 py-2 text-right">Opened</th>
                    <th className="px-3 py-2 text-right">Clicked</th>
                    <th className="px-3 py-2 text-right">Won back</th>
                    <th className="px-3 py-2 text-right">No action</th>
                    <th className="px-3 py-2 text-right">Unsub</th>
                    <th className="px-3 py-2">Mix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((r) => (
                    <tr
                      key={r.key}
                      className={clsx(
                        "transition-colors hover:bg-surface-muted",
                        r.isTest && "bg-warning-soft/40",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <KindChip kind={r.kind} />
                          <span className="font-medium text-ink">{r.title}</span>
                          {r.isTest && (
                            <span className="shrink-0 rounded bg-warning-soft px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                              Test
                            </span>
                          )}
                        </div>
                        <div className="truncate max-w-[260px] text-[10px] text-ink-subtle">
                          {r.subtitle}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{shortDate(r.date)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums text-ink"
                        title={
                          r.kind === "campaign"
                            ? `${r.sent} delivered · ${r.skipped} skipped · ${r.failed} failed`
                            : `${r.size} customers · ${r.sent} emails sent`
                        }
                      >
                        {r.size}
                        {r.kind === "campaign" && r.skipped + r.failed > 0 && (
                          <span className="ml-1 text-[10px] text-ink-subtle">
                            (+{r.skipped + r.failed})
                          </span>
                        )}
                      </td>
                      <RateCell n={r.opened} of={r.size} />
                      <RateCell n={r.clicked} of={r.size} />
                      {r.wonBack == null ? (
                        <td className="px-3 py-2 text-right text-ink-subtle">—</td>
                      ) : (
                        <RateCell n={r.wonBack} of={r.size} strong />
                      )}
                      <RateCell n={r.noAction} of={r.size} muted />
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                        {r.unsubscribed}
                      </td>
                      <td className="px-3 py-2">
                        <MixBar row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.key} className="rounded-xl border border-line bg-surface p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <KindChip kind={r.kind} />
                      <span className="truncate text-xs font-medium text-ink">{r.title}</span>
                      {r.isTest && (
                        <span className="shrink-0 rounded bg-warning-soft px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                          Test
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-ink-subtle">
                      {r.subtitle} · {shortDate(r.date)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                    {r.size}
                  </span>
                </div>

                <div className="mt-2">
                  <MixBar row={r} />
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Open" value={`${pct(r.opened, r.size)}%`} />
                  <MiniStat label="Click" value={`${pct(r.clicked, r.size)}%`} />
                  <MiniStat
                    label="Won"
                    value={r.wonBack == null ? "—" : `${pct(r.wonBack, r.size)}%`}
                    strong
                  />
                  <MiniStat label="None" value={`${pct(r.noAction, r.size)}%`} muted />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {shown.length > 0 && (
        <p className="text-[10px] text-ink-subtle">
          Open rate depends on tracking pixels, which Gmail and Apple Mail
          prefetch and many gateways block — treat it as noisy. Clicks come from
          real link redirects, so they&apos;re the number to judge a send on.
          Win-backs (ordered since the send) are tracked for automation batches
          only. Replies aren&apos;t tracked: mail is outbound-only, so customers
          reply straight to the rep&apos;s own mailbox.
        </p>
      )}
    </div>
  );
}

/* ─── Pieces ─── */

function KindChip({ kind }: { kind: "cohort" | "campaign" }) {
  return kind === "campaign" ? (
    <span className="shrink-0 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-700">
      Campaign
    </span>
  ) : (
    <span className="shrink-0 rounded bg-surface-sunken px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
      Automation
    </span>
  );
}

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
function MixBar({ row }: { row: ResultRow }) {
  const total = Math.max(row.size, 1);
  const segments = [
    { n: row.wonBack ?? 0, cls: "bg-positive", title: "Won back" },
    { n: row.clicked, cls: "bg-brand-500", title: "Clicked" },
    { n: row.noAction, cls: "bg-line-strong", title: "No action" },
    { n: row.unsubscribed, cls: "bg-critical", title: "Unsubscribed" },
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
