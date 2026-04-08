"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardSales } from "../hooks/useDashboardSales";
import { useDashboardCustomerHealth } from "../hooks/useDashboardCustomerHealth";
import { useDashboardCustomers } from "../hooks/useDashboardCustomers";
import { TrendingUp } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import SalesOverviewView from "../views/SalesOverviewView";
import CustomerTrendsView from "../views/CustomerTrendsView";

export default function SalesCategory() {
  const { brand } = useBrand();
  const { data: salesData, kpis, loading: salesLoading } = useDashboardSales(brand);
  const { data: healthData, kpis: healthKpis, loading: healthLoading } = useDashboardCustomerHealth(brand);
  const { kpis: wsKpis } = useDashboardCustomers(brand, "wholesale");
  const { kpis: d2cKpis } = useDashboardCustomers(brand, "d2c");

  return (
    <DashboardWidgetShell
      id="widget-sales"
      icon={TrendingUp}
      title="Sales"
      storageKey="sales"
      tabs={[
        {
          label: "2025 vs 2026",
          content: (
            <SalesOverviewView
              kpis={kpis}
              monthlyData={salesData}
              loading={salesLoading}
            />
          ),
        },
        {
          label: "Customer & Churn",
          content: (
            <CustomerTrendsView
              data={healthData}
              kpis={healthKpis}
              loading={healthLoading}
              activeCustomers={wsKpis.active + d2cKpis.active}
            />
          ),
        },
      ]}
    />
  );
}
