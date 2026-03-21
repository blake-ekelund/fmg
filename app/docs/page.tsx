import {
  FileText,
  PackageSearch,
  Boxes,
  Users,
  TrendingUp,
  Hash,
  Lightbulb,
  Building,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      {
        title: "Overview Dashboard",
        description:
          "High-level snapshot of sales, inventory, marketing, and customer health across both brands.",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Brand Switcher",
        description:
          "Use the brand toggle in the top-right of every page to filter data by NI, Sassy, or view all brands combined.",
        href: null,
        icon: null,
      },
    ],
  },
  {
    title: "Products & Inventory",
    items: [
      {
        title: "Product List",
        description:
          "Searchable, sortable table of all products. Filter by status (Current/Archived) and sales trend. Click any row to open the product detail page.",
        href: "/products",
        icon: PackageSearch,
      },
      {
        title: "Product Detail",
        description:
          "Edit product details, inventory rules (min/max, lead time, demand), view media kit assets, and see monthly sales analysis with trend indicators.",
        href: null,
        icon: null,
      },
      {
        title: "Inventory",
        description:
          "Forecast tab shows projected stock needs. Current tab displays the latest inventory snapshot with shortage highlighting.",
        href: "/inventory",
        icon: Boxes,
      },
    ],
  },
  {
    title: "Sales & Customers",
    items: [
      {
        title: "Customer List",
        description:
          "View all customers with status badges (Active, At Risk, Churned), channel info, and lifetime revenue. Download customer data as CSV.",
        href: "/customers",
        icon: Users,
      },
      {
        title: "Sales Analysis",
        description:
          "Trailing twelve month (TTM) revenue matrix, stacked bar charts, and treemap visualization of sales by product.",
        href: "/sales",
        icon: TrendingUp,
      },
    ],
  },
  {
    title: "Marketing",
    items: [
      {
        title: "Social Media",
        description:
          "Content calendar for planning posts across Instagram, Facebook, TikTok, and Shopify. Media kit editor for product assets and copy.",
        href: "/marketing",
        icon: Hash,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        title: "Task List",
        description:
          "Lightweight task manager with priority levels, assignees, and status tracking.",
        href: "/task-list",
        icon: Lightbulb,
      },
      {
        title: "Company",
        description: "Company information and settings.",
        href: "/company",
        icon: Building,
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-8 max-w-4xl">
      <PageHeader
        title="Documentation"
        subtitle="Quick reference for all FMG admin features"
      />

      {/* Keyboard shortcuts */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Keyboard Shortcuts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ShortcutRow keys="⌘ K" description="Open global search" />
          <ShortcutRow keys="Esc" description="Close search / modals" />
          <ShortcutRow keys="↑ ↓" description="Navigate search results" />
          <ShortcutRow keys="Enter" description="Select search result" />
        </div>
      </div>

      {/* Page guide sections */}
      {SECTIONS.map((section) => (
        <div key={section.title} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {section.title}
          </h2>

          <div className="grid grid-cols-1 gap-3">
            {section.items.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-4"
              >
                {item.icon && (
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                    <item.icon size={16} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {item.href && (
                  <Link
                    href={item.href}
                    className="flex items-center gap-1 shrink-0 text-xs font-medium text-gray-400 hover:text-gray-700 transition mt-0.5"
                  >
                    Open
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Version info */}
      <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
        FMG Admin &middot; Built with Next.js, Supabase, and Tailwind CSS
      </div>
    </div>
  );
}

function ShortcutRow({
  keys,
  description,
}: {
  keys: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-sm text-gray-600">{description}</span>
      <kbd className="shrink-0 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500 shadow-sm">
        {keys}
      </kbd>
    </div>
  );
}
