"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

import InventoryFilters from "./current/InventoryFilters";
import InventoryTable from "./current/InventoryTable";
import ProductListSection from "./list/ProductListSection";
import ForecastSection from "./forecasting/ForecastSection";
import { InventoryRow } from "./types";

import InventoryUploadModal from "./current/InventoryUploadModal";
import SalesUploadModal from "./current/SalesUploadModal";

type InventorySection = "current" | "products" | "forecast";

export default function InventoryPage() {
  const [section, setSection] = useState<InventorySection>("forecast");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    onlyShort: false,
  });

  const [lastInventoryUpload, setLastInventoryUpload] = useState<string | null>(null);
  const [lastSalesUpload, setLastSalesUpload] = useState<string | null>(null);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);

  /* --------------------------------------------------
     Fetch Snapshot Data
  -------------------------------------------------- */
  const fetchSnapshot = useCallback(async () => {
    // 1️⃣ Get latest upload id
    const { data: latestUpload } = await supabase
      .from("inventory_uploads")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestUpload) {
      setRows([]);
      return;
    }

    // 2️⃣ Fetch rows only for that upload
    const { data } = await supabase
      .from("inventory_snapshot_items")
      .select("*")
      .eq("upload_id", latestUpload.id);

    setRows(data ?? []);
  }, []);

  useEffect(() => {
    if (section === "current") fetchSnapshot();
  }, [section, fetchSnapshot]);

  /* --------------------------------------------------
     Fetch Upload Metadata
  -------------------------------------------------- */
  const fetchUploadDates = useCallback(async () => {
    const { data: inv } = await supabase
      .from("inventory_uploads")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: sales } = await supabase
      .from("sales_orders_raw")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setLastInventoryUpload(inv?.created_at ?? null);
    setLastSalesUpload(sales?.created_at ?? null);
  }, []);

  useEffect(() => {
    fetchUploadDates();
  }, [fetchUploadDates]);

  /* --------------------------------------------------
     Filtering
  -------------------------------------------------- */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (
        filters.search &&
        !`${r.part} ${r.description ?? ""}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      if (filters.onlyShort && r.short <= 0) {
        return false;
      }

      return true;
    });
  }, [rows, filters]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="px-4 py-4 md:px-8 md:py-5 space-y-6"
    >

      {/* --------------------------------------------------
         Header
      -------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="border-b border-gray-200 pb-3"
      >

        <div className="flex items-center justify-between">

          {/* Left: Title + Tabs */}
          <div className="flex items-end gap-8">

            <h1 className="text-2xl font-semibold tracking-tight">
              Inventory
            </h1>

            <nav className="flex gap-6 text-sm font-medium">
              <InlineTab active={section === "forecast"} onClick={() => setSection("forecast")}>
                Forecast
              </InlineTab>
              
              <InlineTab active={section === "current"} onClick={() => setSection("current")}>
                Current
              </InlineTab>

              <InlineTab active={section === "products"} onClick={() => setSection("products")}>
                Products
              </InlineTab>

            </nav>

          </div>

          {/* Right: Upload Blocks */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.08 }
              }
            }}
            className="flex gap-8"
          >

            <UploadBlock
              label="Inventory"
              value={lastInventoryUpload}
              onClick={() => setShowInventoryModal(true)}
            />

            <UploadBlock
              label="Sales"
              value={lastSalesUpload}
              onClick={() => setShowSalesModal(true)}
            />

          </motion.div>

        </div>
      </motion.div>

      {/* --------------------------------------------------
         Content
      -------------------------------------------------- */}
      <div className="space-y-6">

        {section === "current" && (
          <>
            <InventoryFilters filters={filters} setFilters={setFilters} />
            <InventoryTable rows={filtered} />
          </>
        )}

        {section === "products" && <ProductListSection />}
        {section === "forecast" && <ForecastSection />}
      </div>

      {/* --------------------------------------------------
         Modals
      -------------------------------------------------- */}
      <InventoryUploadModal
        open={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        onUploaded={() => {
          fetchUploadDates();
          fetchSnapshot();
        }}
      />

      <SalesUploadModal
        open={showSalesModal}
        onClose={() => setShowSalesModal(false)}
        onUploaded={() => {
          fetchUploadDates();
        }}
      />

    </motion.div>
  );
}

/* --------------------------------------------------
   Tabs with animated underline
-------------------------------------------------- */
function InlineTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-2 transition-colors duration-200 ${
        active ? "text-[#ebb700]" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}

      {active && (
        <motion.span
          layoutId="tab-underline"
          className="absolute left-0 bottom-0 h-[2px] w-full rounded-full bg-[#ebb700]"
        />
      )}
    </button>
  );
}

/* --------------------------------------------------
   Upload Block with entrance animation
-------------------------------------------------- */
function UploadBlock({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | null;
  onClick: () => void;
}) {
  const formatted = value
    ? new Date(value).toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0 }
      }}
      transition={{ duration: 0.25 }}
      className="text-right text-xs space-y-1"
    >
      <div className="text-gray-500">
        {label} Data
      </div>

      <button
        onClick={onClick}
        className={`font-medium transition ${
          value
            ? "text-gray-800 hover:text-[#ebb700]"
            : "text-gray-400 hover:text-[#ebb700]"
        }`}
      >
        {formatted}
      </button>
    </motion.div>
  );
}