"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardSales } from "../hooks/useDashboardSales";
import { useDashboardCustomers } from "../hooks/useDashboardCustomers";
import { useCustomerHealthFromList } from "../hooks/useCustomerHealthFromList";
import { Store } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import ChannelSalesView from "../views/ChannelSalesView";
import CustomerOverviewView from "../views/CustomerOverviewView";
import CustomerTrendsView from "../views/CustomerTrendsView";

export default function WholesaleCategory() {
  const { brand } = useBrand();
  const { data: monthlyData, kpis: salesKpis, loading: salesLoading } = useDashboardSales(brand);
  const { customers, kpis: custKpis, loading: custLoading } = useDashboardCustomers(brand, "wholesale");
  const { data: healthData, kpis: healthKpis } = useCustomerHealthFromList(customers, custLoading);

  // Build wholesale-only chart data
  const chartData = monthlyData.map((r) => ({
    month: r.month,
    sales_2025: r.wholesale_2025,
    sales_2026: r.wholesale_2026,
  }));

  return (
    <DashboardWidgetShell
      id="widget-wholesale"
      icon={Store}
      title="Wholesale"
      storageKey="wholesale"
      tabs={[
        {
          label: "Sales",
          content: (
            <ChannelSalesView
              ytd2026={salesKpis.wholesale_ytd_2026}
              ytd2025={salesKpis.wholesale_ytd_2025}
              variance={salesKpis.wholesale_variance}
              ytdLabel={salesKpis.ytd_label}
              chartData={chartData}
              loading={salesLoading}
              channelLabel="Wholesale"
              color="emerald"
            />
          ),
        },
        {
          label: "Customers",
          badge: custKpis.at_risk > 0 ? custKpis.at_risk : undefined,
          content: (
            <CustomerOverviewView
              customers={customers}
              kpis={custKpis}
              loading={custLoading}
              mode="wholesale"
            />
          ),
        },
        {
          label: "Trends",
          content: (
            <CustomerTrendsView
              data={healthData}
              kpis={healthKpis}
              loading={custLoading}
              activeCustomers={custKpis.active}
              customers={customers}
              mode="wholesale"
            />
          ),
        },
      ]}
    />
  );
}
