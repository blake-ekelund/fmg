"use client";

import { useBrand } from "@/components/BrandContext";
import { BarChart3 } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import MonthlySalesView from "../views/MonthlySalesView";
import { useMonthlySales } from "../hooks/useMonthlySales";

export default function MonthlySalesCategory() {
  const { brand } = useBrand();
  const { months, pace, estimate, loading, error } = useMonthlySales(brand);

  return (
    <DashboardWidgetShell
      id="widget-monthly-sales"
      icon={BarChart3}
      title="Monthly Sales"
      storageKey="monthly-sales"
      tabs={[
        {
          label: "Results",
          content: (
            <MonthlySalesView
              months={months}
              pace={pace}
              estimate={estimate}
              loading={loading}
              error={error}
            />
          ),
        },
      ]}
    />
  );
}
