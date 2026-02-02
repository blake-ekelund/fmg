"use client";

import { useState } from "react";

import MarketingOverviewSection from "@/components/marketing/overview/overview";
import MarketingContentSection from "@/components/marketing/content-calendar/index";
import MarketingShopifySection from "@/components/marketing/shopify/shopify";
import MarketingMediaSection from "@/components/marketing/media-kit/page";

type MarketingSection =
  | "overview"
  | "content-calendar"
  | "create"
  | "shopify"
  | "media-kit";

export default function MarketingPage() {
  const [section, setSection] =
    useState<MarketingSection>("overview");

  return (
    <div className="px-8 py-10 space-y-10">
      {/* Header + Period Selector */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Marketing
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl">
            Measure attention, engagement, and how it converts to sales.
          </p>
        </div>

      </header>

      {/* Section Tabs */}
      <nav className="flex gap-2 border-b border-gray-200 pb-2">
        <TabButton
          active={section === "overview"}
          onClick={() => setSection("overview")}
        >
          Overview
        </TabButton>

        <TabButton
          active={section === "content-calendar"}
          onClick={() => setSection("content-calendar")}
        >
          Calendar
        </TabButton>

        <TabButton
          active={section === "shopify"}
          onClick={() => setSection("shopify")}
        >
          Analytics
        </TabButton>        
        
        <TabButton
          active={section === "media-kit"}
          onClick={() => setSection("media-kit")}
        >
          Media Kit
        </TabButton>
      </nav>

      {/* Section Content */}
      <div className="space-y-12">
        {section === "overview" && <MarketingOverviewSection />}
        {section === "content-calendar" && <MarketingContentSection />}
        {section === "shopify" && <MarketingShopifySection />}
        {section === "media-kit" && <MarketingMediaSection />}
      </div>
    </div>
  );
}

/* ---------------------------------------------
   Tab Button
--------------------------------------------- */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm transition ${
        active
          ? "bg-gray-100 text-black"
          : "text-gray-500 hover:text-black hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
