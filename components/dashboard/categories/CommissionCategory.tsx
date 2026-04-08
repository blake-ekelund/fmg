"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardRepSales } from "../hooks/useDashboardRepSales";
import { Handshake } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import RepSalesView from "../views/RepSalesView";

export default function CommissionCategory() {
  const { brand } = useBrand();
  const { rows, kpis, loading } = useDashboardRepSales(brand);

  return (
    <DashboardWidgetShell
      id="widget-commission"
      icon={Handshake}
      title="Rep Group Sales"
      storageKey="commission"
      tabs={[
        {
          label: "Overview",
          content: <RepSalesView rows={rows} kpis={kpis} loading={loading} />,
        },
      ]}
    />
  );
}
