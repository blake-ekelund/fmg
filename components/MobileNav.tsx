"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { navItems, accentBg } from "./navConfig";

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Top bar — ALWAYS ABOVE CONTENT */}
      <div className="fixed top-0 inset-x-0 z-50 h-16 px-6 border-b border-gray-100 bg-white flex items-center justify-between">
        <span className="font-semibold tracking-tight text-lg">
          FMG
        </span>

        <button
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
          className="text-gray-600 hover:text-black transition"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="fixed inset-0 top-16 z-40 bg-white overflow-y-auto">
          <nav className="px-6 py-8 space-y-4">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="group block"
                >
                  <div className="flex items-center gap-4 py-3">
                    <span className="text-gray-500 group-hover:text-black transition">
                      <Icon size={20} />
                    </span>
                    <span className="text-lg font-medium text-gray-700 group-hover:text-black transition">
                      {item.label}
                    </span>
                  </div>

                  <div
                    className={clsx(
                      "mt-2 h-[2px] w-10 rounded-full opacity-0 group-hover:opacity-100 transition",
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
