"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from "lucide-react";
import {
  portalGet,
  portalHref,
  usd,
  shortDate,
  customerStatus,
  type PortalCustomer,
} from "@/components/portal/api";
import ChannelIcon from "@/components/portal/ChannelIcon";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
  none: "No orders",
};
const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  churned: "bg-rose-50 text-rose-700",
  none: "bg-gray-100 text-gray-500",
};

type StatusFilter = "all" | "active" | "at_risk" | "churned" | "none";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At risk" },
  { value: "churned", label: "Churned" },
  { value: "none", label: "No orders" },
];

type SortKey =
  | "name"
  | "status"
  | "channel"
  | "state"
  | "last_order"
  | "sales_2024"
  | "sales_2025"
  | "sales_2026";
type SortDir = "asc" | "desc";

/**
 * Full year vs year-to-date.
 *
 * Full-year is the honest annual total but compares a partial 2026 against a
 * complete 2025, which makes every account look like it's shrinking. YTD lines
 * each year up to the same calendar date, which is the comparison a rep needs
 * when deciding who's actually behind.
 */
type SalesMode = "full" | "ytd";

type Year = 2024 | 2025 | 2026;

/** Ranked worst-first, so sorting by status surfaces the accounts to chase. */
const STATUS_RANK: Record<string, number> = {
  churned: 0,
  at_risk: 1,
  active: 2,
  none: 3,
};

/** Sorts that read better high-to-low, so the first click does the useful thing. */
const DESC_FIRST = new Set<SortKey>([
  "status",
  "last_order",
  "sales_2024",
  "sales_2025",
  "sales_2026",
]);

function timeOf(iso: string | null): number {
  if (!iso) return -Infinity; // never-ordered sinks to the bottom either way
  const t = new Date(iso).getTime();
  return isNaN(t) ? -Infinity : t;
}

/** The figure for a year under the active mode. */
function salesFor(c: PortalCustomer, year: Year, mode: SalesMode): number {
  if (mode === "ytd") {
    const v = c[`ytd_${year}` as const];
    return v ?? 0;
  }
  return c[`sales_${year}` as const] ?? 0;
}

export default function PortalCustomers() {
  const [rows, setRows] = useState<PortalCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sales_2026");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [mode, setMode] = useState<SalesMode>("full");
  const [ytdThrough, setYtdThrough] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    portalGet<{ customers: PortalCustomer[]; ytdThrough?: string }>(
      "/api/portal/customers",
    )
      .then((d) => {
        setRows(d.customers);
        setYtdThrough(d.ytdThrough ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  /* Channels come from the rep's own book, not a fixed list — an agency that
     sells no salons shouldn't be offered a SALON/SPA filter that finds nothing. */
  const channels = useMemo(() => {
    if (!rows) return [];
    const set = new Set<string>();
    for (const r of rows) if (r.channel?.trim()) set.add(r.channel.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  /** Counts for the status pills, reflecting the other active filters. */
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0, active: 0, at_risk: 0, churned: 0, none: 0,
    };
    if (!rows) return c;
    const q = search.trim().toLowerCase();
    for (const r of rows) {
      if (channel !== "all" && (r.channel ?? "").trim() !== channel) continue;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.customerid.toLowerCase().includes(q) &&
        !(r.bill_to_state ?? "").toLowerCase().includes(q)
      ) {
        continue;
      }
      c.all++;
      c[customerStatus(r.last_order_date, r.has_open_order)]++;
    }
    return c;
  }, [rows, search, channel]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();

    const matched = rows.filter((r) => {
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.customerid.toLowerCase().includes(q) &&
        !(r.bill_to_state ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (channel !== "all" && (r.channel ?? "").trim() !== channel) return false;
      if (
        status !== "all" &&
        customerStatus(r.last_order_date, r.has_open_order) !== status
      ) {
        return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "status":
          cmp =
            STATUS_RANK[customerStatus(a.last_order_date, a.has_open_order)] -
            STATUS_RANK[customerStatus(b.last_order_date, b.has_open_order)];
          break;
        case "channel":
          cmp = (a.channel ?? "").localeCompare(b.channel ?? "");
          break;
        case "state":
          cmp = (a.bill_to_state ?? "").localeCompare(b.bill_to_state ?? "");
          break;
        case "last_order":
          cmp = timeOf(a.last_order_date) - timeOf(b.last_order_date);
          break;
        // Sort on whatever the column is currently showing, not the stored
        // full-year value — otherwise YTD mode sorts by invisible numbers.
        case "sales_2024":
          cmp = salesFor(a, 2024, mode) - salesFor(b, 2024, mode);
          break;
        case "sales_2025":
          cmp = salesFor(a, 2025, mode) - salesFor(b, 2025, mode);
          break;
        case "sales_2026":
          cmp = salesFor(a, 2026, mode) - salesFor(b, 2026, mode);
          break;
      }
      // Name breaks ties so equal values don't shuffle between renders.
      if (cmp === 0) return a.name.localeCompare(b.name);
      return cmp * dir;
    });
  }, [rows, search, status, channel, sortKey, sortDir, mode]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DESC_FIRST.has(key) ? "desc" : "asc");
    }
  }

  const filtersOn = status !== "all" || channel !== "all" || !!search.trim();

  /* Exports exactly what's on screen — same filters, same sales mode — so the
     spreadsheet matches what the rep was looking at when they hit the button. */
  function handleExport() {
    const yearLabel = (y: Year) => (mode === "ytd" ? `${y} YTD` : `${y}`);
    const headers = [
      "Customer ID",
      "Name",
      "Status",
      "Open order",
      "Channel",
      "State",
      "Last order",
      "Last order amount",
      yearLabel(2024),
      yearLabel(2025),
      yearLabel(2026),
      "Lifetime orders",
      "Lifetime revenue",
    ];

    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [headers.join(",")];
    for (const c of filtered) {
      lines.push(
        [
          c.customerid,
          c.name,
          STATUS_LABEL[customerStatus(c.last_order_date, c.has_open_order)],
          c.has_open_order ? "Yes" : "No",
          c.channel ?? "",
          c.bill_to_state ?? "",
          c.last_order_date ?? "",
          c.last_order_amount ?? 0,
          salesFor(c, 2024, mode),
          salesFor(c, 2025, mode),
          salesFor(c, 2026, mode),
          c.lifetime_orders ?? 0,
          c.lifetime_revenue ?? 0,
        ]
          .map(cell)
          .join(","),
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my_customers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My customers</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rows ? `${rows.length.toLocaleString()} accounts in your book of business` : "Loading…"}
        </p>
      </div>

      {/* Toolbar — search on the left, everything that narrows the list on the right */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, ID, state…"
          className="w-full shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 lg:w-72"
        />

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => {
              const active = status === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatus(f.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                      active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {statusCounts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {channels.length > 0 && (
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              aria-label="Filter by channel"
              className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Full year vs YTD — changes what every sales column reports */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <button
              onClick={() => setMode("full")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                mode === "full"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Full year
            </button>
            <button
              onClick={() => setMode("ytd")}
              title={
                ytdThrough
                  ? `Jan 1 – ${ytdThrough} of each year`
                  : "Same window each year"
              }
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                mode === "ytd"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              YTD
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            title="Download the filtered list as CSV"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} />
            Export
          </button>

          {filtersOn && (
            <button
              onClick={() => {
                setSearch("");
                setStatus("all");
                setChannel("all");
              }}
              className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>


      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <Th label="Customer" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Channel" sortKey="channel" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="State" sortKey="state" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Last order" sortKey="last_order" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label="2024" sortKey="sales_2024" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label="2025" sortKey="sales_2025" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label="2026" sortKey="sales_2026" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!rows && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {rows && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No customers match.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const status = customerStatus(c.last_order_date, c.has_open_order);
              return (
                <tr
                  key={c.customerid}
                  onClick={() => router.push(portalHref(`/portal/customers/${encodeURIComponent(c.customerid)}`))}
                  className="cursor-pointer transition hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.customerid}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                    {/* Why they read as active despite an old last order. */}
                    {c.has_open_order && (
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        Order in progress
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.channel ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ChannelIcon channel={c.channel} size={15} className="text-gray-400" />
                        <span className="truncate">{c.channel}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.bill_to_state ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    <div>{shortDate(c.last_order_date)}</div>
                    <div className="text-xs text-gray-400">{usd(c.last_order_amount)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {usd(salesFor(c, 2024, mode))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {usd(salesFor(c, 2025, mode))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {usd(salesFor(c, 2026, mode))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows && (
        <p className="text-center text-xs text-gray-400">
          Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} accounts
        </p>
      )}

    </div>
  );
}

function Th({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`group cursor-pointer select-none px-4 py-3 font-medium transition hover:text-gray-800 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span
        className={`inline-flex items-center gap-0.5 ${
          align === "right" ? "justify-end" : ""
        }`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp size={12} className="text-gray-700" />
          ) : (
            <ChevronDown size={12} className="text-gray-700" />
          )
        ) : (
          <ChevronsUpDown
            size={12}
            className="text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </span>
    </th>
  );
}

