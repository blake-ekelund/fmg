"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export type WidgetTab = {
  label: string;
  content: React.ReactNode;
  badge?: number;
};

type Props = {
  icon: LucideIcon;
  title: string;
  tabs: WidgetTab[];
  defaultTab?: number;
  storageKey: string;
  /** If true, widget starts collapsed on first visit (localStorage overrides) */
  defaultCollapsed?: boolean;
  /** Optional HTML id for scroll-to anchoring */
  id?: string;
};

export default function DashboardWidgetShell({ icon: Icon, title, tabs, defaultTab = 0, storageKey, defaultCollapsed = false, id }: Props) {
  const [active, setActive] = useState(defaultTab);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const showTabs = tabs.length > 1;

  // Persist collapsed state (localStorage takes priority over defaultCollapsed)
  useEffect(() => {
    const saved = localStorage.getItem(`dash-collapse-${storageKey}`);
    if (saved !== null) {
      setCollapsed(saved === "true");
    }
  }, [storageKey]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(`dash-collapse-${storageKey}`, String(next));
  };

  return (
    <div id={id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden scroll-mt-6">
      {/* Header — always visible */}
      <div
        className="flex items-center justify-between flex-wrap gap-3 p-5 cursor-pointer select-none"
        onClick={toggleCollapsed}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <motion.div
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={16} className="text-gray-400" />
          </motion.div>
        </div>

        {showTabs && !collapsed && (
          <div
            className="flex items-center gap-1 bg-gray-100 rounded-lg p-1"
            onClick={(e) => e.stopPropagation()}
          >
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActive(i)}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all relative",
                  active === i
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content — collapsible */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div className="px-5 pb-5">
              {tabs[active]?.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
