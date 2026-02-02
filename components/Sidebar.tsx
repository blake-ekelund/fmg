"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import clsx from "clsx";
import { navItems, accentBg } from "./navConfig";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export default function Sidebar({ collapsed, onToggle }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
  }

  return (
    <aside
      className={clsx(
        "hidden md:fixed md:inset-y-0 md:left-0 md:flex flex-col bg-white border-r border-gray-100 transition-all duration-300 z-40",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="h-16 px-8 flex items-center justify-between border-b border-gray-100">
        {!collapsed && (
          <span className="font-semibold tracking-tight text-lg">
            FMG
          </span>
        )}
        <button
          aria-label="Toggle sidebar"
          onClick={onToggle}
          className="text-gray-500 hover:text-black transition"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-8 px-6 space-y-6 flex-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <NavItem
              key={item.label}
              {...item}
              collapsed={collapsed}
              active={isActive}
            />
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-6 pb-6">
        <button
          onClick={handleLogout}
          className={clsx(
            "group flex items-center gap-3 text-sm font-medium tracking-wide transition text-gray-500 hover:text-black w-full",
            collapsed && "justify-center"
          )}
        >
          <span className="opacity-70 group-hover:opacity-100 transition">
            <LogOut size={16} />
          </span>
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}

/* -------------------------
   Nav Item
-------------------------- */

function NavItem({
  label,
  href,
  icon: Icon,
  accent,
  collapsed,
  active,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  accent: keyof typeof accentBg;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <div
        className={clsx(
          "flex items-center gap-3 text-sm font-medium tracking-wide transition",
          collapsed && "justify-center",
          "text-gray-500",
          "group-hover:text-black",
          active && "text-black"
        )}
      >
        <span
          className={clsx(
            "transition",
            active
              ? "opacity-100"
              : "opacity-70 group-hover:opacity-100"
          )}
        >
          <Icon size={16} />
        </span>

        {!collapsed && <span>{label}</span>}
      </div>

      {!collapsed && (
        <div
          className={clsx(
            "mt-2 h-[2px] w-4 rounded-full transition",
            active
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
            accentBg[accent]
          )}
        />
      )}
    </Link>
  );
}
