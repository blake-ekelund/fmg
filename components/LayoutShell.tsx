"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import TopBar from "@/components/TopBar";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths, getDefaultRoute } from "@/components/navConfig";

const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 224; // ~w-56

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname.startsWith("/auth");
  const { profile, loading } = useUser();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  /* ---- Route guard: redirect restricted roles to their allowed pages ---- */
  useEffect(() => {
    if (isAuthRoute || loading || !profile) return;

    const allowed = getAllowedPaths(profile.access);
    // Check if current path starts with any allowed path
    const isAllowed = allowed.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    if (!isAllowed) {
      router.replace(getDefaultRoute(profile.access));
    }
  }, [pathname, profile, loading, isAuthRoute, router]);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  /* Block render until profile is loaded — prevents nav flash */
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50/60">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      </div>
    );
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
