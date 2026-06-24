"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  DollarSign,
  Eye,
  Loader2,
  MousePointerClick,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useBrand } from "@/components/BrandContext";

// ---- API shape (mirrors /api/storefront-analytics) ----
type Totals = {
  pageviews: number;
  uniqueVisitors: number;
  sessions: number;
  clicks: number;
  engaged: number;
  avgDwellMs: number;
  engagedRate: number;
};
type Ranked = { key: string; label: string | null; count: number };
type Summary = {
  notReady?: boolean;
  error?: string;
  range?: { days: number; since: string };
  capped?: boolean;
  checkouts?: { total: number; revenue: number };
  abandoned?: { total: number; revenue: number };
  totals?: Totals;
  byDay?: { date: string; pageviews: number; visitors: number; checkouts: number }[];
  topPages?: Ranked[];
  topButtons?: Ranked[];
  devices?: { key: string; count: number }[];
  topReferrers?: Ranked[];
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtDay(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Web analytics for the storefronts. Reads first-party events the storefronts
 * beacon into the wholesale project (see each storefront's /api/track). Until
 * supabase/analytics.sql is run there, the API reports notReady and this page
 * shows an honest "not collecting yet" state.
 */
export default function AnalyticsPage() {
  const { brand } = useBrand();
  // Brand toggle (top-right) → storefront filter. "all" = both stores.
  const store = brand === "Sassy" ? "sassy" : brand === "NI" ? "ni" : null;

  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (windowDays: number, storeFilter: string | null) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ days: String(windowDays) });
        if (storeFilter) qs.set("store", storeFilter);
        const res = await fetch(`/api/storefront-analytics?${qs}`, {
          headers: await authHeader(),
        });
        const json: Summary = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Failed (${res.status})`);
          setData(null);
          return;
        }
        setError(null);
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    reload(days, store);
  }, [days, store, reload]);

  const totals = data?.totals;
  const checkouts = data?.checkouts;
  const abandoned = data?.abandoned;
  const notReady = !!data?.notReady;
  const convRate =
    totals && checkouts && totals.uniqueVisitors > 0
      ? `${((checkouts.total / totals.uniqueVisitors) * 100).toFixed(1)}%`
      : "—";

  const kpis = useMemo(
    () => [
      { label: "Unique visitors", Icon: Activity, value: totals ? fmtNum(totals.uniqueVisitors) : "—" },
      { label: "Pageviews", Icon: Eye, value: totals ? fmtNum(totals.pageviews) : "—" },
      { label: "Avg. time on page", Icon: Timer, value: totals ? fmtDuration(totals.avgDwellMs) : "—" },
      { label: "Button clicks", Icon: MousePointerClick, value: totals ? fmtNum(totals.clicks) : "—" },
    ],
    [totals],
  );

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          First-party traffic &amp; engagement for the storefronts.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === w.days
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {notReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Not collecting yet.</span> The events
          table doesn&apos;t exist on the wholesale project. Run{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-[12px]">
            sassy/supabase/analytics.sql
          </code>{" "}
          in that Supabase project&apos;s SQL editor and the storefront will
          start filling this in within seconds.
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, Icon, value }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              <Icon size={12} />
              {label}
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                totals ? "text-gray-900" : "text-gray-300"
              }`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Conversions — checkouts/revenue from orders; abandoned carts needs
          a checkout-start signal the storefront doesn't emit yet. */}
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
          Conversions
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Completed checkouts"
            Icon={ShoppingCart}
            value={checkouts ? fmtNum(checkouts.total) : "—"}
            active={!!checkouts}
          />
          <StatCard
            label="Revenue"
            Icon={DollarSign}
            value={checkouts ? fmtMoney(checkouts.revenue) : "—"}
            active={!!checkouts}
          />
          <StatCard
            label="Conversion rate"
            Icon={Percent}
            value={convRate}
            active={convRate !== "—"}
          />
          <StatCard
            label="Abandoned carts"
            Icon={ShoppingBag}
            value={abandoned ? fmtNum(abandoned.total) : "—"}
            active={!!abandoned}
            hint={
              abandoned && abandoned.revenue > 0
                ? `${fmtMoney(abandoned.revenue)} recoverable`
                : undefined
            }
          />
        </div>
      </div>

      {/* Traffic chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 text-sm font-medium text-gray-700">
          Traffic over time
        </div>
        {data?.byDay && data.byDay.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.byDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="uv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
                labelFormatter={(d) => `${fmtDay(String(d))}`}
              />
              <Area
                type="monotone"
                dataKey="pageviews"
                name="Pageviews"
                stroke="#ec4899"
                strokeWidth={2}
                fill="url(#pv)"
              />
              <Area
                type="monotone"
                dataKey="visitors"
                name="Visitors"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#uv)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-16 text-center text-sm text-gray-300">
            awaiting data
          </div>
        )}
      </div>

      {/* Top pages + top buttons */}
      <div className="grid gap-3 md:grid-cols-2">
        <RankCard
          title="Top pages"
          unit="views"
          rows={data?.topPages}
          renderKey={(r) => r.key}
        />
        <RankCard
          title="Top buttons"
          unit="clicks"
          rows={data?.topButtons}
          renderKey={(r) => r.label || r.key}
          renderSub={(r) => (r.label ? r.key : null)}
        />
      </div>

      {/* Devices + referrers */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-medium text-gray-700">Devices</div>
          {data?.devices && data.devices.length ? (
            <div className="space-y-2">
              {data.devices.map((d) => (
                <div
                  key={d.key}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="capitalize text-gray-600">{d.key}</span>
                  <span className="tabular-nums text-gray-900">
                    {fmtNum(d.count)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-gray-300">
              awaiting data
            </div>
          )}
        </div>
        <RankCard
          title="Top referrers"
          unit="views"
          rows={data?.topReferrers}
          renderKey={(r) => r.key}
          emptyHint="direct / none yet"
        />
      </div>

      <p className="text-[11px] text-gray-400">
        First-party &amp; cookieless — anonymous visitor ids, no PII, Do-Not-Track
        respected. Currently live on Sassy; Natural Inspirations lights up here
        once it adopts the same tracker.
      </p>
    </div>
  );
}

function StatCard({
  label,
  Icon,
  value,
  hint,
  active = true,
}: {
  label: string;
  Icon: LucideIcon;
  value: string;
  hint?: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
        <Icon size={12} />
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          active ? "text-gray-900" : "text-gray-300"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
}

function RankCard({
  title,
  unit,
  rows,
  renderKey,
  renderSub,
  emptyHint = "awaiting data",
}: {
  title: string;
  unit: string;
  rows?: Ranked[];
  renderKey: (r: Ranked) => string;
  renderSub?: (r: Ranked) => string | null;
  emptyHint?: string;
}) {
  const max = rows?.length ? Math.max(...rows.map((r) => r.count)) : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {unit}
        </span>
      </div>
      {rows && rows.length ? (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={`${r.key}-${i}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-gray-700" title={renderKey(r)}>
                  {renderKey(r)}
                </span>
                <span className="shrink-0 tabular-nums text-gray-900">
                  {fmtNum(r.count)}
                </span>
              </div>
              {renderSub?.(r) ? (
                <div className="truncate text-[11px] text-gray-400" title={renderSub(r) ?? ""}>
                  {renderSub(r)}
                </div>
              ) : null}
              <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-pink-400"
                  style={{ width: `${max ? (r.count / max) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-gray-300">{emptyHint}</div>
      )}
    </div>
  );
}
