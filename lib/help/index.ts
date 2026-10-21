import type { UserRole } from "@/components/UserContext";
import { getAllowedPaths, navSections } from "@/components/navConfig";
import type { GuideEntry } from "./types";
import { coreGuide } from "./sections/core";
import { catalogSalesGuide } from "./sections/catalogSales";
import { storefrontsGuide } from "./sections/storefronts";
import { emailGuide } from "./sections/email";
import { marketingSystemGuide } from "./sections/marketingSystem";

/**
 * The in-app user guide: one entry per page, written for staff. It's the
 * knowledge the Help assistant (lib/assistant/helpAgent.ts) answers from.
 *
 * Keep it current: when you change what a page does, update its entry in
 * lib/help/sections/* in the same commit — the assistant can only be as right
 * as this guide.
 */
export const GUIDE: GuideEntry[] = [
  ...coreGuide,
  ...catalogSalesGuide,
  ...storefrontsGuide,
  ...emailGuide,
  ...marketingSystemGuide,
];

export type { GuideEntry };

/** Strip [dynamic] segments and #fragments so "/customers/[id]" → "/customers". */
function routeBase(path: string): string {
  return path.split("#")[0].split("/[")[0] || "/";
}

function canSee(allowed: string[], path: string): boolean {
  const base = routeBase(path);
  return allowed.some((p) => base === p || base.startsWith(p + "/"));
}

/** Guide entries for the pages this role can actually open. */
export function guideForRole(role: UserRole): GuideEntry[] {
  const allowed = getAllowedPaths(role);
  return GUIDE.filter((g) => canSee(allowed, g.path));
}

/** The sidebar as this role sees it — "Section → Page (/path)" lines. */
export function sitemapForRole(role: UserRole): string {
  const lines: string[] = [];
  for (const s of navSections) {
    const items = s.items.filter((i) => !i.roles || i.roles.includes(role));
    if (!items.length) continue;
    lines.push(`${s.label || "(top)"}: ${items.map((i) => `${i.label} (${i.href})`).join(", ")}`);
  }
  lines.push("User menu (top-right avatar): Settings (/settings), Help & User Guide (/help)");
  return lines.join("\n");
}

/**
 * The guide entry for the page the user is looking at, matching dynamic
 * segments: "/customers/123" → the "/customers/[id]" entry. Longest match wins.
 */
export function guideForPath(pathname: string): GuideEntry | null {
  const segs = pathname.split("?")[0].split("/").filter(Boolean);
  let best: GuideEntry | null = null;
  let bestLen = -1;
  for (const g of GUIDE) {
    if (g.path.includes("#")) continue;
    const gs = g.path.split("/").filter(Boolean);
    if (gs.length > segs.length) continue;
    const ok = gs.every((s, i) => s.startsWith("[") || s === segs[i]);
    // Exact-length matches beat prefix matches.
    const score = ok ? gs.length * 2 + (gs.length === segs.length ? 1 : 0) : -1;
    if (score > bestLen) {
      best = g;
      bestLen = score;
    }
  }
  return best;
}
