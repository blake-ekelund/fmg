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
  Inbox,
  Zap,
  Headphones,
  Filter,
  MessageSquare,
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
    label: "Products",
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
      {
        label: "Shopify Analytics",
        href: "/shopify-analytics",
        icon: BarChart3,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Sales Analysis",
        href: "/sales",
        icon: TrendingUp,
        roles: [...FULL_ACCESS, "sales"],
      },
    ],
  },
  {
    label: "Outreach",
    icon: Headphones,
    items: [
      {
        label: "Inbox",
        href: "/inbox",
        icon: Inbox,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        label: "Email Templates",
        href: "/email-templates",
        icon: FileText,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        label: "Automations",
        href: "/automations",
        icon: Zap,
        roles: ["owner", "admin", "marketing"],
      },
      {
        label: "Customer Feedback",
        href: "/marketing/customer-feedback",
        icon: MessageSquare,
        roles: [...FULL_ACCESS, "marketing"],
      },
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

/** Default landing page per role */
export function getDefaultRoute(role: UserRole | null): string {
  if (role === "sales") return "/customers";
  if (role === "marketing") return "/social-media";
  return "/dashboard";
}

/**
 * Paths reachable outside the sidebar (e.g. user dropdown). Listed here so
 * the route guard doesn't bounce users away from them. Each entry may carry
 * its own role gate, mirroring the way NavItem.roles works.
 */
const EXTRA_ALLOWED: ReadonlyArray<{ href: string; roles?: UserRole[] }> = [
  { href: "/settings" }, // every signed-in user
  { href: "/data", roles: ["owner", "admin"] }, // admin-only upload history
];

/** Get all allowed href paths for a role (used for route guarding) */
export function getAllowedPaths(role: UserRole | null): string[] {
  if (!role) return [];
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
