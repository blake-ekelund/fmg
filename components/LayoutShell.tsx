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
  // Customer-facing public routes — no sidebar / dashboard chrome.
  const isPublicRoute = pathname.startsWith("/quarterly-check-in");
  // External sales-rep portal — its own isolated shell, never the admin chrome.
  const isPortalRoute = pathname.startsWith("/portal");
  const { profile, loading } = useUser();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  /* ---- Route guard: redirect restricted roles to their allowed pages ---- */
  useEffect(() => {
    if (isAuthRoute || isPublicRoute || loading || !profile) return;

    const allowed = getAllowedPaths(profile.access);
    // Check if current path starts with any allowed path
    const isAllowed = allowed.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    if (!isAllowed) {
      router.replace(getDefaultRoute(profile.access));
    }
  }, [pathname, profile, loading, isAuthRoute, router]);

  if (isAuthRoute || isPublicRoute || isPortalRoute) {
    return <>{children}</>;
  }

  /* Block render until profile is loaded — prevents nav flash */
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-line-strong border-t-brand-700 rounded-full animate-spin" />
          <span className="text-sm text-ink-muted">Loading…</span>
        </div>
      </div>
    );
  }

  const marginLeft = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Desktop sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      {/* Main content.

          The sidebar offset must be md-only: the rail itself is `hidden
          md:flex`, so applying the margin unconditionally (as an inline style
          did) shoved every page ~224px off-screen on phones, leaving a sliver
          of usable width. The width rides in on a custom property so the
          md-only utility can consume it. */}
      <div
        className="flex min-h-screen flex-col pt-16 md:pt-0 md:ml-[var(--sidebar-w)]"
        style={
          {
            "--sidebar-w": `${marginLeft}px`,
            transition: "margin-left 200ms ease",
          } as React.CSSProperties
        }
      >
        <MobileNav />
        <TopBar />

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
