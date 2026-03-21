"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { getNavForRole } from "./navConfig";
import { useUser } from "./UserContext";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const { profile } = useUser();
  const navSections = getNavForRole(profile?.access ?? "user");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-50 h-16 px-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <span className="font-semibold tracking-tight text-base">FMG</span>

        <button
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="fixed inset-0 top-16 z-40 bg-white overflow-y-auto">
          <nav className="px-5 py-6 space-y-5">
            {navSections.map((section) => (
              <div key={section.label || "__root"}>
                {section.label && (
                  <div className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                    {section.label}
                  </div>
                )}

                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-3 text-[15px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
