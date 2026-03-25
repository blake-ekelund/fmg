import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Users,
  ShoppingBag,
  Megaphone,
  KanbanSquare,
  Building,
  PackageSearch,
  Hash,
  Database,
  Rocket,
  Handshake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "./UserContext";

/* ---------------------------
   Types
--------------------------- */
export type NavSection = {
  label: string;
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
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        roles: FULL_ACCESS,
      },
    ],
  },
  {
    label: "Products",
    items: [
      {
        label: "Product List",
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
        label: "Sales Analysis",
        href: "/sales",
        icon: TrendingUp,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Sales Hub",
        href: "/sales-hub",
        icon: Rocket,
        roles: [...FULL_ACCESS, "sales"],
      },
      {
        label: "Rep Groups",
        href: "/rep-groups",
        icon: Handshake,
        roles: [...FULL_ACCESS, "sales"],
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        label: "Social Media",
        href: "/marketing",
        icon: Hash,
        roles: [...FULL_ACCESS, "marketing"],
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Task List",
        href: "/task-list",
        icon: KanbanSquare,
        roles: [...FULL_ACCESS, "sales", "marketing"],
      },
      {
        label: "Data",
        href: "/data",
        icon: Database,
        roles: FULL_ACCESS,
      },
      {
        label: "Company",
        href: "/company",
        icon: Building,
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

/** Default landing page per role */
export function getDefaultRoute(role: UserRole | null): string {
  if (role === "sales") return "/customers";
  if (role === "marketing") return "/marketing";
  return "/dashboard";
}

/** Get all allowed href paths for a role (used for route guarding) */
export function getAllowedPaths(role: UserRole | null): string[] {
  if (!role) return [];
  return navSections
    .flatMap((s) => s.items)
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => item.href);
}

/* Flat list for MobileNav */
export const navItems: readonly NavItem[] = navSections.flatMap(
  (s) => s.items
);
