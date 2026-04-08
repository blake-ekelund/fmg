"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import { useBrand } from "@/components/BrandContext";
import { useDashboardContentCalendar } from "../hooks/useDashboardContentCalendar";
import { useDashboardContentPipeline } from "../hooks/useDashboardContentPipeline";
import { Megaphone } from "lucide-react";
import DashboardWidgetShell from "../DashboardWidgetShell";
import ContentCalendarView from "../views/ContentCalendarView";
import ContentPipelineView from "../views/ContentPipelineView";

export default function ContentCategory() {
  const { profile } = useUser();
  const { brand } = useBrand();
  const [dateOffset, setDateOffset] = useState(0);

  const {
    items: calendarItems,
    loading: calLoading,
    targetDate,
  } = useDashboardContentCalendar(brand, dateOffset);

  const {
    posts,
    summary,
    loading: pipelineLoading,
  } = useDashboardContentPipeline(brand);

  // Role gate: only owner/admin
  if (!profile || (profile.access !== "owner" && profile.access !== "admin")) {
    return null;
  }

  // Count per type for badges
  const blogReview = posts.filter(
    (p) => p.type === "blog" && p.status === "human_review"
  ).length;
  const socialReview = posts.filter(
    (p) => p.type === "social" && p.status === "human_review"
  ).length;

  const showBrand = brand === "all";

  return (
    <DashboardWidgetShell
      id="widget-content"
      icon={Megaphone}
      title="Content"
      storageKey="content"
      tabs={[
        {
          label: "Blog Pipeline",
          badge: blogReview > 0 ? blogReview : undefined,
          content: (
            <ContentPipelineView
              posts={posts}
              summary={summary}
              loading={pipelineLoading}
              type="blog"
              showBrand={showBrand}
            />
          ),
        },
        {
          label: "Social Pipeline",
          badge: socialReview > 0 ? socialReview : undefined,
          content: (
            <ContentPipelineView
              posts={posts}
              summary={summary}
              loading={pipelineLoading}
              type="social"
              showBrand={showBrand}
            />
          ),
        },
        {
          label: "Calendar",
          content: (
            <ContentCalendarView
              items={calendarItems}
              loading={calLoading}
              targetDate={targetDate}
              dateOffset={dateOffset}
              onPrev={() => setDateOffset((d) => d - 1)}
              onNext={() => setDateOffset((d) => d + 1)}
              onToday={() => setDateOffset(0)}
              onSetOffset={setDateOffset}
              showBrand={showBrand}
            />
          ),
        },
      ]}
    />
  );
}
