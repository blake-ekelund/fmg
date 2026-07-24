"use client";

import ForecastSection from "./forecasting/ForecastSection";

export default function InventoryPage({
  initialFilter,
}: {
  initialFilter?: string;
}) {
  return (
    <div className="px-4 md:px-8 py-4 md:py-5">
      <ForecastSection initialFilter={initialFilter} />
    </div>
  );
}
