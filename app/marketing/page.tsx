"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

import MarketingOverviewSection from "@/components/marketing/overview/overview";
import MarketingContentSection from "@/components/marketing/content-calendar/index";
import MarketingShopifySection from "@/components/marketing/shopify/shopify";
import MarketingMediaSection from "@/components/marketing/media-kit/page";
import MarketingShareSection from "@/components/marketing/photo-share/page";

type MarketingSection =
  | "overview"
  | "content-calendar"
  | "shopify"
  | "media-kit"
  | "photo-share";

export default function MarketingPage() {
  const [section, setSection] =
    useState<MarketingSection>("overview");

  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="px-4 md:px-8 py-8 md:py-10 space-y-8 md:space-y-10">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Marketing
        </h1>
        <p className="text-sm md:text-base text-gray-500 max-w-xl">
          Measure attention, engagement, and how it converts to sales.
        </p>
      </header>

      {/* ========================= */}
      {/* NAVIGATION                */}
      {/* ========================= */}

      {/* Mobile: Overview / Calendar / More */}
      <nav className="md:hidden relative z-0 mt-2 flex items-center gap-2 border-b border-gray-200 pb-2">
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

        <button
          onClick={() => setMoreOpen(true)}
          className="rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-black hover:bg-gray-50 transition"
        >
          <MoreHorizontal size={18} />
        </button>
      </nav>

      {/* Desktop: full tab set */}
      <nav className="hidden md:flex relative z-0 gap-2 border-b border-gray-200 pb-2">
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

        <TabButton
          active={section === "photo-share"}
          onClick={() => setSection("photo-share")}
        >
          Photo Share
        </TabButton>
      </nav>

      {/* ========================= */}
      {/* CONTENT                   */}
      {/* ========================= */}
      <div className="space-y-12">
        {section === "overview" && <MarketingOverviewSection />}
        {section === "content-calendar" && <MarketingContentSection />}
        {section === "shopify" && <MarketingShopifySection />}
        {section === "media-kit" && <MarketingMediaSection />}
        {section === "photo-share" && <MarketingShareSection />}
      </div>

      {/* ========================= */}
      {/* MOBILE MORE SHEET         */}
      {/* ========================= */}
      {moreOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                More
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-2">
              <MoreItem
                onClick={() => {
                  setSection("shopify");
                  setMoreOpen(false);
                }}
              >
                Analytics
              </MoreItem>

              <MoreItem
                onClick={() => {
                  setSection("media-kit");
                  setMoreOpen(false);
                }}
              >
                Media Kit
              </MoreItem>

              <MoreItem
                onClick={() => {
                  setSection("photo-share");
                  setMoreOpen(false);
                }}
              >
                Photo Share
              </MoreItem>
            </div>
          </div>
        </div>
      )}
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
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-gray-100 text-black"
          : "text-gray-500 hover:text-black hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------
   More Item
--------------------------------------------- */
function MoreItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl px-4 py-3 text-left text-sm hover:bg-gray-50 transition"
    >
      {children}
    </button>
  );
}
