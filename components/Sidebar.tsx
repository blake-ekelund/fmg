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
import { getNavForRole, isNavItemActive, type NavSection } from "./navConfig";
import Logo from "./ui/Logo";
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

  const isActive = useCallback(
    (href: string) => isNavItemActive(pathname, href),
    [pathname]
  );

  function sectionHasActive(section: NavSection) {
    return section.items.some((item) => isActive(item.href));
  }

  /* Sections are open by default — we track the ones the user collapsed, so a
     first load shows the whole tree instead of a stack of shut accordions. */
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());

  // Never leave the section containing the active page collapsed
  useEffect(() => {
    for (const section of sections) {
      if (!section.label) continue;
      const hasActive = section.items.some((item) => isActive(item.href));
      if (hasActive) {
        setClosedSections((prev) => {
          if (!prev.has(section.label)) return prev;
          const next = new Set(prev);
          next.delete(section.label);
          return next;
        });
      }
    }
  }, [pathname, sections.length]);

  function toggleSection(label: string) {
    setClosedSections((prev) => {
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

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col bg-brand-900 z-40 select-none"
      style={{
        width: sidebarWidth,
        transition: dragRef.current ? "none" : "width 200ms ease",
      }}
    >
      {/* Header */}
      <div
        className={clsx(
          "h-14 flex items-center shrink-0 border-b border-white/8",
          collapsed ? "justify-center px-0" : "justify-between px-3"
        )}
      >
        {!collapsed && <Logo inverse size={26} className="min-w-0" />}
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
          className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Navigation */}
      {/* Collapsed mode needs overflow visible so the hover flyouts aren't clipped;
          it's only a column of icons, so it never needs to scroll. */}
      <nav
        className={clsx(
          "nav-rail flex-1 py-2 px-2 space-y-0.5",
          collapsed ? "overflow-visible" : "overflow-y-auto"
        )}
      >
        {sections.map((section) => {
          const isRoot = !section.label;
          const isOpen = !closedSections.has(section.label);
          const hasActive = sectionHasActive(section);

          /* ─── Root items (Overview) — no dropdown ─── */
          if (isRoot) {
            return (
              <div key="__root" className="mb-2 space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-white/12 text-white font-medium"
                          : "text-white/60 hover:bg-white/8 hover:text-white"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500" />
                      )}
                      <Icon size={15} className="shrink-0" strokeWidth={active ? 2.2 : 1.6} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          }

          /* ─── Collapsed sidebar: section icon links to its first page, and
                 hovering reveals the full section as a flyout ─── */
          if (collapsed) {
            const SectionIcon = section.icon ?? section.items[0].icon;
            return (
              <div key={section.label} className="relative group flex justify-center py-0.5">
                <Link
                  href={section.items[0].href}
                  aria-label={section.label}
                  className={clsx(
                    "relative p-2 rounded-lg transition-colors",
                    hasActive
                      ? "bg-white/12 text-white"
                      : "text-white/50 hover:bg-white/8 hover:text-white"
                  )}
                >
                  {hasActive && (
                    <span className="absolute left-[-8px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500" />
                  )}
                  <SectionIcon size={15} />
                </Link>

                {/* Flyout */}
                <div className="absolute left-full top-0 ml-2 hidden group-hover:block z-50 min-w-[190px] rounded-xl border border-line bg-surface shadow-overlay p-1.5">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                    {section.label}
                  </div>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          "flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] transition-colors",
                          active
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
                        )}
                      >
                        <Icon size={14} className="shrink-0" strokeWidth={active ? 2 : 1.5} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
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
                  "flex items-center gap-1.5 w-full rounded-md px-2 py-[6px] text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  hasActive
                    ? "text-white/70"
                    : "text-white/35 hover:text-white/60"
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
                          "relative flex items-center gap-2.5 rounded-lg px-2 pl-[22px] py-[7px] text-[13px] transition-colors",
                          active
                            ? "bg-white/12 text-white font-medium"
                            : "text-white/60 hover:bg-white/8 hover:text-white"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500" />
                        )}
                        <Icon
                          size={14}
                          className="shrink-0"
                          strokeWidth={active ? 2.2 : 1.6}
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

      {/* Logout */}
      <div className="px-2 pb-3 shrink-0 pt-2 border-t border-white/8">
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors text-white/45 hover:bg-white/8 hover:text-white w-full",
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
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize group hover:bg-accent-500/60 transition-colors"
          title="Drag to resize"
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={10} className="text-white/50" />
          </div>
        </div>
      )}
    </aside>
  );
}
