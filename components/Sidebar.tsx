"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  GripVertical,
} from "lucide-react";
import clsx from "clsx";
import { useRef, useCallback, useEffect } from "react";
import { getNavForRole } from "./navConfig";
import { useUser } from "./UserContext";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* ---------------------------
   Constants
--------------------------- */
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 64;

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (w: number) => void;
};

export default function Sidebar({
  collapsed,
  onToggle,
  width,
  onWidthChange,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser();
  const { profile } = useUser();
  const sections = getNavForRole(profile?.access ?? "user");
  const dragRef = useRef<boolean>(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
  }

  /* ---- Drag-to-resize ---- */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      onWidthChange(next);
    },
    [onWidthChange]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : width;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    // Strip query params for matching
    const base = href.split("?")[0];
    // Exact match first, then prefix match with trailing slash to avoid
    // /sales matching /sales-hub
    if (pathname === base) return true;
    return pathname.startsWith(base + "/");
  }

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col bg-white border-r border-gray-200 z-40 select-none"
      style={{
        width: sidebarWidth,
        transition: dragRef.current ? "none" : "width 200ms ease",
      }}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-100 shrink-0">
        {!collapsed && (
          <span className="font-semibold tracking-tight text-base">
            FMG
          </span>
        )}
        <button
          aria-label="Toggle sidebar"
          onClick={onToggle}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {sections.map((section) => (
          <div key={section.label || "__root"}>
            {/* Section label */}
            {section.label && !collapsed && (
              <div className="px-2 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                {section.label}
              </div>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-1.5 h-px w-6 bg-gray-200" />
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 shrink-0">
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors text-gray-500 hover:bg-gray-50 hover:text-gray-900 w-full",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>

      {/* Drag handle (only when expanded) */}
      {!collapsed && (
        <div
          onMouseDown={startDrag}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize group hover:bg-accent-gold/30 transition-colors"
          title="Drag to resize"
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={12} className="text-gray-400" />
          </div>
        </div>
      )}
    </aside>
  );
}
