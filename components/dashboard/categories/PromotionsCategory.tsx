"use client";

import { Tag } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import PromotionsOverviewView from "../views/PromotionsOverviewView";
import ActivePromotionsView from "../views/ActivePromotionsView";

export default function PromotionsCategory() {
  return (
    <DashboardWidgetShell
      id="widget-promotions"
      icon={Tag}
      title="Promotions"
      storageKey="promotions"
      tabs={[
        {
          label: "Overview",
          content: <PromotionsOverviewView />,
        },
        {
          label: "Active",
          content: <ActivePromotionsView />,
        },
      ]}
    />
  );
}
