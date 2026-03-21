"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  PackageSearch,
  Users,
  CheckSquare,
  ArrowRight,
  CornerDownLeft,
  FileText,
  Hash,
  LayoutDashboard,
  Boxes,
  TrendingUp,
  Building,
  KanbanSquare,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { LucideIcon } from "lucide-react";

/* ─── Types ─── */

type ResultCategory = "pages" | "products" | "customers" | "tasks";

type SearchResult = {
  id: string;
  category: ResultCategory;
  title: string;
  subtitle?: string;
  href: string;
  icon: LucideIcon;
  meta?: string; // e.g. brand badge
};

type CategoryMeta = {
  label: string;
  icon: LucideIcon;
};

const CATEGORY_META: Record<ResultCategory, CategoryMeta> = {
  pages: { label: "Pages", icon: LayoutDashboard },
  products: { label: "Products", icon: PackageSearch },
  customers: { label: "Customers", icon: Users },
  tasks: { label: "Tasks", icon: CheckSquare },
};

/* ─── Static page results ─── */

const PAGE_RESULTS: SearchResult[] = [
  { id: "p-overview", category: "pages", title: "Overview", subtitle: "Dashboard home", href: "/dashboard", icon: LayoutDashboard },
  { id: "p-products", category: "pages", title: "Product List", subtitle: "View and manage all products", href: "/products", icon: PackageSearch },
  { id: "p-inventory", category: "pages", title: "Inventory", subtitle: "Forecast and current stock", href: "/inventory", icon: Boxes },
  { id: "p-customers", category: "pages", title: "Customer List", subtitle: "View all customers", href: "/customers", icon: Users },
  { id: "p-sales", category: "pages", title: "Sales Analysis", subtitle: "Revenue and trend data", href: "/sales", icon: TrendingUp },
  { id: "p-marketing", category: "pages", title: "Social Media", subtitle: "Content calendar and planning", href: "/marketing", icon: Hash },
  { id: "p-tasks", category: "pages", title: "Task List", subtitle: "Manage workspace tasks", href: "/task-list", icon: KanbanSquare },
  { id: "p-company", category: "pages", title: "Company", subtitle: "Company information", href: "/company", icon: Building },
  { id: "p-docs", category: "pages", title: "Docs", subtitle: "Documentation and guides", href: "/docs", icon: FileText },
];

/* ─── Component ─── */

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dbResults, setDbResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  /* Focus input when opening */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setDbResults([]);
      // Small delay to let the DOM render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /* DB search with debounce */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setDbResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const results: SearchResult[] = [];

      // Search products
      const { data: products } = await supabase
        .from("inventory_products")
        .select("part, display_name, brand, fragrance")
        .or(
          `part.ilike.%${q}%,display_name.ilike.%${q}%,fragrance.ilike.%${q}%`
        )
        .limit(6);

      if (products) {
        products.forEach((p) =>
          results.push({
            id: `prod-${p.part}`,
            category: "products",
            title: p.display_name ?? p.part,
            subtitle: [p.part, p.fragrance].filter(Boolean).join(" · "),
            href: `/products/${encodeURIComponent(p.part)}`,
            icon: PackageSearch,
            meta: p.brand,
          })
        );
      }

      // Search customers
      const { data: customers } = await supabase
        .from("customer_summary")
        .select("customerid, name, channel, bill_to_state")
        .or(`name.ilike.%${q}%,customerid.ilike.%${q}%`)
        .limit(6);

      if (customers) {
        customers.forEach((c) =>
          results.push({
            id: `cust-${c.customerid}`,
            category: "customers",
            title: c.name ?? c.customerid,
            subtitle: [c.channel, c.bill_to_state]
              .filter(Boolean)
              .join(" · "),
            href: `/customers`,
            icon: Users,
          })
        );
      }

      // Search tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, name, status, owner")
        .ilike("name", `%${q}%`)
        .limit(4);

      if (tasks) {
        tasks.forEach((t) =>
          results.push({
            id: `task-${t.id}`,
            category: "tasks",
            title: t.name,
            subtitle: [t.status, t.owner].filter(Boolean).join(" · "),
            href: `/task-list`,
            icon: CheckSquare,
          })
        );
      }

      setDbResults(results);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  /* Combine page + DB results */
  const allResults = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Filter pages
    const pages =
      q.length === 0
        ? PAGE_RESULTS
        : PAGE_RESULTS.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.subtitle?.toLowerCase().includes(q)
          );

    return [...pages, ...dbResults];
  }, [query, dbResults]);

  /* Group by category */
  const grouped = useMemo(() => {
    const map = new Map<ResultCategory, SearchResult[]>();
    const order: ResultCategory[] = ["pages", "products", "customers", "tasks"];
    order.forEach((cat) => map.set(cat, []));

    allResults.forEach((r) => {
      const arr = map.get(r.category);
      if (arr) arr.push(r);
    });

    // Remove empty groups
    return order
      .filter((cat) => (map.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, [allResults]);

  /* Flat list for keyboard navigation */
  const flatItems = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped]
  );

  /* Clamp active index */
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(flatItems.length - 1, 0)));
  }, [flatItems.length]);

  /* Navigate */
  function go(result: SearchResult) {
    onClose();
    router.push(result.href);
  }

  /* Keyboard navigation */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[activeIndex]) {
      e.preventDefault();
      go(flatItems[activeIndex]);
    }
  }

  /* Scroll active item into view */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[70vh]">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, products, customers, tasks…"
            className="flex-1 py-3.5 text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500 shrink-0" />
          )}
          <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {grouped.length === 0 && query.length >= 2 && !loading && (
            <div className="flex flex-col items-center py-10 text-center">
              <Search size={24} className="text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">
                No results found
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </div>
          )}

          {grouped.map((group) => {
            const meta = CATEGORY_META[group.category];
            return (
              <div key={group.category} className="mb-1">
                {/* Category header */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <meta.icon size={12} className="text-gray-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                    {meta.label}
                  </span>
                </div>

                {/* Items */}
                {group.items.map((item) => {
                  flatIdx++;
                  const idx = flatIdx;
                  const isActive = activeIndex === idx;

                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => go(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={clsx(
                        "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-gray-50" : "hover:bg-gray-50/50"
                      )}
                    >
                      {/* Icon */}
                      <div
                        className={clsx(
                          "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                          isActive
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        <item.icon size={14} />
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "text-sm font-medium truncate",
                              isActive ? "text-gray-900" : "text-gray-700"
                            )}
                          >
                            {item.title}
                          </span>
                          {item.meta && (
                            <span
                              className={clsx(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                                item.meta === "NI"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-pink-50 text-pink-600"
                              )}
                            >
                              {item.meta}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Arrow */}
                      {isActive && (
                        <ArrowRight
                          size={14}
                          className="text-gray-400 shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={10} />
            to select
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-mono">↑↓</span>
            to navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-mono">esc</span>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
