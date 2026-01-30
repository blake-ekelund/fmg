import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Users,
  Megaphone,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ---------------------------
   Types
--------------------------- */
export type Accent =
  | "pink"
  | "green"
  | "orange"
  | "lavender"
  | "yellow"
  | "amber";

export type NavItem = {
  label: string;
  href: string;
  accent: Accent;
  icon: LucideIcon;
};

/* ---------------------------
   Navigation Items
--------------------------- */
export const navItems: readonly NavItem[] = [
  {
    label: "Overview",
    href: "/",
    accent: "pink",
    icon: LayoutDashboard,
  },
  {
    label: "Sales",
    href: "/sales",
    accent: "green",
    icon: TrendingUp,
  },
  {
    label: "Inventory",
    href: "/inventory",
    accent: "orange",
    icon: Boxes,
  },
  {
    label: "Customers",
    href: "/customers",
    accent: "lavender",
    icon: Users,
  },
  {
    label: "Marketing",
    href: "/marketing",
    accent: "yellow",
    icon: Megaphone,
  },
  {
    label: "Task List",
    href: "/task-list",
    icon: Lightbulb,
    accent: "amber", // or whatever fits FMG
  },
] as const;

/* ---------------------------
   Brand Accent System
--------------------------- */
export const accentBg: Record<Accent, string> = {
  pink: "bg-pink-400",
  green: "bg-lime-500",
  orange: "bg-orange-400",
  lavender: "bg-purple-400",
  yellow: "bg-yellow-400",
  amber: "bg-orange-800",
};
