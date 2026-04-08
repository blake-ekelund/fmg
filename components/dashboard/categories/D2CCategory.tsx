"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardSales } from "../hooks/useDashboardSales";
import { useDashboardCustomers } from "../hooks/useDashboardCustomers";
import { useCustomerHealthFromList } from "../hooks/useCustomerHealthFromList";
import { ShoppingBag } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import ChannelSalesView from "../views/ChannelSalesView";
import CustomerOverviewView from "../views/CustomerOverviewView";
import CustomerTrendsView from "../views/CustomerTrendsView";

export default function D2CCategory() {
  const { brand } = useBrand();
  const { data: monthlyData, kpis: salesKpis, loading: salesLoading } = useDashboardSales(brand);
  const { customers, kpis: custKpis, loading: custLoading } = useDashboardCustomers(brand, "d2c");
  const { data: healthData, kpis: healthKpis } = useCustomerHealthFromList(customers, custLoading);

  // Build D2C-only chart data
  const chartData = monthlyData.map((r) => ({
    month: r.month,
    sales_2025: r.d2c_2025,
    sales_2026: r.d2c_2026,
  }));

  return (
    <DashboardWidgetShell
      id="widget-d2c"
      icon={ShoppingBag}
      title="D2C"
      storageKey="d2c"
      tabs={[
        {
          label: "Sales",
          content: (
            <ChannelSalesView
              ytd2026={salesKpis.d2c_ytd_2026}
              ytd2025={salesKpis.d2c_ytd_2025}
              variance={salesKpis.d2c_variance}
              ytdLabel={salesKpis.ytd_label}
              chartData={chartData}
              loading={salesLoading}
              channelLabel="D2C"
              color="sky"
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
              mode="d2c"
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
              mode="d2c"
            />
          ),
        },
      ]}
    />
  );
}
