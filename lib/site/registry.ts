/**
 * FMG-only: the editable pages per storefront, for the Website editor and
 * its API. Each store only ships its own list (Sassy: pageDefaults.ts, NI:
 * pageDefaultsNi.ts); FMG knows both.
 */
import { newBlockFor, normalizePageFor, type PageBlock, type PageBlockType, type SitePageDef } from "./pageBlocks";
import { SITE_PAGES } from "./pageDefaults";
import { NI_SITE_PAGES } from "./pageDefaultsNi";

export type SiteBrand = "Sassy" | "NI";

export const SITE_BRANDS: { brand: SiteBrand; label: string; host: string }[] = [
  { brand: "Sassy", label: "Sassy+Co", host: "sassyandco.com" },
  { brand: "NI", label: "Natural Inspirations", host: "naturalinspirations.com" },
];

export function isSiteBrand(v: unknown): v is SiteBrand {
  return v === "Sassy" || v === "NI";
}

export function sitePagesFor(brand: SiteBrand): SitePageDef[] {
  return brand === "NI" ? NI_SITE_PAGES : SITE_PAGES;
}

export function sitePageFor(brand: SiteBrand, slug: string): SitePageDef | undefined {
  return sitePagesFor(brand).find((p) => p.slug === slug);
}

/** Normalized blocks for a brand's page; null for an unknown page or bad input. */
export function normalizeSitePage(brand: SiteBrand, slug: string, input: unknown): PageBlock[] | null {
  const page = sitePageFor(brand, slug);
  return page ? normalizePageFor(page, input) : null;
}

export function siteDefaults(brand: SiteBrand, slug: string): PageBlock[] {
  return sitePageFor(brand, slug)?.defaults ?? [];
}

export function newSiteBlock(brand: SiteBrand, type: PageBlockType, id: string): PageBlock {
  return newBlockFor(type, id, sitePagesFor(brand));
}
