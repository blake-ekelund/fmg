"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auth pages should not use app chrome
  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop sidebar only */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main content wrapper */}
      <div
        className={clsx(
          "flex min-h-screen flex-col transition-all duration-300",

          /* Mobile spacing for fixed header */
          "pt-16 md:pt-0",

          /* Desktop sidebar spacing */
          sidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        {/* Mobile top navigation */}
        <MobileNav />

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
