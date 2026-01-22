"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { navItems } from "./navConfig";
import { accentBg } from "./navConfig";

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden relative">
      {/* Top bar */}
      <div className="h-16 px-6 border-b border-gray-200 flex items-center justify-between bg-white">
        <span className="font-semibold tracking-tight text-lg">
          FMG
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="text-gray-600 hover:text-black transition"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Menu */}
      {open && (
        <div className="absolute top-16 left-0 w-full bg-white border-b border-gray-200 z-50">
          <nav className="px-6 py-8 space-y-8">
            {navItems.map((item) => {
                const Icon = item.icon;
                return (
                    <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="group block"
                    >
                    <div className="flex items-center gap-4">
                        <span className="text-gray-500 group-hover:text-black transition">
                        <Icon size={18} />
                        </span>
                        <span className="text-lg font-medium text-gray-700 group-hover:text-black transition">
                        {item.label}
                        </span>
                    </div>

                    <div
                        className={clsx(
                        "mt-3 h-[2px] w-10 rounded-full opacity-0 group-hover:opacity-100 transition",
                        accentBg[item.accent]
                        )}
                    />
                    </Link>
                );
                })}
          </nav>
        </div>
      )}
    </div>
  );
}
