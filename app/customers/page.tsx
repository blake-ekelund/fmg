"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  Search,
  SlidersHorizontal,
  Eye,
  ReceiptText,
  X,
} from "lucide-react";

type Channel = "Shopify" | "Faire" | "Wholesale";
type CustomerStatus = "New" | "Healthy" | "Warning" | "Lost";

type Order = {
  id: string;
  date: string; // ISO (YYYY-MM-DD)
  amount: number;
  channel: Channel;
};

type Customer = {
  id: string;
  name: string;
  channel: Channel;
  billToState: string;
  repGroup: string;
  repName: string;

  firstOrderDate: string; // ISO
  lastOrderDate: string; // ISO
  lastOrderAmount: number;

  salesByYear: Record<number, number>; // 2023+
  orders: Order[];
};

const YEARS = [2023, 2024, 2025, 2026] as const;

// ---------- Helpers ----------
function formatMoney(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string) {
  // keep simple (no timezone surprises)
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso + "T00:00:00").getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function computeStatus(c: Customer): CustomerStatus {
  const d = daysSince(c.lastOrderDate);
  const newWindowDays = 60;

  const isNew = daysSince(c.firstOrderDate) <= newWindowDays;
  if (d >= 365) return "Lost";
  if (d >= 180) return "Warning";
  if (isNew) return "New";
  return "Healthy";
}

function statusPillClass(status: CustomerStatus) {
  switch (status) {
    case "New":
      return "border-lime-200 bg-lime-50 text-lime-800";
    case "Warning":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "Lost":
      return "border-pink-200 bg-pink-50 text-pink-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

// ---------- Mock Data (replace with Supabase later) ----------
const mockCustomers: Customer[] = [
  {
    id: "c_001",
    name: "Lakefront Apothecary",
    channel: "Wholesale",
    billToState: "MN",
    repGroup: "Midwest",
    repName: "Alex Reed",
    firstOrderDate: "2025-11-15",
    lastOrderDate: "2026-01-10",
    lastOrderAmount: 1240,
    salesByYear: { 2023: 0, 2024: 8200, 2025: 15400, 2026: 1240 },
    orders: [
      { id: "o_101", date: "2026-01-10", amount: 1240, channel: "Wholesale" },
      { id: "o_087", date: "2025-12-05", amount: 3120, channel: "Wholesale" },
    ],
  },
  {
    id: "c_002",
    name: "Sunset Supply Co.",
    channel: "Faire",
    billToState: "CA",
    repGroup: "West",
    repName: "Jordan Lane",
    firstOrderDate: "2023-05-03",
    lastOrderDate: "2025-06-01",
    lastOrderAmount: 540,
    salesByYear: { 2023: 4200, 2024: 6100, 2025: 2380, 2026: 0 },
    orders: [
      { id: "o_442", date: "2025-06-01", amount: 540, channel: "Faire" },
      { id: "o_399", date: "2025-02-14", amount: 920, channel: "Faire" },
    ],
  },
  {
    id: "c_003",
    name: "Prairie Market",
    channel: "Shopify",
    billToState: "IA",
    repGroup: "Midwest",
    repName: "Alex Reed",
    firstOrderDate: "2024-09-22",
    lastOrderDate: "2024-10-12",
    lastOrderAmount: 180,
    salesByYear: { 2023: 0, 2024: 980, 2025: 0, 2026: 0 },
    orders: [
      { id: "o_211", date: "2024-10-12", amount: 180, channel: "Shopify" },
      { id: "o_197", date: "2024-09-22", amount: 220, channel: "Shopify" },
    ],
  },
  {
    id: "c_004",
    name: "North Star Gifts",
    channel: "Wholesale",
    billToState: "WI",
    repGroup: "Great Lakes",
    repName: "Sam Patel",
    firstOrderDate: "2023-01-18",
    lastOrderDate: "2023-12-30",
    lastOrderAmount: 860,
    salesByYear: { 2023: 12900, 2024: 0, 2025: 0, 2026: 0 },
    orders: [
      { id: "o_012", date: "2023-12-30", amount: 860, channel: "Wholesale" },
      { id: "o_005", date: "2023-09-02", amount: 1440, channel: "Wholesale" },
    ],
  },
];

type SortKey = "lastOrderDate" | "salesYear";
type SortDir = "desc" | "asc";

export default function CustomersPage() {
  // Filters
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<Channel | "All">("All");
  const [repGroup, setRepGroup] = useState<string>("All");
  const [repName, setRepName] = useState<string>("All");
  const [billToState, setBillToState] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "All">(
    "All"
  );

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("lastOrderDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortYear, setSortYear] = useState<number>(2026);

  // Modals
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [ordersId, setOrdersId] = useState<string | null>(null);

  const customers = mockCustomers;

  const repGroups = useMemo(() => {
    return ["All", ...Array.from(new Set(customers.map((c) => c.repGroup)))];
  }, [customers]);

  const repNames = useMemo(() => {
    const filtered =
      repGroup === "All"
        ? customers
        : customers.filter((c) => c.repGroup === repGroup);
    return ["All", ...Array.from(new Set(filtered.map((c) => c.repName)))];
  }, [customers, repGroup]);

  const states = useMemo(() => {
    return ["All", ...Array.from(new Set(customers.map((c) => c.billToState)))];
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return customers
      .map((c) => ({
        ...c,
        status: computeStatus(c),
      }))
      .filter((c) => {
        const matchesSearch =
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.orders.some((o) => o.id.toLowerCase().includes(q));
        // NOTE: later you’ll search SKU/fragrance/description from line items,
        // but for now we keep the placeholder behavior.

        const matchesChannel = channel === "All" || c.channel === channel;
        const matchesRepGroup = repGroup === "All" || c.repGroup === repGroup;
        const matchesRepName = repName === "All" || c.repName === repName;
        const matchesState =
          billToState === "All" || c.billToState === billToState;
        const matchesStatus =
          statusFilter === "All" || c.status === statusFilter;

        return (
          matchesSearch &&
          matchesChannel &&
          matchesRepGroup &&
          matchesRepName &&
          matchesState &&
          matchesStatus
        );
      })
      .sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;

        if (sortKey === "lastOrderDate") {
          const av = new Date(a.lastOrderDate).getTime();
          const bv = new Date(b.lastOrderDate).getTime();
          return (av - bv) * dir;
        }

        // salesYear
        const ay = a.salesByYear[sortYear] ?? 0;
        const by = b.salesByYear[sortYear] ?? 0;
        return (ay - by) * dir;
      });
  }, [
    customers,
    search,
    channel,
    repGroup,
    repName,
    billToState,
    statusFilter,
    sortKey,
    sortDir,
    sortYear,
  ]);

  const detailsCustomer = useMemo(
    () => customers.find((c) => c.id === detailsId) ?? null,
    [customers, detailsId]
  );

  const ordersCustomer = useMemo(
    () => customers.find((c) => c.id === ordersId) ?? null,
    [customers, ordersId]
  );

  return (
    <div className="px-8 py-10 space-y-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-3 text-gray-500 max-w-2xl">
            Search, filter, and review customer activity by channel, reps, and
            recency.
          </p>
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <SlidersHorizontal size={16} />
            Sort
          </div>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="lastOrderDate">Last Order Date</option>
            <option value="salesYear">Sales (Year)</option>
          </select>

          {sortKey === "salesYear" && (
            <select
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
              value={sortYear}
              onChange={(e) => setSortYear(Number(e.target.value))}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">High → Low</option>
            <option value="asc">Low → High</option>
          </select>
        </div>
      </header>

      {/* Filters Row */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name (SKU, Product, Fragrance, Description later)"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={channel}
            onChange={(e) => setChannel(e.target.value as any)}
          >
            <option value="All">Channel</option>
            <option value="Shopify">Shopify</option>
            <option value="Faire">Faire</option>
            <option value="Wholesale">Wholesale</option>
          </select>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={repGroup}
            onChange={(e) => {
              setRepGroup(e.target.value);
              setRepName("All");
            }}
          >
            {repGroups.map((g) => (
              <option key={g} value={g}>
                {g === "All" ? "Rep Group" : g}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
          >
            {repNames.map((n) => (
              <option key={n} value={n}>
                {n === "All" ? "Rep Name" : n}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={billToState}
            onChange={(e) => setBillToState(e.target.value)}
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "Bill-To State" : s}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="All">Status</option>
            <option value="New">New</option>
            <option value="Healthy">Healthy</option>
            <option value="Warning">Warning (180d)</option>
            <option value="Lost">Lost (365d)</option>
          </select>
        </div>

        {/* Filters summary */}
        <div className="text-xs text-gray-400">
          Showing {filtered.length} customers
        </div>
      </section>

      {/* Table */}
      <section className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-4 text-xs text-gray-500 bg-white border-b border-gray-200">
          <div className="col-span-3">Customer</div>
          <div className="col-span-1">Channel</div>
          <div className="col-span-2">Rep</div>
          <div className="col-span-1">State</div>
          <div className="col-span-2">Last Order</div>
          <div className="col-span-1">Last $</div>
          <div className="col-span-1">Sales {sortYear}</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-gray-200 bg-white">
          {filtered.map((c) => {
            const status = computeStatus(c);
            return (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center"
              >
                <div className="col-span-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={clsx(
                        "text-xs px-2 py-0.5 rounded-full border",
                        statusPillClass(status)
                      )}
                    >
                      {status}
                    </span>
                  </div>
                </div>

                <div className="col-span-1 text-sm text-gray-700">
                  {c.channel}
                </div>

                <div className="col-span-2">
                  <div className="text-sm font-medium">{c.repGroup}</div>
                  <div className="text-xs text-gray-500">{c.repName}</div>
                </div>

                <div className="col-span-1 text-sm text-gray-700">
                  {c.billToState}
                </div>

                <div className="col-span-2">
                  <div className="text-sm font-medium">
                    {formatDate(c.lastOrderDate)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {daysSince(c.lastOrderDate)} days ago
                  </div>
                </div>

                <div className="col-span-1 text-sm text-gray-700">
                  {formatMoney(c.lastOrderAmount)}
                </div>

                <div className="col-span-1 text-sm text-gray-700">
                  {formatMoney(c.salesByYear[sortYear] ?? 0)}
                </div>

                <div className="col-span-1 flex justify-end gap-2">
                  <button
                    onClick={() => setDetailsId(c.id)}
                    className="text-gray-600 hover:text-black transition inline-flex items-center gap-2 text-sm"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>

                  <button
                    onClick={() => setOrdersId(c.id)}
                    className="text-gray-600 hover:text-black transition inline-flex items-center gap-2 text-sm"
                    title="View Orders"
                  >
                    <ReceiptText size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Details Modal */}
      <Modal
        open={!!detailsCustomer}
        title="Customer Details"
        onClose={() => setDetailsId(null)}
      >
        {detailsCustomer && (
          <div className="space-y-6">
            <div>
              <div className="text-xl font-semibold">{detailsCustomer.name}</div>
              <div className="mt-2 text-sm text-gray-600">
                Channel: {detailsCustomer.channel} • Bill-To:{" "}
                {detailsCustomer.billToState}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                Rep Group: {detailsCustomer.repGroup} • Rep:{" "}
                {detailsCustomer.repName}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniStat
                label="First Order"
                value={formatDate(detailsCustomer.firstOrderDate)}
              />
              <MiniStat
                label="Last Order"
                value={formatDate(detailsCustomer.lastOrderDate)}
              />
              <MiniStat
                label="Last Order $"
                value={formatMoney(detailsCustomer.lastOrderAmount)}
              />
              <MiniStat
                label="Status"
                value={computeStatus(detailsCustomer)}
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-4">
              <div className="text-sm font-medium mb-3">Sales by Year</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {YEARS.map((y) => (
                  <MiniStat
                    key={y}
                    label={String(y)}
                    value={formatMoney(detailsCustomer.salesByYear[y] ?? 0)}
                  />
                ))}
              </div>
            </div>

            <div className="text-sm text-gray-500">
              (Future) Add address, contacts, notes, and line-item search fields
              once wired to Supabase.
            </div>
          </div>
        )}
      </Modal>

      {/* Orders Modal */}
      <Modal
        open={!!ordersCustomer}
        title="Customer Orders"
        onClose={() => setOrdersId(null)}
      >
        {ordersCustomer && (
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold">{ordersCustomer.name}</div>
              <div className="text-sm text-gray-600">
                {ordersCustomer.orders.length} orders shown
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-4 gap-4 px-4 py-3 text-xs text-gray-500 border-b border-gray-200 bg-white">
                <div>Order ID</div>
                <div>Date</div>
                <div>Channel</div>
                <div className="text-right">Amount</div>
              </div>

              <div className="divide-y divide-gray-200 bg-white">
                {ordersCustomer.orders
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((o) => (
                    <div
                      key={o.id}
                      className="grid grid-cols-4 gap-4 px-4 py-3 text-sm"
                    >
                      <div className="font-medium">{o.id}</div>
                      <div className="text-gray-700">{formatDate(o.date)}</div>
                      <div className="text-gray-700">{o.channel}</div>
                      <div className="text-right">{formatMoney(o.amount)}</div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="text-xs text-gray-400">
              (Future) Add full order drilldown + line items, and export.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Small UI bits ----------
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="text-sm font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-black transition"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
