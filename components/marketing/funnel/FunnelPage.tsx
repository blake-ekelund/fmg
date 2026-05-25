"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Users,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  UserMinus,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type FunnelStats = {
  active: number;
  atRisk: number;
  churned: number;
  noOrders: number;
  total: number;
};

const EMPTY: FunnelStats = { active: 0, atRisk: 0, churned: 0, noOrders: 0, total: 0 };

async function loadStats(
  view: "customer_summary" | "d2c_customer_summary",
): Promise<FunnelStats> {
  // We pull last_order_date for every row in the view (paginating past the
  // 1000-row default) and bucket client-side. The dataset is bounded by
  // total customer count so this is fine for our scale.
  const stats: FunnelStats = { ...EMPTY };
  const now = new Date();
  const activeCutoff = new Date(now);
  activeCutoff.setDate(now.getDate() - 180);
  const riskCutoff = new Date(now);
  riskCutoff.setDate(now.getDate() - 365);

  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(view)
      .select("last_order_date")
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      stats.total++;
      const d = (row as { last_order_date: string | null }).last_order_date;
      if (!d) {
        stats.noOrders++;
        continue;
      }
      const ts = new Date(d);
      if (ts >= activeCutoff) stats.active++;
      else if (ts >= riskCutoff) stats.atRisk++;
      else stats.churned++;
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return stats;
}

export default function FunnelPage() {
  const [d2c, setD2c] = useState<FunnelStats>(EMPTY);
  const [wholesale, setWholesale] = useState<FunnelStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [d, w] = await Promise.all([
      loadStats("d2c_customer_summary"),
      loadStats("customer_summary"),
    ]);
    setD2c(d);
    setWholesale(w);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customer Funnel</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Where your customers sit today. Active = ordered in the last 180 days ·
          At Risk = 180–365 days · Churned = 365+ days.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FunnelCard
            title="D2C"
            icon={<ShoppingBag size={16} />}
            stats={d2c}
            listHref="/customers/d2c"
          />
          <FunnelCard
            title="Wholesale"
            icon={<Users size={16} />}
            stats={wholesale}
            listHref="/customers"
          />
        </div>
      )}
    </div>
  );
}

function FunnelCard({
  title,
  icon,
  stats,
  listHref,
}: {
  title: string;
  icon: React.ReactNode;
  stats: FunnelStats;
  listHref: string;
}) {
  // The funnel narrows visually from active -> at risk -> churned. We don't
  // include "no orders" in the funnel bars (it's not a downstream stage), but
  // surface the count as a stat below.
  const stages = [
    {
      key: "active",
      label: "Active",
      count: stats.active,
      color: "green",
      icon: <TrendingUp size={12} />,
      href: `${listHref}?status=active`,
    },
    {
      key: "atRisk",
      label: "At Risk",
      count: stats.atRisk,
      color: "amber",
      icon: <AlertTriangle size={12} />,
      href: `${listHref}?status=at_risk`,
    },
    {
      key: "churned",
      label: "Churned",
      count: stats.churned,
      color: "gray",
      icon: <UserMinus size={12} />,
      href: `${listHref}?status=churned`,
    },
  ] as const;

  // Bars are widthed against the largest stage (usually active) so the visual
  // funnel narrows from the top.
  const max = Math.max(stats.active, stats.atRisk, stats.churned, 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            <div className="text-[11px] text-gray-500">
              {stats.total.toLocaleString()} total customer
              {stats.total === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <Link
          href={listHref}
          className="text-[11px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 transition"
        >
          Open list <ArrowRight size={11} />
        </Link>
      </div>

      <div className="px-5 py-5 space-y-3">
        {stages.map((s) => {
          const pct = stats.total > 0 ? (s.count / stats.total) * 100 : 0;
          const barWidth = (s.count / max) * 100;
          return (
            <Link
              key={s.key}
              href={s.href}
              className="block rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-xs font-medium",
                    s.color === "green" && "text-green-700",
                    s.color === "amber" && "text-amber-700",
                    s.color === "gray" && "text-gray-500",
                  )}
                >
                  {s.icon}
                  {s.label}
                </span>
                <span className="text-xs text-gray-700 tabular-nums">
                  <span className="font-semibold text-gray-900">
                    {s.count.toLocaleString()}
                  </span>{" "}
                  <span className="text-gray-400">·</span>{" "}
                  <span className="text-gray-500">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-500",
                    s.color === "green" && "bg-green-500",
                    s.color === "amber" && "bg-amber-500",
                    s.color === "gray" && "bg-gray-400",
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </Link>
          );
        })}

        {stats.noOrders > 0 && (
          <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
            Plus{" "}
            <span className="font-medium text-gray-700">
              {stats.noOrders.toLocaleString()}
            </span>{" "}
            customer{stats.noOrders === 1 ? "" : "s"} with no orders yet.
          </div>
        )}
      </div>
    </div>
  );
}
