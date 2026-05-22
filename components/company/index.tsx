"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import clsx from "clsx";

import TeamSection from "./team/TeamSection";
import PlatformsSection from "./platform/PlatformsSection";
import IntegrationsSection from "./integrations/IntegrationsSection";

type CompanyTab = "team" | "platforms" | "integrations";

const TABS: { value: CompanyTab; label: string }[] = [
  { value: "team", label: "Team" },
  { value: "platforms", label: "Platforms & Logins" },
  { value: "integrations", label: "Integrations" },
];

function isCompanyTab(v: string | null): v is CompanyTab {
  return v === "team" || v === "platforms" || v === "integrations";
}

export default function CompanyPage() {
  const params = useSearchParams();
  const initialTab = isCompanyTab(params.get("tab")) ? (params.get("tab") as CompanyTab) : "team";
  const [tab, setTab] = useState<CompanyTab>(initialTab);

  // Pick up tab changes if the user lands here from another page with ?tab=…
  useEffect(() => {
    const t = params.get("tab");
    if (isCompanyTab(t)) setTab(t);
  }, [params]);

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
        {tab === "integrations" && <IntegrationsSection />}
      </div>
    </div>
  );
}
