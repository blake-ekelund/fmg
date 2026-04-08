"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardInventory } from "../hooks/useDashboardInventory";
import { Package } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import InventoryOverviewView from "../views/InventoryOverviewView";
import StockAlertsView from "../views/StockAlertsView";
import InventoryBreakdownView from "../views/InventoryBreakdownView";

export default function InventoryCategory() {
  const { brand } = useBrand();
  const { items, kpis, loading } = useDashboardInventory(brand);

  const alertCount = kpis.at_risk;

  return (
    <DashboardWidgetShell
      id="widget-inventory"
      icon={Package}
      title="Inventory"
      storageKey="inventory"
      tabs={[
        {
          label: "Overview",
          content: <InventoryOverviewView kpis={kpis} loading={loading} />,
        },
        {
          label: "Stock Alerts",
          badge: alertCount > 0 ? alertCount : undefined,
          content: <StockAlertsView items={items} loading={loading} />,
        },
        {
          label: "By Category",
          content: <InventoryBreakdownView items={items} loading={loading} />,
        },
      ]}
    />
  );
}
