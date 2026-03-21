"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileText } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { navItems } from "./navConfig";
import { useBrand } from "./BrandContext";
import type { BrandFilter } from "@/types/brand";
import CommandPalette from "./CommandPalette";

const BRAND_OPTIONS: { value: BrandFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "NI", label: "NI" },
  { value: "Sassy", label: "Sassy" },
];

/** Derive the page title from the current pathname using navConfig */
function usePageTitle(): string {
  const pathname = usePathname();

  for (const item of navItems) {
    const base = item.href.split("?")[0];
    if (pathname === base) return item.label;
  }

  if (pathname.startsWith("/products/")) return "Product Detail";
  if (pathname.startsWith("/customers/")) return "Customer Detail";
  if (pathname === "/docs") return "Docs";

  const segment = pathname.split("/").filter(Boolean)[0];
  if (segment) return segment.charAt(0).toUpperCase() + segment.slice(1);
  return "FMG";
}

export default function TopBar() {
  const { brand, setBrand } = useBrand();
  const title = usePageTitle();
  const [cmdOpen, setCmdOpen] = useState(false);

  /* ⌘K / Ctrl+K shortcut */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 hidden md:flex items-center justify-between h-14 px-6 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        {/* Left: page title */}
        <h1 className="text-sm font-semibold text-gray-900 tracking-tight">
          {title}
        </h1>

        {/* Right: global actions */}
        <div className="flex items-center gap-3">
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-gray-200 transition"
          >
            <Search size={14} />
            <span className="hidden lg:inline text-gray-400">Search…</span>
            <kbd className="hidden lg:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 ml-3">
              ⌘K
            </kbd>
          </button>

          {/* Docs */}
          <Link
            href="/docs"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
          >
            <FileText size={14} />
            <span className="hidden lg:inline">Docs</span>
          </Link>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Brand toggle */}
          <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {BRAND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setBrand(opt.value)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  brand === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
