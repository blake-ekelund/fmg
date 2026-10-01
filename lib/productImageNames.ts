/**
 * Human names for product photos, shared by the Image Library and the rep
 * portal so a photo reads the same everywhere.
 */

export const BRAND_PRODUCT_NAMES: Record<string, string> = {
  Sassy: "Sassy Products",
  NI: "Natural Inspirations Products",
};

/** "Sassy" → "Sassy + Co", "NI" → "Natural Inspirations". */
export const BRAND_NAMES: Record<string, string> = {
  Sassy: "Sassy + Co",
  NI: "Natural Inspirations",
};

/**
 * A product's name: "Bath + Shower Gel · Grapefruit". Drops the " l Sassy + Co"
 * brand tail and adds the fragrance — many products share a display name and
 * differ only by scent.
 */
export function productName(displayName: string | null, fragrance: string | null, part: string): string {
  const base = (displayName ?? "").replace(/\s+[l|]\s+Sassy \+ Co\s*$/i, "").trim() || part;
  const scent = fragrance?.trim();
  // Skip placeholders and internal codes ("N/A", "Complete", "KLM", "SSC/EUC/LAV").
  const realScent =
    scent && !/^(n\/a|complete|header)$/i.test(scent) && !/^[A-Z]{2,4}$/.test(scent) && !scent.includes("/");
  return realScent && !base.toLowerCase().includes(scent.toLowerCase()) ? `${base} · ${scent}` : base;
}
