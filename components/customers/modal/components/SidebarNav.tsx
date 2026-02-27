// /modal/components/SidebarNav.tsx
"use client";

import { User, Receipt, Phone } from "lucide-react";
import SidebarItem from "./SidebarItem";

type Tab = "details" | "orders" | "contact";

export default function SidebarNav({
  summaryName,
  tab,
  setTab,
}: {
  summaryName: string;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  return (
    <div className="w-64 bg-slate-50/60 border-r border-slate-200/60 p-6 flex flex-col gap-4">
      <div className="font-semibold text-slate-800 mb-4">
        {summaryName || "Customer"}
      </div>

      <SidebarItem
        active={tab === "details"}
        onClick={() => setTab("details")}
        icon={<User size={16} />}
        label="Customer Details"
      />
      <SidebarItem
        active={tab === "orders"}
        onClick={() => setTab("orders")}
        icon={<Receipt size={16} />}
        label="Past Orders"
      />
      <SidebarItem
        active={tab === "contact"}
        onClick={() => setTab("contact")}
        icon={<Phone size={16} />}
        label="Contact Information"
      />
    </div>
  );
}