"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  GripVertical,
  ChevronRight,
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
const COLLAPSED_WIDTH = 56;

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

  /* Track which sections are open */
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  // Auto-open section containing active page
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
    if (href === "/customers")
      return (
        pathname === "/customers" ||
        (pathname.startsWith("/customers/") && !pathname.startsWith("/customers/d2c"))
      );
    if (href === "/customers/d2c")
      return pathname === "/customers/d2c" || pathname.startsWith("/customers/d2c/");
    const base = href.split("?")[0];
    if (pathname === base) return true;
    return pathname.startsWith(base + "/");
  }

  function sectionHasActive(section: NavSection) {
    return section.items.some((item) => isActive(item.href));
  }

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col bg-[#fafafa] border-r border-gray-200/60 z-40 select-none"
      style={{
        width: sidebarWidth,
        transition: dragRef.current ? "none" : "width 200ms ease",
      }}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between shrink-0">
        {!collapsed && (
          <span className="font-semibold tracking-tight text-[15px] text-gray-900">
            FMG
          </span>
        )}
        <button
          aria-label="Toggle sidebar"
          onClick={onToggle}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5">
        {sections.map((section) => {
          const isRoot = !section.label;
          const isOpen = openSections.has(section.label);
          const hasActive = sectionHasActive(section);

          /* ─── Root items (Overview) — no dropdown ─── */
          if (isRoot) {
            return (
              <div key="__root" className="mb-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-gray-200/70 text-gray-900 font-medium"
                          : "text-gray-500 hover:bg-gray-200/40 hover:text-gray-700"
                      )}
                    >
                      <Icon size={15} className="shrink-0" strokeWidth={active ? 2 : 1.5} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          }

          /* ─── Collapsed sidebar: just show section icon ─── */
          if (collapsed) {
            const SectionIcon = section.icon;
            return (
              <div key={section.label} className="flex justify-center py-0.5">
                {SectionIcon && (
                  <div
                    className={clsx(
                      "p-2 rounded-md transition-colors cursor-pointer",
                      hasActive
                        ? "bg-gray-200/70 text-gray-900"
                        : "text-gray-400 hover:bg-gray-200/40 hover:text-gray-600"
                    )}
                    title={section.label}
                  >
                    <SectionIcon size={15} />
                  </div>
                )}
              </div>
            );
          }

          /* ─── Expanded: collapsible section ─── */
          return (
            <div key={section.label}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.label)}
                className={clsx(
                  "flex items-center gap-1.5 w-full rounded-md px-2 py-[5px] text-[11px] font-medium uppercase tracking-wider transition-colors",
                  hasActive
                    ? "text-gray-500"
                    : "text-gray-400 hover:text-gray-500"
                )}
              >
                <ChevronRight
                  size={11}
                  className={clsx(
                    "shrink-0 transition-transform duration-150",
                    isOpen && "rotate-90"
                  )}
                />
                <span className="truncate">{section.label}</span>
              </button>

              {/* Section items */}
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-150 ease-in-out",
                  isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="space-y-px py-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          "flex items-center gap-2.5 rounded-md px-2 pl-[22px] py-[6px] text-[13px] transition-colors",
                          active
                            ? "bg-gray-200/70 text-gray-900 font-medium"
                            : "text-gray-500 hover:bg-gray-200/40 hover:text-gray-700"
                        )}
                      >
                        <Icon
                          size={14}
                          className="shrink-0"
                          strokeWidth={active ? 2 : 1.5}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-2 pb-3 shrink-0 pt-2 border-t border-gray-200/60">
        {!collapsed && profile && (
          <div className="px-2 py-2">
            <div className="text-[12px] font-medium text-gray-700 truncate">
              {profile.first_name || profile.email}
            </div>
            <div className="text-[11px] text-gray-400 capitalize">{profile.access}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors text-gray-400 hover:bg-gray-200/40 hover:text-gray-600 w-full",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={startDrag}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize group hover:bg-gray-300/40 transition-colors"
          title="Drag to resize"
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={10} className="text-gray-400" />
          </div>
        </div>
      )}
    </aside>
  );
}
