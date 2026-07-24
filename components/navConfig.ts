import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Users,
  ShoppingBag,
  Megaphone,
  KanbanSquare,
  PackageSearch,
  Hash,
  FileText,
  CalendarDays,
  ImageIcon,
  Tag,
  Archive,
  BarChart3,
  Zap,
  Mail,
  Filter,
  MessageSquare,
  UserCheck,
  Globe,
  TicketPercent,
  Activity,
  Receipt,
  Contact,
  BookOpen,
  Target,
  Eye,
  Layers,
  LayoutTemplate,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "./UserContext";

/* ---------------------------
   Types
--------------------------- */
export type NavSection = {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If set, only these roles can see this item. If omitted, visible to all. */
  roles?: UserRole[];
};

/** Roles that can see everything */
const FULL_ACCESS: UserRole[] = ["owner", "admin", "user"];

/* ---------------------------
   Navigation Structure

   Sections group by *what the page is about*, not by which team owns it.
   Labels are unique across the whole tree — if two pages would read the
   same at a glance (e.g. the wholesale customer list vs. wholesale signup
   applications), the label says which one it is.
--------------------------- */
export const navSections: readonly NavSection[] = [
  {
    label: "",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        roles: FULL_ACCESS,
      },
      {
        label: "Task List",
        href: "/task-list",
        icon: KanbanSquare,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      {
        label: "Wholesale",
        href: "/customers",
        icon: Users,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "D2C",
        href: "/customers/d2c",
        icon: ShoppingBag,
        roles: [...FULL_ACCESS, "sales"],
      },
    ],
  },
  {
    label: "Catalog",
    icon: PackageSearch,
    items: [
      {
        label: "Products",
        href: "/products",
        icon: PackageSearch,
        roles: FULL_ACCESS,
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: Boxes,
        roles: FULL_ACCESS,
      },
    ],
  },
  {
    label: "Sales",
    icon: TrendingUp,
    items: [
      {
        label: "Sales Analysis",
        href: "/sales",
        icon: TrendingUp,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Shopify Analytics",
        href: "/shopify-analytics",
        icon: BarChart3,
        roles: [...FULL_ACCESS, "sales"],
      },
    ],
  },
  {
    // Admin panel for the Sassy + Natural Inspirations storefronts
    // (sassyandco.com / naturalinspirations.com).
    label: "Storefronts",
    icon: Globe,
    items: [
      {
        label: "Storefront Orders",
        href: "/storefronts/purchases",
        icon: Receipt,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Discount Codes",
        href: "/storefronts/discounts",
        icon: TicketPercent,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        // Pre-purchase reviews of the storefront itself, traded for a reward
        // code in the cart. Not product reviews.
        label: "Site Feedback",
        href: "/storefronts/feedback",
        icon: MessageSquare,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        // Wholesale signup applications awaiting approval — *not* the
        // wholesale customer list under Customers.
        label: "Wholesale Applications",
        href: "/storefronts/partners",
        icon: UserCheck,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Web Analytics",
        href: "/storefronts/analytics",
        icon: Activity,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
    ],
  },
  {
    label: "Email",
    icon: Mail,
    items: [
      {
        label: "Email Templates",
        href: "/email-templates",
        icon: FileText,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        /* The block-based builder — header/hero/product/button layouts that
           render to real email HTML. Labelled "Designed" to separate it from
           "Email Templates" above, which is the plain-text snippet library;
           the two are different tables and different send paths, and the
           compose modal uses the same word for this mode. */
        label: "Designed Templates",
        href: "/templates",
        icon: LayoutTemplate,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        label: "Automations",
        href: "/automations",
        icon: Zap,
        roles: ["owner", "admin", "marketing"],
      },
      {
        label: "Cohort Results",
        href: "/automations/cohorts",
        icon: Layers,
        roles: ["owner", "admin", "marketing"],
      },
      /* "Workflows" used to sit here, but it was a design prototype: its flow
         definitions were a hardcoded array held in component state, so edits
         vanished on refresh and nothing it described was ever sent. Sitting in
         the Email section next to the real thing, it read as a second, live
         sequence builder. Automations is the engine; its editor now carries
         the step model Workflows was mocking up. The route still resolves for
         anyone holding a link — see EXTRA_ALLOWED below. */
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    items: [
      {
        label: "Funnel",
        href: "/marketing/funnel",
        icon: Filter,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        label: "Social Media",
        href: "/social-media",
        icon: Hash,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Blog Posts",
        href: "/blog-posts",
        icon: FileText,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Promotions",
        href: "/promotions",
        icon: Tag,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Content Calendar",
        href: "/content-calendar",
        icon: CalendarDays,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Competitors",
        href: "/marketing/competitors",
        icon: Target,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Customer Feedback",
        href: "/marketing/customer-feedback",
        icon: MessageSquare,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Asset Library",
        href: "/assets",
        icon: ImageIcon,
        roles: [...FULL_ACCESS, "marketing"],
      },
      {
        label: "Archives",
        href: "/archives",
        icon: Archive,
        roles: [...FULL_ACCESS, "marketing"],
      },
    ],
  },
  {
    label: "Team",
    icon: Contact,
    items: [
      {
        label: "Rep Directory",
        href: "/sales-team",
        icon: Contact,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Sales Hub",
        href: "/sales-hub",
        icon: BookOpen,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        // Read-only look at the external rep portal, scoped to a chosen rep.
        // Admin-only: it renders another user's view of the data.
        label: "Rep Portal Preview",
        href: "/sales-team/portal-preview",
        icon: Eye,
        roles: ["owner", "admin"],
      },
    ],
  },
];

/** Filter nav sections for a given role */
export function getNavForRole(role: UserRole | null): NavSection[] {
  if (!role) return [];

  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Every nav destination — used to stop a parent path swallowing a child. */
const ALL_NAV_HREFS: string[] = navSections.flatMap((s) =>
  s.items.map((i) => i.href.split("?")[0])
);

/**
 * Whether a nav item points at the page currently being viewed.
 *
 * Most items match on prefix so drill-downs keep their parent lit, but the
 * overlapping customer routes need explicit handling: /customers would
 * otherwise swallow /customers/d2c and light up both rows at once.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/customers")
    return (
      pathname === "/customers" ||
      (pathname.startsWith("/customers/") && !pathname.startsWith("/customers/d2c"))
    );
  if (href === "/customers/d2c")
    return pathname === "/customers/d2c" || pathname.startsWith("/customers/d2c/");
  const base = href.split("?")[0];
  if (pathname === base) return true;
  if (!pathname.startsWith(base + "/")) return false;

  /* Prefix matching keeps drill-downs lit under their parent (/sales-team/<id>
     → Rep Directory), but it must yield when a MORE SPECIFIC nav destination
     owns the path. Without this, /sales-team/portal-preview lights up both
     Rep Directory and Rep Portal Preview at once. */
  return !ALL_NAV_HREFS.some(
    (other) =>
      other.length > base.length &&
      (pathname === other || pathname.startsWith(other + "/"))
  );
}

/** The section containing the active page, if any. Root items have no label. */
export function activeSectionLabel(
  sections: NavSection[],
  pathname: string
): string | null {
  const match = sections.find(
    (s) => s.label && s.items.some((i) => isNavItemActive(pathname, i.href))
  );
  return match?.label ?? null;
}

/** Default landing page per role */
export function getDefaultRoute(role: UserRole | null): string {
  if (role === "rep") return "/portal";
  if (role === "sales") return "/customers";
  if (role === "marketing") return "/social-media";
  return "/dashboard";
}

/**
 * Paths reachable outside the sidebar (e.g. user dropdown, drill-downs, and
 * legacy aliases). Listed here so the route guard doesn't bounce users away
 * from them. Each entry may carry its own role gate, mirroring NavItem.roles.
 */
const EXTRA_ALLOWED: ReadonlyArray<{ href: string; roles?: UserRole[] }> = [
  { href: "/settings" }, // every signed-in user
  { href: "/integrations", roles: ["owner", "admin"] }, // admin-only integrations + upload history
  { href: "/data", roles: ["owner", "admin"] }, // legacy alias → redirects to /integrations
  { href: "/partners", roles: [...FULL_ACCESS, "sales"] }, // legacy alias → redirects to /storefronts/partners
  { href: "/fishbowl-sandbox", roles: ["owner", "admin"] }, // internal Fishbowl API scratch page
  // Retired from the nav (prototype, not a live sender) but still reachable so
  // existing links and the manual enrollment tracker don't 404.
  { href: "/workflows", roles: ["owner", "admin", "marketing"] },
  // Rep portal, reachable by admins only as the embedded read-only preview
  // behind /sales-team/portal-preview. Reps get their own allow-list below.
  { href: "/portal", roles: ["owner", "admin"] },
  // Reached from inside another page rather than the sidebar:
  // (/templates moved into the Email section as "Designed Templates")
  { href: "/marketing", roles: [...FULL_ACCESS, "marketing"] }, // legacy tabbed marketing page
  { href: "/amazon-payments", roles: ["owner", "admin"] }, // placeholder, spec TBD
];

/** Get all allowed href paths for a role (used for route guarding) */
export function getAllowedPaths(role: UserRole | null): string[] {
  if (!role) return [];
  // External reps live entirely inside the isolated /portal surface and must
  // never reach any internal page. The portal supplies its own nav/chrome.
  if (role === "rep") return ["/portal"];
  const navAllowed = navSections
    .flatMap((s) => s.items)
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => item.href);
  const extraAllowed = EXTRA_ALLOWED
    .filter((e) => !e.roles || e.roles.includes(role))
    .map((e) => e.href);
  return [...navAllowed, ...extraAllowed];
}

/* Flat list for MobileNav */
export const navItems: readonly NavItem[] = navSections.flatMap(
  (s) => s.items
);
