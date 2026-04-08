"use client";

import { useState, useEffect } from "react";
import {
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  BarChart3,
  ArrowRight,
  ExternalLink,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  RefreshCw,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import clsx from "clsx";

type Period = "7d" | "30d" | "90d" | "ytd";

type AnalyticsData = {
  connected: boolean;
  period: string;
  date_range: { from: string; to: string };
  summary: {
    total_orders: number;
    total_revenue: number;
    avg_order_value: number;
    orders_change: number | null;
    revenue_change: number | null;
    aov_change: number | null;
  };
  fulfillment: { fulfilled: number; unfulfilled: number; partially_fulfilled: number };
  payments: { paid: number; pending: number; refunded: number; cancelled: number };
  abandoned_checkouts: {
    count: number;
    total_value: number;
    recovered_count: number;
    recovered_value: number;
    recovery_rate: number;
    carts: {
      id: string;
      email: string | null;
      total: number;
      items: number;
      item_names: string[];
      created_at: string;
      abandoned_url: string | null;
      recovery_sent: boolean;
    }[];
  };
  customers: {
    new_customers: number;
    new_customers_change: number | null;
    new_customer_orders: number;
    returning_orders: number;
    repeat_rate: number;
    top_customers: { email: string; name: string; spent: number; orders: number }[];
  };
  daily_revenue: { date: string; revenue: number; orders: number }[];
  top_products: { id: string; title: string; quantity: number; revenue: number; image: string | null }[];
  discount_codes: { code: string; uses: number; total_discount: number }[];
  traffic_sources: { source: string; orders: number }[];
  recent_orders: {
    id: string;
    name: string;
    total: number;
    financial_status: string;
    fulfillment_status: string;
    customer_name: string;
    customer_email: string | null;
    items: number;
    created_at: string;
    discount_codes: string[];
  }[];
};

function ChangeIndicator({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-[10px] text-gray-400">--</span>;
  const isUp = value > 0;
  const isFlat = Math.abs(value) < 0.5;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-[11px] font-medium",
        isFlat ? "text-gray-400" : isUp ? "text-green-600" : "text-red-500"
      )}
    >
      {isFlat ? <Minus size={10} /> : isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(2);
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "ytd", label: "Year to Date" },
];

export default function ShopifyAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shopify/analytics?period=${period}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || json.message || "Failed to load");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [period]);

  // Not connected state
  if (!loading && error === "Shopify not configured") {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shopify Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Live store performance from the Shopify Admin API</p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 bg-white/60">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
            <ShoppingBag size={28} className="text-violet-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Connect Your Shopify Store</h3>
          <p className="text-xs text-gray-400 max-w-md text-center mb-6">
            Connect your Shopify store to see live analytics including orders, revenue,
            abandoned carts, customer insights, and more.
          </p>

          {/* Connect button */}
          <a
            href="/api/shopify/auth"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#96bf48] text-white text-sm font-semibold hover:bg-[#7ba03b] transition shadow-md mb-8"
          >
            <ShoppingBag size={18} />
            Connect with Shopify
          </a>

          <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 max-w-lg w-full space-y-3">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">What You Need</h4>
            <div className="space-y-2">
              {[
                "A Shopify custom app with Admin API access (you already have \"FMG Dashboard\")",
                "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in your .env.local",
                "SHOPIFY_STORE_DOMAIN set to your store (e.g. www.naturalinspirations.com)",
                "Click \"Connect with Shopify\" above to authorize the app",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-gray-600">{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-violet-50 border border-violet-100">
              <h5 className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider mb-2">
                Required API Scopes
              </h5>
              <div className="grid grid-cols-2 gap-1">
                {[
                  "read_orders",
                  "read_checkouts",
                  "read_customers",
                  "read_products",
                  "read_price_rules",
                  "write_price_rules",
                  "read_discounts",
                  "write_discounts",
                  "read_analytics",
                  "read_reports",
                ].map((scope) => (
                  <div key={scope} className="flex items-center gap-1.5">
                    <CheckCircle2 size={10} className="text-violet-500" />
                    <code className="text-[10px] text-violet-800">{scope}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shopify Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live store performance from the Shopify Admin API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition",
                  period === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading Shopify data...</span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      ) : data ? (
        <>
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Revenue",
                value: fmt(data.summary.total_revenue),
                change: data.summary.revenue_change,
                icon: DollarSign,
                color: "green",
              },
              {
                label: "Orders",
                value: data.summary.total_orders.toLocaleString(),
                change: data.summary.orders_change,
                icon: ShoppingCart,
                color: "blue",
              },
              {
                label: "Avg Order Value",
                value: fmt(data.summary.avg_order_value),
                change: data.summary.aov_change,
                icon: BarChart3,
                color: "violet",
              },
              {
                label: "New Customers",
                value: data.customers.new_customers.toLocaleString(),
                change: data.customers.new_customers_change,
                icon: Users,
                color: "amber",
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={clsx(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      kpi.color === "green" ? "bg-green-100" :
                      kpi.color === "blue" ? "bg-blue-100" :
                      kpi.color === "violet" ? "bg-violet-100" :
                      "bg-amber-100"
                    )}
                  >
                    <kpi.icon
                      size={14}
                      className={clsx(
                        kpi.color === "green" ? "text-green-600" :
                        kpi.color === "blue" ? "text-blue-600" :
                        kpi.color === "violet" ? "text-violet-600" :
                        "text-amber-600"
                      )}
                    />
                  </div>
                  <ChangeIndicator value={kpi.change} />
                </div>
                <div className="text-lg font-semibold text-gray-900">{kpi.value}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* ─── Row: Revenue Chart + Abandoned Carts ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily Revenue chart (mini bar chart) */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Daily Revenue</h3>
              {data.daily_revenue.length > 0 ? (
                <div className="flex items-end gap-[2px] h-32">
                  {(() => {
                    const maxRev = Math.max(...data.daily_revenue.map((d) => d.revenue), 1);
                    return data.daily_revenue.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center group relative">
                        <div
                          className="w-full bg-violet-400 hover:bg-violet-500 rounded-t transition-all min-h-[2px]"
                          style={{ height: `${(d.revenue / maxRev) * 100}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                          {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          <br />
                          {fmt(d.revenue)} / {d.orders} orders
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-xs text-gray-400">
                  No revenue data for this period
                </div>
              )}
              <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                <span>{data.daily_revenue[0]?.date ? new Date(data.daily_revenue[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                <span>{data.daily_revenue[data.daily_revenue.length - 1]?.date ? new Date(data.daily_revenue[data.daily_revenue.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
              </div>
            </div>

            {/* Abandoned Carts summary */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Abandoned Carts</h3>
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <ShoppingCart size={14} className="text-red-500" />
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-semibold text-gray-900">{data.abandoned_checkouts.count}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Abandoned</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-red-50 rounded-lg p-2.5">
                    <div className="text-sm font-semibold text-red-700">{fmt(data.abandoned_checkouts.total_value)}</div>
                    <div className="text-[10px] text-red-500">Lost Revenue</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2.5">
                    <div className="text-sm font-semibold text-green-700">{fmt(data.abandoned_checkouts.recovered_value)}</div>
                    <div className="text-[10px] text-green-500">Recovered</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400">Recovery Rate</span>
                    <span className="text-xs font-medium text-gray-600">
                      {data.abandoned_checkouts.recovery_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full"
                      style={{ width: `${Math.min(100, data.abandoned_checkouts.recovery_rate)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Row: Fulfillment + Payments + Customer Breakdown ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fulfillment */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Fulfillment Status</h3>
              <div className="space-y-2">
                {[
                  { label: "Fulfilled", value: data.fulfillment.fulfilled, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
                  { label: "Unfulfilled", value: data.fulfillment.unfulfilled, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
                  { label: "Partial", value: data.fulfillment.partially_fulfilled, icon: Package, color: "text-blue-600", bg: "bg-blue-100" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                    <div className={clsx("w-7 h-7 rounded-md flex items-center justify-center", s.bg)}>
                      <s.icon size={12} className={s.color} />
                    </div>
                    <span className="flex-1 text-xs text-gray-600">{s.label}</span>
                    <span className="text-sm font-semibold text-gray-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payments */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Payment Status</h3>
              <div className="space-y-2">
                {[
                  { label: "Paid", value: data.payments.paid, color: "text-green-600", bg: "bg-green-100" },
                  { label: "Pending", value: data.payments.pending, color: "text-amber-600", bg: "bg-amber-100" },
                  { label: "Refunded", value: data.payments.refunded, color: "text-red-600", bg: "bg-red-100" },
                  { label: "Cancelled", value: data.payments.cancelled, color: "text-gray-600", bg: "bg-gray-100" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                    <div className={clsx("w-2 h-2 rounded-full", s.bg.replace("bg-", "bg-").replace("100", "400"))} />
                    <span className="flex-1 text-xs text-gray-600">{s.label}</span>
                    <span className="text-sm font-semibold text-gray-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Customer Breakdown</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-semibold text-blue-700">{data.customers.new_customer_orders}</div>
                    <div className="text-[10px] text-blue-500">New Customer Orders</div>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-semibold text-violet-700">{data.customers.returning_orders}</div>
                    <div className="text-[10px] text-violet-500">Returning Orders</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400">Repeat Purchase Rate</span>
                    <span className="text-xs font-medium text-gray-600">{data.customers.repeat_rate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-400 rounded-full"
                      style={{ width: `${Math.min(100, data.customers.repeat_rate)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Row: Top Products + Top Customers ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Products */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Products</h3>
              {data.top_products.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No product data</div>
              ) : (
                <div className="space-y-2">
                  {data.top_products.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition">
                      <span className="text-[10px] text-gray-400 w-4 text-right">{i + 1}.</span>
                      {p.image ? (
                        <img src={p.image} alt={p.title} className="w-8 h-8 rounded-md object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center">
                          <Package size={12} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{p.title}</div>
                        <div className="text-[10px] text-gray-400">{p.quantity} sold</div>
                      </div>
                      <div className="text-xs font-semibold text-gray-700">{fmt(p.revenue)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Customers */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Customers</h3>
              {data.customers.top_customers.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No customer data</div>
              ) : (
                <div className="space-y-2">
                  {data.customers.top_customers.map((c, i) => (
                    <div key={c.email} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition">
                      <span className="text-[10px] text-gray-400 w-4 text-right">{i + 1}.</span>
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-600">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{c.name}</div>
                        <div className="text-[10px] text-gray-400">{c.orders} orders</div>
                      </div>
                      <div className="text-xs font-semibold text-gray-700">{fmt(c.spent)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── Row: Abandoned Cart Details + Discount Codes + Traffic ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Abandoned Cart Details */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Abandoned Cart Details</h3>
                <span className="text-[10px] text-gray-400">
                  {data.abandoned_checkouts.carts.length} most recent
                </span>
              </div>
              {data.abandoned_checkouts.carts.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No abandoned carts</div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {data.abandoned_checkouts.carts.map((cart) => (
                    <div key={cart.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                        <ShoppingCart size={12} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700 truncate">
                            {cart.email || "No email"}
                          </span>
                          {cart.recovery_sent && (
                            <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium">
                              <Mail size={8} /> Sent
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {cart.item_names.join(", ")} ({cart.items} items)
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-gray-700">{fmt(cart.total)}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(cart.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      {cart.abandoned_url && (
                        <a
                          href={cart.abandoned_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition"
                          title="View in Shopify"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discount Codes + Traffic Sources */}
            <div className="space-y-4">
              {/* Discount Codes */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Discount Code Usage</h3>
                {data.discount_codes.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">No discounts used</div>
                ) : (
                  <div className="space-y-2">
                    {data.discount_codes.map((d) => (
                      <div key={d.code} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                        <Tag size={10} className="text-amber-500" />
                        <span className="font-mono text-[11px] text-gray-700 flex-1">{d.code}</span>
                        <span className="text-[10px] text-gray-400">{d.uses}x</span>
                        <span className="text-[11px] font-medium text-gray-600">{fmt(d.total_discount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Traffic Sources */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Traffic Sources</h3>
                {data.traffic_sources.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">No referral data</div>
                ) : (
                  <div className="space-y-2">
                    {data.traffic_sources.map((t) => (
                      <div key={t.source} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                        <Globe size={10} className="text-blue-500" />
                        <span className="text-[11px] text-gray-700 flex-1 truncate">{t.source}</span>
                        <span className="text-[11px] font-medium text-gray-600">{t.orders} orders</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Recent Orders ─── */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Orders</h3>
            {data.recent_orders.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No orders</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Order</th>
                      <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                      <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Fulfillment</th>
                      <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Total</th>
                      <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="py-2.5 px-2 font-medium text-gray-800">{o.name}</td>
                        <td className="py-2.5 px-2">
                          <div className="text-gray-700">{o.customer_name}</div>
                          {o.customer_email && (
                            <div className="text-[10px] text-gray-400">{o.customer_email}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={clsx(
                              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                              o.financial_status === "paid" ? "bg-green-100 text-green-700" :
                              o.financial_status === "pending" ? "bg-amber-100 text-amber-700" :
                              o.financial_status === "refunded" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            )}
                          >
                            {o.financial_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={clsx(
                              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                              o.fulfillment_status === "fulfilled" ? "bg-green-100 text-green-700" :
                              o.fulfillment_status === "partial" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-500"
                            )}
                          >
                            {o.fulfillment_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-gray-800">
                          {fmt(o.total)}
                          {o.discount_codes.length > 0 && (
                            <div className="text-[10px] text-amber-500 font-mono">{o.discount_codes[0]}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
