"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  portalGet,
  usd,
  shortDate,
  customerStatus,
  type PortalCustomer,
  type PortalContact,
} from "@/components/portal/api";

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

export default function PortalCustomers() {
  const [rows, setRows] = useState<PortalCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PortalCustomer | null>(null);
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  useEffect(() => {
    portalGet<{ customers: PortalCustomer[] }>("/api/portal/customers")
      .then((d) => setRows(d.customers))
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.customerid.toLowerCase().includes(q) ||
        (r.bill_to_state ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  async function openDetail(c: PortalCustomer) {
    setSelected(c);
    setContact(null);
    setContactLoading(true);
    try {
      const d = await portalGet<{ customer: PortalCustomer; contact: PortalContact | null }>(
        `/api/portal/customers?id=${encodeURIComponent(c.customerid)}`,
      );
      setContact(d.contact);
    } catch {
      setContact(null);
    } finally {
      setContactLoading(false);
    }
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My customers</h1>
          <p className="mt-1 text-sm text-gray-500">
            {rows ? `${rows.length.toLocaleString()} accounts in your book of business` : "Loading…"}
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, ID, state…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:w-72"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3 text-right">Last order</th>
              <th className="px-4 py-3 text-right">2025</th>
              <th className="px-4 py-3 text-right">2026</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!rows && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {rows && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No customers match.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const status = customerStatus(c.last_order_date);
              return (
                <tr
                  key={c.customerid}
                  onClick={() => openDetail(c)}
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
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.bill_to_state ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    <div>{shortDate(c.last_order_date)}</div>
                    <div className="text-xs text-gray-400">{usd(c.last_order_amount)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{usd(c.sales_2025)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{usd(c.sales_2026)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <Drawer customer={selected} contact={contact} loading={contactLoading} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Drawer({
  customer,
  contact,
  loading,
  onClose,
}: {
  customer: PortalCustomer;
  contact: PortalContact | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-gray-900">{customer.name}</div>
            <div className="text-xs text-gray-400">{customer.customerid}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sales by year</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="2023" value={usd(customer.sales_2023)} />
              <Stat label="2024" value={usd(customer.sales_2024)} />
              <Stat label="2025" value={usd(customer.sales_2025)} />
              <Stat label="2026" value={usd(customer.sales_2026)} highlight />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Order history</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="First order" value={shortDate(customer.first_order_date)} />
              <Stat label="Last order" value={shortDate(customer.last_order_date)} />
              <Stat label="Lifetime orders" value={(customer.lifetime_orders ?? 0).toLocaleString()} />
              <Stat label="Lifetime revenue" value={usd(customer.lifetime_revenue)} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</h3>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : contact ? (
              <div className="space-y-1 text-sm text-gray-700">
                {contact.email && <div>{contact.email}</div>}
                {contact.phone && <div>{contact.phone}</div>}
                {(contact.billto_address || contact.billto_city) && (
                  <div className="pt-1 text-gray-500">
                    {contact.billto_address}
                    {contact.billto_address ? <br /> : null}
                    {[contact.billto_city, contact.billto_state, contact.billto_zip].filter(Boolean).join(", ")}
                  </div>
                )}
                {!contact.email && !contact.phone && !contact.billto_city && (
                  <p className="text-gray-400">No contact details on file.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No contact details on file.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-gray-900/10 bg-gray-50" : "border-gray-100"}`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
