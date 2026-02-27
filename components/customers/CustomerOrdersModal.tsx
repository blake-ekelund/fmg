"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ModalShell from "./modal/components/ModalShell";
import SidebarNav from "./modal/components/SidebarNav";
import DetailsTab from "./modal/tabs/DetailsTab";
import OrdersTab from "./modal/tabs/OrdersTab";
import SalesAnalysisTab from "./modal/tabs/SalesAnalysisTab";
import ContactTab from "./modal/tabs/ContactTab";

import useCustomerSummary from "./modal/hooks/useCustomerSummary";
import useCustomerOrders from "./modal/hooks/useCustomerOrders";
import useOrderItems from "./modal/hooks/useOrderItems";
import useCustomerMonthlyOrders from "./modal/hooks/useCustomerMonthlyOrders";
import useCustomerSalesAnalysis from "./modal/hooks/useCustomerSalesAnalysis";
import useCustomerContact from "./modal/hooks/useCustomerContact";

type Tab = "details" | "orders" | "analysis" | "contact";

export default function CustomerOrdersModal({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("details");

  /* ================= RESET TAB WHEN CUSTOMER CHANGES ================= */

  useEffect(() => {
    if (!customerId) return;
    setTab("details");
  }, [customerId]);

  /* ================= SUMMARY (Performance View) ================= */

  const { summary, loading: summaryLoading } =
    useCustomerSummary(customerId);

  /* ================= CONTACT (Contact View) ================= */

  const { contact, loading: contactLoading } =
    useCustomerContact(customerId);

  /* ================= MONTHLY ================= */

  const detailsEnabled = tab === "details";

  const { monthlyData, loading: monthlyLoading } =
    useCustomerMonthlyOrders(customerId, detailsEnabled);

  /* ================= ORDERS ================= */

  const ordersEnabled = tab === "orders";

  const {
    orders,
    setOrders,
    loading: ordersLoading,
  } = useCustomerOrders(customerId, ordersEnabled);

  const items = useOrderItems({ orders, setOrders });

  // Reset order expansion when customer changes
  useEffect(() => {
    if (!customerId) return;
    items.reset();
    setOrders([]);
  }, [customerId]);

  // Reset expansion when leaving Orders tab
  useEffect(() => {
    if (tab !== "orders") {
      items.reset();
    }
  }, [tab]);

  /* ================= ANALYSIS ================= */

  const analysisEnabled = tab === "analysis";

  const {
    data: analysisData,
    loading: analysisLoading,
  } = useCustomerSalesAnalysis(customerId, analysisEnabled);

  /* ================= GUARD ================= */

  if (!customerId) return null;

  // IMPORTANT FIX: your summary view uses `name`, not `customer_name`
  const summaryName = summary?.name ?? contact?.customer_name ?? "Customer";

  /* ================= RENDER ================= */

  return (
    <ModalShell onClose={onClose}>
      <SidebarNav
        summaryName={summaryName}
        tab={tab}
        setTab={setTab}
      />

      <div className="flex-1 p-8 overflow-hidden relative">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition"
        >
          <X size={18} />
        </button>

        <AnimatePresence mode="wait">

          {/* ================= DETAILS TAB ================= */}
          {tab === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DetailsTab
                loading={summaryLoading || monthlyLoading}
                summary={summary}
                monthlyData={monthlyData}
              />
            </motion.div>
          )}

          {/* ================= ORDERS TAB ================= */}
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
                expandedOrder={items.expandedOrder}
                toggleOrder={items.toggleOrder}
                getItemMeta={items.getItemMeta}
              />
            </motion.div>
          )}

          {/* ================= ANALYSIS TAB ================= */}
          {tab === "analysis" && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto"
            >
              <SalesAnalysisTab
                data={analysisData}
                loading={analysisLoading}
              />
            </motion.div>
          )}

          {/* ================= CONTACT TAB ================= */}
          {tab === "contact" && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {contactLoading ? (
                <div className="text-sm text-slate-400">
                  Loading contact information...
                </div>
              ) : (
                <ContactTab summary={contact} />
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </ModalShell>
  );
}