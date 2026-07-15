"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Settings, LogOut, ChevronDown, Blocks } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { navItems } from "./navConfig";
import { useBrand } from "./BrandContext";
import type { BrandFilter } from "@/types/brand";
import CommandPalette from "./CommandPalette";
import { useUser } from "./UserContext";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
  if (pathname === "/customers/d2c") return "D2C Customers";
  if (pathname.startsWith("/customers/")) return "Customer Detail";

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

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* User menu */}
          <UserMenu />
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}

function UserMenu() {
  const { profile } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = profile?.access === "owner" || profile?.access === "admin";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await supabaseBrowser().auth.signOut();
    router.replace("/auth/sign-in");
  }

  const initials = ((profile?.first_name || profile?.email || "?").trim()[0] ?? "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-gray-50 transition"
        aria-label="Open user menu"
      >
        <div className="h-7 w-7 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center">
          {initials}
        </div>
        <ChevronDown size={12} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-40 overflow-hidden">
          {profile && (
            <div className="px-3 py-2.5 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900 truncate">
                {profile.first_name || profile.email}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {profile.email}
              </div>
            </div>
          )}
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <Settings size={14} className="text-gray-400" />
            Settings
          </Link>
          {isAdmin && (
            <Link
              href="/integrations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Blocks size={14} className="text-gray-400" />
              Integrations
            </Link>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition border-t border-gray-100"
          >
            <LogOut size={14} className="text-gray-400" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
