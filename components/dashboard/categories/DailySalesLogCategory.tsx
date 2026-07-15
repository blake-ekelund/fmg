"use client";

import { useBrand } from "@/components/BrandContext";
import { ClipboardList } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import DailySalesLogView from "../views/DailySalesLogView";
import { useDailySalesLog } from "../hooks/useDailySalesLog";

export default function DailySalesLogCategory() {
  const { brand } = useBrand();
  const { days, kpis, loading, error } = useDailySalesLog(brand);

  return (
    <DashboardWidgetShell
      id="widget-daily-sales-log"
      icon={ClipboardList}
      title="Daily Sales Log"
      storageKey="daily-sales-log"
      tabs={[
        {
          label: "Log",
          content: (
            <DailySalesLogView
              days={days}
              kpis={kpis}
              loading={loading}
              error={error}
            />
          ),
        },
      ]}
    />
  );
}
