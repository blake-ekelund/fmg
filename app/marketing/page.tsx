"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import TabNav, { type Tab } from "@/components/ui/TabNav";

import MarketingOverviewSection from "@/components/marketing/overview/overview";
import MarketingContentSection from "@/components/marketing/content-calendar/index";
import MarketingShopifySection from "@/components/marketing/shopify/shopify";
import MarketingShareSection from "@/components/marketing/photo-share/PhotoSharePage";
import SocialMediaSection from "@/components/marketing/social-media/SocialMediaSection";

type MarketingSection =
  | "overview"
  | "content-calendar"
  | "shopify"
  | "photo-share"
  | "social-media";

const TABS: Tab<MarketingSection>[] = [
  { value: "overview", label: "Overview" },
  { value: "content-calendar", label: "Calendar" },
  { value: "social-media", label: "Social Media" },
  { value: "shopify", label: "Analytics" },
  { value: "photo-share", label: "Photo Share" },
];

const MOBILE_TABS: Tab<MarketingSection>[] = TABS.slice(0, 2);
const MORE_TABS: Tab<MarketingSection>[] = TABS.slice(2);

export default function MarketingPage() {
  const [section, setSection] = useState<MarketingSection>("overview");
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      <PageHeader
        title="Marketing"
        subtitle="Measure attention, engagement, and how it converts to sales."
      />

      {/* Mobile nav: first 2 tabs + More button */}
      <div className="md:hidden flex items-center gap-1">
        <TabNav tabs={MOBILE_TABS} active={section} onChange={setSection} />
        <button
          onClick={() => setMoreOpen(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* Desktop nav: all tabs */}
      <div className="hidden md:block">
        <TabNav tabs={TABS} active={section} onChange={setSection} />
      </div>

      {/* Content */}
      <div>
        {section === "overview" && <MarketingOverviewSection />}
        {section === "content-calendar" && <MarketingContentSection />}
        {section === "shopify" && <MarketingShopifySection />}
        {section === "social-media" && <SocialMediaSection />}
        {section === "photo-share" && <MarketingShareSection />}
      </div>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMoreOpen(false)}
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-3 space-y-1">
              {MORE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setSection(tab.value);
                    setMoreOpen(false);
                  }}
                  className="w-full rounded-lg px-4 py-3 text-left text-sm hover:bg-gray-50 transition"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
