"use client";

import PageMeta from "@/components/PageMeta";
import ForecastSection from "./forecasting/ForecastSection";

export default function InventoryPage({
  initialFilter,
}: {
  initialFilter?: string;
}) {
  return (
    <div className="px-4 md:px-8 py-4 md:py-5">
      <PageMeta title="Inventory" description="Stock levels and demand forecasts to plan reorders." />
      <ForecastSection initialFilter={initialFilter} />
    </div>
  );
}
