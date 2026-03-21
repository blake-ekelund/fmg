"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import clsx from "clsx";

import TeamSection from "./team/TeamSection";
import PlatformsSection from "./platform/PlatformsSection";

type CompanyTab = "team" | "platforms";

const TABS: { value: CompanyTab; label: string }[] = [
  { value: "team", label: "Team" },
  { value: "platforms", label: "Platforms & Logins" },
];

export default function CompanyPage() {
  const [tab, setTab] = useState<CompanyTab>("team");

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      <PageHeader subtitle="Manage your team and company tools" />

      {/* Tab nav */}
      <nav className="flex gap-1 rounded-lg bg-white border border-gray-200 p-1 max-w-md">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={clsx(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
              tab === t.value
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "team" && <TeamSection />}
        {tab === "platforms" && <PlatformsSection />}
      </div>
    </div>
  );
}
