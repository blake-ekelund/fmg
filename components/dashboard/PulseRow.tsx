"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import clsx from "clsx";
import type { KPIs } from "./hooks/useDashboardSales";
import type { MonthlyPace } from "./hooks/useMonthlySales";
import type { CustomerKPIs } from "./hooks/useDashboardCustomers";
import type { InventoryKPIs } from "./hooks/useDashboardInventory";

/**
 * The pulse check: four vital signs, each a single number with its direction
 * and one line of context. Deliberately not charts — the question this answers
 * is "is the business okay right now", which is a glance, not a study.
 */

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function pct(cur: number, prior: number): number | null {
  if (!prior) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

/** Good/bad is caller-supplied: falling at-risk counts are good, falling sales aren't. */
type Tone = "good" | "bad" | "flat";

function toneFor(delta: number | null, higherIsBetter: boolean): Tone {
  if (delta == null || Math.abs(delta) < 0.5) return "flat";
  const positive = delta > 0;
  return positive === higherIsBetter ? "good" : "bad";
}

function Tile({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  higherIsBetter = true,
  href,
  loading,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
  deltaLabel?: string;
  higherIsBetter?: boolean;
  href: string;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-[104px] rounded-xl bg-gray-50 animate-pulse" />;
  }

  const tone = toneFor(delta ?? null, higherIsBetter);
  const Arrow =
    tone === "flat" ? Minus : (delta ?? 0) > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white px-4 py-3.5 transition-colors hover:border-gray-300 hover:bg-gray-50/60"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-gray-900">
          {value}
        </span>
        {deltaLabel && (
          <span
            className={clsx(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              tone === "good" && "text-emerald-600",
              tone === "bad" && "text-rose-600",
              tone === "flat" && "text-gray-400"
            )}
          >
            <Arrow size={13} />
            {deltaLabel}
          </span>
        )}
      </div>
      <div className="mt-1 truncate text-xs text-gray-500">{sub}</div>
    </Link>
  );
}

type Props = {
  sales: KPIs;
  pace: MonthlyPace;
  custKpis: CustomerKPIs;
  invKpis: InventoryKPIs;
  loading: boolean;
};

export default function PulseRow({
  sales,
  pace,
  custKpis,
  invKpis,
  loading,
}: Props) {
  const salesPct = pct(sales.total_ytd_2026, sales.total_ytd_2025);
  const wsPct = pct(sales.wholesale_ytd_2026, sales.wholesale_ytd_2025);
  const d2cPct = pct(sales.d2c_ytd_2026, sales.d2c_ytd_2025);

  /* At-risk share of the book — a count alone doesn't say whether 12 is a lot. */
  const custBase = custKpis.active + custKpis.at_risk;
  const atRiskShare = custBase > 0 ? (custKpis.at_risk / custBase) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Sales YTD"
        value={fmtMoney(sales.total_ytd_2026)}
        sub={
          sales.ytd_label
            ? `${sales.ytd_label} · ${fmtMoney(sales.total_ytd_2025)} last year`
            : `${fmtMoney(sales.total_ytd_2025)} last year`
        }
        delta={salesPct}
        deltaLabel={salesPct != null ? `${Math.abs(salesPct).toFixed(0)}%` : undefined}
        href="/sales"
        loading={loading}
      />

      <Tile
        label="This month"
        value={fmtMoney(pace.mtdRevenue)}
        sub={
          pace.daysInMonth
            ? `Day ${pace.elapsedDays}/${pace.daysInMonth} · on pace for ${fmtMoney(
                pace.paceRevenue
              )}`
            : "No completed days yet"
        }
        href="/sales"
        loading={loading}
      />

      <Tile
        label="Customers"
        value={custKpis.active.toLocaleString()}
        sub={`${custKpis.at_risk} at risk (${atRiskShare.toFixed(
          0
        )}%) · ${custKpis.new_customers} new this year`}
        delta={custKpis.at_risk > 0 ? -atRiskShare : 0}
        deltaLabel={custKpis.at_risk > 0 ? `${custKpis.at_risk} lapsing` : undefined}
        higherIsBetter={false}
        href="/customers"
        loading={loading}
      />

      <Tile
        label="Inventory"
        value={`${invKpis.at_risk}`}
        sub={`SKUs under 1.5mo cover · ${invKpis.review} to watch · ${invKpis.total_skus} tracked`}
        delta={invKpis.at_risk > 0 ? -invKpis.at_risk : 0}
        deltaLabel={invKpis.at_risk > 0 ? "need reorder" : "all covered"}
        higherIsBetter={false}
        href="/inventory"
        loading={loading}
      />

      {/* Channel split — sits under the tiles as one compact line rather than
          stealing a whole tile from the four headline signs. */}
      {!loading && (
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-xs text-gray-500">
          <span>
            Wholesale{" "}
            <span className="font-medium text-gray-700">
              {fmtMoney(sales.wholesale_ytd_2026)}
            </span>
            {wsPct != null && (
              <span
                className={clsx(
                  "ml-1 font-medium",
                  wsPct >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {wsPct >= 0 ? "+" : ""}
                {wsPct.toFixed(0)}%
              </span>
            )}
          </span>
          <span>
            D2C{" "}
            <span className="font-medium text-gray-700">
              {fmtMoney(sales.d2c_ytd_2026)}
            </span>
            {d2cPct != null && (
              <span
                className={clsx(
                  "ml-1 font-medium",
                  d2cPct >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {d2cPct >= 0 ? "+" : ""}
                {d2cPct.toFixed(0)}%
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
