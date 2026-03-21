"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import TopBar from "@/components/TopBar";

const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 224; // ~w-56

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  const marginLeft = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <div className="min-h-screen bg-gray-50/60">
      {/* Desktop sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      {/* Main content */}
      <div
        className="flex min-h-screen flex-col pt-16 md:pt-0"
        style={{
          marginLeft: `${marginLeft}px`,
          transition: "margin-left 200ms ease",
        }}
      >
        <MobileNav />
        <TopBar />

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
