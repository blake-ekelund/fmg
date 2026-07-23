"use client";

import Link from "next/link";
import {
  Users,
  Contact,
  Package,
  Tag,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { DashboardAlert, AlertLever } from "./hooks/useDashboardAlerts";

/**
 * The founder's short list: at most five moves, ranked by dollars at stake.
 *
 * The cap is the point. A complete list of everything wrong is what the old
 * dashboard already was — the value here is that something got left off, so
 * what remains is worth doing today.
 */
const MAX_MOVES = 5;

const LEVER_META: Record<
  AlertLever,
  { icon: LucideIcon; label: string; tone: string; verb: string }
> = {
  account: {
    icon: Users,
    label: "Account",
    tone: "bg-orange-50 text-orange-700 ring-orange-200",
    verb: "Reach out",
  },
  rep: {
    icon: Contact,
    label: "Rep",
    tone: "bg-rose-50 text-rose-700 ring-rose-200",
    verb: "Check in",
  },
  sku: {
    icon: Package,
    label: "Stock",
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
    verb: "Reorder",
  },
  promo: {
    icon: Tag,
    label: "Promo",
    tone: "bg-violet-50 text-violet-700 ring-violet-200",
    verb: "Promote",
  },
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

type Props = {
  alerts: DashboardAlert[];
  totalAtStake: number;
  overdueTaskCount: number;
  loading: boolean;
};

export default function TodaysMoves({
  alerts,
  totalAtStake,
  overdueTaskCount,
  loading,
}: Props) {
  if (loading) {
    return <div className="h-64 rounded-xl bg-gray-50 animate-pulse" />;
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
        <CheckCircle2 size={17} className="shrink-0 text-emerald-500" />
        <span className="text-sm font-medium text-emerald-800">
          Nothing needs you today — no lapsing accounts, sliding territories, or
          stock risk.
        </span>
        {overdueTaskCount > 0 && (
          <Link
            href="/task-list"
            className="ml-auto text-sm font-medium text-emerald-700 underline underline-offset-2"
          >
            {overdueTaskCount} overdue task{overdueTaskCount > 1 ? "s" : ""}
          </Link>
        )}
      </div>
    );
  }

  const moves = alerts.slice(0, MAX_MOVES);
  const remaining = alerts.length - moves.length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-gray-900">Do today</h2>
        <span className="text-sm text-gray-500">
          {moves.length} move{moves.length > 1 ? "s" : ""} ·{" "}
          {fmtCompact(totalAtStake)} at stake
        </span>
        {overdueTaskCount > 0 && (
          <Link
            href="/task-list"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <Clock size={13} />
            {overdueTaskCount} overdue task{overdueTaskCount > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      <ol className="space-y-2">
        {moves.map((a, i) => {
          const meta = LEVER_META[a.lever];
          const Icon = meta.icon;
          return (
            <li key={a.id}>
              <Link
                href={a.href}
                className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 transition-all hover:border-gray-300 hover:shadow-sm sm:gap-4"
              >
                <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-gray-300">
                  {i + 1}
                </span>

                <span
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                    meta.tone
                  )}
                >
                  <Icon size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {meta.verb}: {a.title}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {a.subtitle}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                    {fmtCompact(a.impact)}
                  </div>
                  <div className="hidden text-[11px] text-gray-400 sm:block">
                    {a.basis}
                  </div>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
                  {a.actionLabel}
                  <ArrowRight size={13} />
                </span>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-gray-300 sm:hidden"
                />
              </Link>
            </li>
          );
        })}
      </ol>

      {remaining > 0 && (
        <p className="mt-2 px-1 text-xs text-gray-400">
          {remaining} smaller item{remaining > 1 ? "s" : ""} not shown — these
          are the five worth your morning.
        </p>
      )}
    </section>
  );
}
