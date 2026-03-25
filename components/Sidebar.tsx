"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  GripVertical,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { useRef, useCallback, useEffect, useState } from "react";
import { getNavForRole, type NavSection } from "./navConfig";
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
  const sections = getNavForRole(profile?.access ?? null);
  const dragRef = useRef<boolean>(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  /* Track which sections are open — auto-open section containing active page */
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  // Auto-open the section that contains the current route
  useEffect(() => {
    for (const section of sections) {
      if (!section.label) continue;
      const hasActive = section.items.some((item) => isActive(item.href));
      if (hasActive) {
        setOpenSections((prev) => {
          if (prev.has(section.label)) return prev;
          const next = new Set(prev);
          next.add(section.label);
          return next;
        });
      }
    }
  }, [pathname, sections.length]);

  function toggleSection(label: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
    if (href === "/customers") return pathname === "/customers" || pathname.startsWith("/customers/[") || (pathname.startsWith("/customers/") && !pathname.startsWith("/customers/d2c"));
    if (href === "/customers/d2c") return pathname === "/customers/d2c" || pathname.startsWith("/customers/d2c/");
    const base = href.split("?")[0];
    if (pathname === base) return true;
    return pathname.startsWith(base + "/");
  }

  function sectionHasActive(section: NavSection) {
    return section.items.some((item) => isActive(item.href));
  }

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col bg-white border-r border-gray-200/80 z-40 select-none"
      style={{
        width: sidebarWidth,
        transition: dragRef.current ? "none" : "width 200ms ease",
      }}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-100 shrink-0">
        {!collapsed && (
          <span className="font-bold tracking-tight text-base bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
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
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {sections.map((section) => {
          const isRoot = !section.label;
          const isOpen = openSections.has(section.label);
          const hasActive = sectionHasActive(section);
          const SectionIcon = section.icon;
          const color = section.color;

          /* ─── Root items (Overview) — no dropdown ─── */
          if (isRoot) {
            return (
              <div key="__root" className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-gray-900 text-white shadow-sm"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          }

          /* ─── Collapsible section ─── */

          /* Collapsed sidebar: show section icon with colored dot */
          if (collapsed) {
            return (
              <div key={section.label} className="py-1">
                <div className="relative flex justify-center">
                  {SectionIcon && (
                    <div
                      className={clsx(
                        "p-2 rounded-lg transition-colors cursor-pointer",
                        hasActive
                          ? `${color?.bg ?? "bg-gray-100"} ${color?.text ?? "text-gray-900"}`
                          : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                      )}
                      title={section.label}
                    >
                      <SectionIcon size={16} />
                    </div>
                  )}
                  {hasActive && (
                    <span className={`absolute -right-0.5 top-0.5 w-1.5 h-1.5 rounded-full ${color?.dot ?? "bg-gray-500"}`} />
                  )}
                </div>
              </div>
            );
          }

          /* Expanded sidebar: collapsible dropdown */
          return (
            <div key={section.label} className="space-y-0.5">
              {/* Section header button */}
              <button
                onClick={() => toggleSection(section.label)}
                className={clsx(
                  "flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-all",
                  hasActive
                    ? `${color?.text ?? "text-gray-900"}`
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {SectionIcon && (
                  <span className={clsx(
                    "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                    hasActive
                      ? `${color?.bg ?? "bg-gray-100"} ${color?.text ?? "text-gray-900"}`
                      : "bg-gray-100 text-gray-400"
                  )}>
                    <SectionIcon size={13} />
                  </span>
                )}
                <span className="flex-1 text-left truncate">{section.label}</span>
                <ChevronDown
                  size={14}
                  className={clsx(
                    "shrink-0 transition-transform duration-200 text-gray-400",
                    isOpen && "rotate-180"
                  )}
                />
              </button>

              {/* Dropdown items */}
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="ml-3 pl-3 border-l-2 border-gray-100 space-y-0.5 pb-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all",
                          active
                            ? `${color?.activeBg ?? "bg-gray-100"} ${color?.text ?? "text-gray-900"} font-semibold`
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        )}
                      >
                        <Icon size={14} className={clsx("shrink-0", active && (color?.text ?? "text-gray-900"))} />
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${color?.dot ?? "bg-gray-500"}`} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info + Logout */}
      <div className="px-2.5 pb-4 shrink-0 border-t border-gray-100 pt-3">
        {!collapsed && profile && (
          <div className="px-2.5 mb-2">
            <div className="text-xs font-medium text-gray-700 truncate">
              {profile.first_name || profile.email}
            </div>
            <div className="text-[11px] text-gray-400 capitalize">{profile.access}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors text-gray-400 hover:bg-red-50 hover:text-red-600 w-full",
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
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize group hover:bg-gray-200/50 transition-colors"
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
