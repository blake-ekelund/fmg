"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

const SIDEBAR_OPEN = 256;   // w-64
const SIDEBAR_CLOSED = 80; // w-20

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <div
        className="flex flex-col min-h-screen transition-[margin-left] duration-300"
        style={{
          marginLeft: sidebarCollapsed
            ? SIDEBAR_CLOSED
            : SIDEBAR_OPEN,
        }}
      >
        <MobileNav />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
