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
  if (pathname.startsWith("/sales-team/")) return "Rep Detail";
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
      <header className="sticky top-0 z-30 hidden md:flex items-center justify-between h-14 px-6 bg-surface/85 backdrop-blur-md border-b border-line">
        {/* Left: page title */}
        <h1 className="text-[15px] font-semibold text-ink tracking-tight">
          {title}
        </h1>

        {/* Right: global actions */}
        <div className="flex items-center gap-3">
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:border-line-strong bg-surface-muted border border-line transition"
          >
            <Search size={14} />
            <span className="hidden lg:inline">Search…</span>
            <kbd className="hidden lg:inline-flex items-center rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle ml-4">
              ⌘K
            </kbd>
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-line" />

          {/* Brand toggle */}
          <div className="flex gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            {BRAND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setBrand(opt.value)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  brand === opt.value
                    ? "bg-surface text-brand-700 shadow-card"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-line" />

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
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-surface-muted transition"
        aria-label="Open user menu"
      >
        <div className="h-7 w-7 rounded-full bg-brand-700 text-white text-[11px] font-semibold flex items-center justify-center ring-1 ring-brand-900/10">
          {initials}
        </div>
        <ChevronDown size={12} className="text-ink-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface shadow-overlay z-40 overflow-hidden">
          {profile && (
            <div className="flex items-center gap-2.5 px-3 py-3 border-b border-line bg-surface-muted">
              <div className="h-8 w-8 rounded-full bg-brand-700 text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink truncate">
                  {profile.first_name || profile.email}
                </div>
                <div className="text-[11px] text-ink-muted truncate">
                  {profile.email}
                </div>
              </div>
            </div>
          )}
          <div className="p-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink transition"
            >
              <Settings size={14} className="text-ink-subtle" />
              Settings
            </Link>
            {isAdmin && (
              <Link
                href="/integrations"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink transition"
              >
                <Blocks size={14} className="text-ink-subtle" />
                Integrations
              </Link>
            )}
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink transition border-t border-line"
          >
            <LogOut size={14} className="text-ink-subtle" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
