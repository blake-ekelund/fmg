"use client";

import PageHeader from "@/components/ui/PageHeader";
import ForecastSection from "./forecasting/ForecastSection";

export default function InventoryPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      <PageHeader subtitle="12-month demand forecast and inventory projections" />
      <ForecastSection />
    </div>
  );
}
