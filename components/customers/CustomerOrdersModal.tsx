// /modal/CustomerOrdersModal.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ModalShell from "./modal/components/ModalShell";
import SidebarNav from "./modal/components/SidebarNav";
import DetailsTab from "./modal/tabs/DetailsTab";
import OrdersTab from "./modal/tabs/OrdersTab";
import ContactTab from "./modal/tabs/ContactTab";

import useCustomerSummary from "./modal/hooks/useCustomerSummary";
import useCustomerOrders from "./modal/hooks/useCustomerOrders";
import useOrderItems from "./modal/hooks/useOrderItems";

type Tab = "details" | "orders" | "contact";

export default function CustomerOrdersModal({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("details");

  useEffect(() => {
    if (!customerId) return;
    setTab("details");
  }, [customerId]);

  const { summary, loading: summaryLoading } = useCustomerSummary(customerId);

  const ordersEnabled = tab === "orders";
  const {
    orders,
    setOrders,
    loading: ordersLoading,
    orderPage,
    setOrderPage,
    totalCount: orderTotalCount,
    totalPages: orderTotalPages,
  } = useCustomerOrders(customerId, ordersEnabled);

  const items = useOrderItems({ orders, setOrders });

  useEffect(() => {
    if (!customerId) return;
    items.reset();
    setOrders([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (!customerId) return null;

  const totalSpend =
    (summary?.sales_2023 ?? 0) +
    (summary?.sales_2024 ?? 0) +
    (summary?.sales_2025 ?? 0) +
    (summary?.sales_2026 ?? 0);

  const totalOrders = orderTotalCount;
  const aov = totalOrders > 0 ? totalSpend / totalOrders : 0;

  const summaryName = summary?.name ?? "Customer";

  return (
    <ModalShell onClose={onClose}>
      <SidebarNav summaryName={summaryName} tab={tab} setTab={setTab} />

      <div className="flex-1 p-8 overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-700"
        >
          <X size={18} />
        </button>

        <AnimatePresence mode="wait">
          {tab === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DetailsTab
                loading={summaryLoading}
                summary={summary}
                totalOrders={totalOrders}
                totalSpend={totalSpend}
                aov={aov}
              />
            </motion.div>
          )}

          {tab === "orders" && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-hidden"
            >
              <OrdersTab
                orders={orders}
                ordersLoading={ordersLoading}
                orderPage={orderPage}
                setOrderPage={setOrderPage}
                orderTotalPages={orderTotalPages}
                expandedOrder={items.expandedOrder}
                toggleOrder={items.toggleOrder}
                getItemMeta={items.getItemMeta}
                loadItems={items.loadItems}
              />
            </motion.div>
          )}

          {tab === "contact" && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ContactTab summary={summary} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ModalShell>
  );
}