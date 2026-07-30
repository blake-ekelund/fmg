"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { MailX, MailMinus, AlertOctagon, Search, ShieldOff, Link2Off } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

/* One row of /api/email/suppressions — a person we must not email again. */
type Suppression = {
  email: string;
  source: string; // link | manual | bounce | complaint
  reason: string | null;
  created_at: string;
  customer_type: string | null;
  customer_ref: string | null;
  customer_name: string | null;
  /** The customer record now carries a DIFFERENT address than the suppressed
      one (fixed in Fishbowl) — sends to the new address work normally. */
  address_changed?: boolean;
};

const SOURCE_META: Record<string, { label: string; chip: string; bar: string }> = {
  link: { label: "Unsubscribed", chip: "bg-indigo-50 text-indigo-700", bar: "#6366f1" },
  manual: { label: "Manual", chip: "bg-gray-100 text-gray-600", bar: "#94a3b8" },
  bounce: { label: "Bounced", chip: "bg-rose-50 text-rose-700", bar: "#f43f5e" },
  complaint: { label: "Complained", chip: "bg-amber-50 text-amber-700", bar: "#f59e0b" },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <div className="font-semibold text-gray-800 mb-1.5">{label}</div>
      {payload.filter((e) => e.value > 0).map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function KPI({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${color}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
        <div className="text-xl font-bold tabular-nums text-gray-900">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

type Filter = "all" | "bounce" | "link" | "complaint";

export default function DeliverabilityPage() {
  const [rows, setRows] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/email/suppressions", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
        if (!cancelled) setRows((json.suppressions as Suppression[]) ?? []);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { total: rows.length, link: 0, bounce: 0, complaint: 0, manual: 0 };
    for (const r of rows) {
      if (r.source === "link") c.link++;
      else if (r.source === "bounce") c.bounce++;
      else if (r.source === "complaint") c.complaint++;
      else c.manual++;
    }
    return c;
  }, [rows]);

  /* Last 30 days, stacked by source. */
  const chartData = useMemo(() => {
    const days: Record<string, { day: string; link: number; bounce: number; complaint: number; manual: number }> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = {
        day: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        link: 0, bounce: 0, complaint: 0, manual: 0,
      };
    }
    for (const r of rows) {
      const key = r.created_at.slice(0, 10);
      const bucket = days[key];
      if (!bucket) continue;
      if (r.source === "link") bucket.link++;
      else if (r.source === "bounce") bucket.bounce++;
      else if (r.source === "complaint") bucket.complaint++;
      else bucket.manual++;
    }
    return Object.values(days);
  }, [rows]);

  /* Why people leave — reason counts among link unsubscribes. */
  const reasons = useMemo(() => {
    const tally = new Map<string, number>();
    let withReason = 0;
    for (const r of rows) {
      if (r.source !== "link") continue;
      const reason = r.reason?.trim();
      if (!reason) continue;
      withReason++;
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    }
    return {
      withReason,
      noReason: counts.link - withReason,
      items: [...tally.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows, counts.link]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.source !== filter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.customer_name ?? "").toLowerCase().includes(q) ||
        (r.reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-64 flex items-center justify-center text-sm text-gray-400 rounded-2xl border border-gray-200 bg-white">
          Loading suppression list…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Deliverability</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everyone the system will no longer email — who opted out, whose address bounced,
          who marked us as spam, and why. Bounces and complaints flow in automatically from Resend.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* ─── KPI row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={<ShieldOff size={18} className="text-gray-500" />} label="Total Suppressed" value={counts.total} color="bg-gray-50 border-gray-200" />
        <KPI icon={<Link2Off size={18} className="text-indigo-500" />} label="Unsubscribed" value={counts.link + counts.manual} color="bg-indigo-50 border-indigo-200" />
        <KPI icon={<MailX size={18} className="text-rose-500" />} label="Bounced" value={counts.bounce} color="bg-rose-50 border-rose-200" />
        <KPI icon={<AlertOctagon size={18} className="text-amber-500" />} label="Spam Complaints" value={counts.complaint} color="bg-amber-50 border-amber-200" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ─── Suppressions over time ─── */}
        <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">Last 30 Days</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={35} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="link" name="Unsubscribed" stackId="s" fill={SOURCE_META.link.bar} maxBarSize={18} />
              <Bar dataKey="bounce" name="Bounced" stackId="s" fill={SOURCE_META.bounce.bar} maxBarSize={18} />
              <Bar dataKey="complaint" name="Complained" stackId="s" fill={SOURCE_META.complaint.bar} radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ─── Why people unsubscribe ─── */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-700 mb-1">Why People Unsubscribe</div>
          <div className="text-[11px] text-gray-400 mb-3">
            {reasons.withReason} of {counts.link} gave a reason
          </div>
          {reasons.items.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">No reasons collected yet.</div>
          ) : (
            <ul className="space-y-2.5">
              {reasons.items.map(([reason, n]) => {
                const pct = reasons.withReason > 0 ? Math.round((n / reasons.withReason) * 100) : 0;
                return (
                  <li key={reason}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-gray-700 min-w-0 truncate" title={reason}>{reason}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-gray-800">{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
              {reasons.noReason > 0 && (
                <li className="pt-1 text-[11px] text-gray-400">
                  + {reasons.noReason} unsubscribed without giving a reason
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Suppressed customers table ─── */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            {([
              ["all", `All (${counts.total})`],
              ["bounce", `Bounced (${counts.bounce})`],
              ["link", `Unsubscribed (${counts.link})`],
              ["complaint", `Complained (${counts.complaint})`],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={clsx(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  filter === key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, reason…"
              className="w-64 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/70 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-left px-4 py-2.5 font-medium">Email</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Reason / Detail</th>
                <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {rows.length === 0 ? "Nobody is suppressed yet." : "No matches for this filter."}
                  </td>
                </tr>
              ) : (
                visible.map((r, i) => {
                  const meta = SOURCE_META[r.source] ?? SOURCE_META.manual;
                  return (
                    <tr key={`${r.email}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-2.5">
                        {r.customer_name ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-gray-800 truncate">{r.customer_name}</span>
                            {r.customer_type && (
                              <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                                {r.customer_type === "wholesale" ? "WS" : "D2C"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">Unknown</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.email}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.chip)}>
                            {meta.label}
                          </span>
                          {r.address_changed && (
                            <span
                              className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                              title="The customer record now carries a different address than this one — emails to the new address send normally."
                            >
                              New email on file
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[320px]">
                        <span className="line-clamp-2">{r.reason || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400 whitespace-nowrap tabular-nums">
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filter === "bounce" && counts.bounce > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-1.5">
            <MailMinus size={12} />
            These addresses hard-bounced — the mailbox no longer exists. Fix the address on the
            customer record (Fishbowl) to start reaching them again; the suppression matches by address, not customer.
          </div>
        )}
      </div>
    </div>
  );
}
