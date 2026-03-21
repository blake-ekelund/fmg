"use client";

import { Customer } from "./types";
import CustomerCard from "./CustomerCard";

export default function CustomersCardGrid({
  customers = [],
  loading,
}: {
  customers?: Customer[];
  loading: boolean;
}) {
  const safeCustomers = customers ?? [];

  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        Loading customers...
      </div>
    );
  }

  if (safeCustomers.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        No customers match your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {safeCustomers.map((customer) => (
        <CustomerCard key={customer.customerid} customer={customer} />
      ))}
    </div>
  );
}
