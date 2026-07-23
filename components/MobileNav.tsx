"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  X,
  Settings,
  LogOut,
  Blocks,
  Search,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import {
  getNavForRole,
  isNavItemActive,
  activeSectionLabel,
  type NavItem,
} from "./navConfig";
import Logo from "./ui/Logo";
import { useUser } from "./UserContext";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** A search hit keeps its section label so results stay unambiguous flattened. */
type SearchHit = { item: NavItem; sectionLabel: string };

const ROW =
  "flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useUser();
  const navSections = getNavForRole(profile?.access ?? null);
  const isAdmin = profile?.access === "owner" || profile?.access === "admin";
  const searchRef = useRef<HTMLInputElement>(null);

  async function logout() {
    setOpen(false);
    await supabaseBrowser().auth.signOut();
    router.replace("/auth/sign-in");
  }

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Every time the menu opens, start clean: search cleared and only the
     section holding the current page expanded. Reaching for the menu is
     almost always the start of a new errand, not a resumption of the last. */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const active = activeSectionLabel(navSections, pathname);
    setOpenSections(new Set(active ? [active] : []));
    // Deliberately not autofocusing the search field — on a phone that throws
    // up the keyboard and buries the very list the user came to look at.
  }, [open, pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleSection(label: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  /* Search flattens the whole tree — with ~26 destinations, typing beats
     drilling for anyone who already knows where they're going. */
  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchHit[] = [];
    for (const section of navSections) {
      for (const item of section.items) {
        const haystack = `${item.label} ${section.label}`.toLowerCase();
        if (haystack.includes(q)) {
          out.push({ item, sectionLabel: section.label });
        }
      }
    }
    return out;
  }, [query, navSections]);

  const searching = query.trim().length > 0;

  function renderItem(item: NavItem, sectionLabel?: string) {
    const Icon = item.icon;
    const active = isNavItemActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={clsx(
          ROW,
          "relative",
          active
            ? "bg-white/12 text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500" />
        )}
        <Icon size={18} strokeWidth={active ? 2.2 : 1.6} className="shrink-0" />
        <span className="truncate">{item.label}</span>
        {sectionLabel && (
          <span className="ml-auto shrink-0 pl-2 text-[11px] font-normal text-white/35">
            {sectionLabel}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-50 h-16 px-5 bg-brand-900 flex items-center justify-between">
        <Logo inverse size={28} />

        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="fixed inset-0 top-16 z-40 bg-brand-900 overflow-y-auto overscroll-contain">
          <nav className="px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {/* Search */}
            <div className="relative mb-4">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu…"
                aria-label="Search menu"
                autoComplete="off"
                className="w-full rounded-lg bg-white/8 py-3 pl-9 pr-9 text-[15px] text-white placeholder:text-white/40 outline-none focus:bg-white/12 focus:ring-1 focus:ring-white/25"
              />
              {searching && (
                <button
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* ── Search results ── */}
            {searching && (
              <div className="space-y-0.5">
                {hits.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[14px] text-white/40">
                    No pages match “{query.trim()}”.
                  </p>
                ) : (
                  hits.map(({ item, sectionLabel }) =>
                    renderItem(item, sectionLabel || undefined)
                  )
                )}
              </div>
            )}

            {/* ── Browse tree ── */}
            {!searching && (
              <div className="space-y-1">
                {navSections.map((section) => {
                  /* Root items (Dashboard, Task List) have no section label and
                     stay permanently visible — they're the common destinations. */
                  if (!section.label) {
                    return (
                      <div key="__root" className="space-y-0.5 pb-1">
                        {section.items.map((item) => renderItem(item))}
                      </div>
                    );
                  }

                  const expanded = openSections.has(section.label);
                  const hasActive = section.items.some((i) =>
                    isNavItemActive(pathname, i.href)
                  );
                  const SectionIcon = section.icon ?? section.items[0].icon;

                  return (
                    <div key={section.label}>
                      <button
                        onClick={() => toggleSection(section.label)}
                        aria-expanded={expanded}
                        className={clsx(
                          ROW,
                          "w-full text-left",
                          hasActive
                            ? "text-white"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <SectionIcon
                          size={18}
                          strokeWidth={hasActive ? 2.2 : 1.6}
                          className="shrink-0"
                        />
                        <span className="truncate">{section.label}</span>
                        {hasActive && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                        )}
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          <span className="text-[12px] font-normal text-white/30">
                            {section.items.length}
                          </span>
                          <ChevronRight
                            size={15}
                            className={clsx(
                              "text-white/40 transition-transform duration-150",
                              expanded && "rotate-90"
                            )}
                          />
                        </span>
                      </button>

                      {expanded && (
                        <div className="mt-0.5 space-y-0.5 pb-1 pl-4">
                          {section.items.map((item) => renderItem(item))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Account footer */}
            <div className="mt-4 pt-4 border-t border-white/10 space-y-0.5">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={clsx(ROW, "text-white/70 hover:bg-white/10 hover:text-white")}
              >
                <Settings size={18} strokeWidth={1.6} />
                <span>Settings</span>
              </Link>
              {isAdmin && (
                <Link
                  href="/integrations"
                  onClick={() => setOpen(false)}
                  className={clsx(ROW, "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <Blocks size={18} strokeWidth={1.6} />
                  <span>Integrations</span>
                </Link>
              )}
              <button
                onClick={logout}
                className={clsx(
                  ROW,
                  "w-full text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <LogOut size={18} strokeWidth={1.6} />
                <span>Log out</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
