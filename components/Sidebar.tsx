"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import clsx from "clsx";
import { navItems, accentBg } from "./navConfig";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        "hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col border-r border-gray-200 bg-white transition-all duration-300 z-40",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-gray-100">
        {!collapsed && (
          <span className="font-semibold tracking-tight text-lg">
            FMG
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-500 hover:text-black transition"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-8 px-6 space-y-6">
        {navItems.map((item) => (
          <NavItem
            key={item.label}
            {...item}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}

function NavItem({
  label,
  href,
  icon: Icon,
  accent,
  collapsed,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  accent: keyof typeof accentBg;
  collapsed: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <div
        className={clsx(
          "flex items-center gap-3 text-sm font-medium tracking-wide transition text-gray-500 group-hover:text-black",
          collapsed && "justify-center"
        )}
      >
        <span className="opacity-70 group-hover:opacity-100 transition">
          <Icon size={16} />
        </span>
        {!collapsed && <span>{label}</span>}
      </div>

      {!collapsed && (
        <div
          className={clsx(
            "mt-2 h-[2px] w-4 rounded-full opacity-0 group-hover:opacity-100 transition",
            accentBg[accent]
          )}
        />
      )}
    </Link>
  );
}
