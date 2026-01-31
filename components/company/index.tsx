"use client";

import { useState } from "react";

import TeamSection from "./team/TeamSection";
import InvitesSection from "./invites/InvitesSection";
import RolesSection from "./roles/RolesSection";
import PlatformsSection from "./platform/PlatformsSection";

type CompanySection = "team" | "invites" | "roles" | "platforms";

export default function CompanyPage() {
  const [section, setSection] =
    useState<CompanySection>("team");

  return (
    <div className="px-8 py-10 space-y-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Company
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl">
            Manage your team, roles, access, and internal platforms.
          </p>
        </div>
      </header>

      {/* Section Tabs */}
      <nav className="flex gap-2 border-b border-gray-200 pb-2">
        <TabButton
          active={section === "team"}
          onClick={() => setSection("team")}
        >
          Team
        </TabButton>

        <TabButton
          active={section === "invites"}
          onClick={() => setSection("invites")}
        >
          Invites
        </TabButton>

        <TabButton
          active={section === "roles"}
          onClick={() => setSection("roles")}
        >
          Roles & Access
        </TabButton>

        <TabButton
          active={section === "platforms"}
          onClick={() => setSection("platforms")}
        >
          Platforms
        </TabButton>
      </nav>

      {/* Section Content */}
      <div className="space-y-12">
        {section === "team" && <TeamSection />}
        {section === "invites" && <InvitesSection />}
        {section === "roles" && <RolesSection />}
        {section === "platforms" && <PlatformsSection />}
      </div>
    </div>
  );
}

/* ---------------------------------------------
   Tab Button (identical to Inventory/Marketing)
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
