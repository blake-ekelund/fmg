"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

import InventoryHeader from "./current/InventoryHeader";
import InventoryFilters from "./current/InventoryFilters";
import InventoryTable from "./current/InventoryTable";
import ProductListSection from "./list/ProductListSection";
import ForecastSection from "./forecasting/ForecastSection";
import { InventoryRow } from "./types";

type InventorySection = "current" | "products" | "forecast";

export default function InventoryPage() {
  const [section, setSection] = useState<InventorySection>("current");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    onlyShort: false,
  });

  useEffect(() => {
    supabase
      .from("inventory_snapshot_items")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);

  const filtered = rows.filter((r) => {
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

  return (
    <div
      className="
        px-4 py-6
        md:px-8 md:py-10
        space-y-8 md:space-y-10
      "
    >
      {/* Header */}
      <header
        className="
          flex flex-col gap-4
          md:flex-row md:items-center md:justify-between
        "
      >
        <div className="space-y-2">
          <h1
            className="
              text-2xl font-semibold tracking-tight
              md:text-4xl
            "
          >
            Inventory
          </h1>
          <p
            className="
              text-sm text-gray-500
              md:text-base md:max-w-xl
            "
          >
            Track current stock, manage products, and plan inventory needs.
          </p>
        </div>

        <InventoryHeader />
      </header>

      {/* Section Tabs */}
      <nav
        className="
          -mx-4 px-4
          md:mx-0 md:px-0
          flex gap-2 overflow-x-auto
          border-b border-gray-200 pb-2
          scrollbar-none
        "
      >
        <TabButton
          active={section === "current"}
          onClick={() => setSection("current")}
        >
          Current
        </TabButton>

        <TabButton
          active={section === "products"}
          onClick={() => setSection("products")}
        >
          Products
        </TabButton>

        <TabButton
          active={section === "forecast"}
          onClick={() => setSection("forecast")}
        >
          Forecast
        </TabButton>
      </nav>

      {/* Section Content */}
      <div
        className="
          space-y-8
          md:space-y-12
        "
      >
        {section === "current" && (
          <>
            <InventoryFilters
              filters={filters}
              setFilters={setFilters}
            />

            <InventoryTable rows={filtered} />
          </>
        )}

        {section === "products" && <ProductListSection />}

        {section === "forecast" && <ForecastSection />}
      </div>
    </div>
  );
}

/* ---------------------------------------------
   Tab Button
--------------------------------------------- */
function TabButton({
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
      className={`
        shrink-0
        rounded-xl px-3 py-1.5 text-sm transition
        ${
          active
            ? "bg-gray-100 text-black"
            : "text-gray-500 hover:text-black hover:bg-gray-50"
        }
      `}
    >
      {children}
    </button>
  );
}
