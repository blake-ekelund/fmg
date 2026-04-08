"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardAssets } from "../hooks/useDashboardAssets";
import { ImageIcon } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import AssetOverviewView from "../views/AssetOverviewView";
import RecentAssetsView from "../views/RecentAssetsView";
import ThirdPartyAssetsView from "../views/ThirdPartyAssetsView";

export default function AssetLibraryCategory() {
  const { brand } = useBrand();
  const { recent, kpis, loading } = useDashboardAssets(brand);

  return (
    <DashboardWidgetShell
      id="widget-assets"
      icon={ImageIcon}
      title="Asset Library"
      storageKey="assets"
      defaultCollapsed
      tabs={[
        {
          label: "Overview",
          content: <AssetOverviewView kpis={kpis} loading={loading} />,
        },
        {
          label: "Recent",
          content: <RecentAssetsView assets={recent} loading={loading} />,
        },
        {
          label: "Third Party",
          content: <ThirdPartyAssetsView />,
        },
      ]}
    />
  );
}
