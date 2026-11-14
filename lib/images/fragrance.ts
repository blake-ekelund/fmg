/**
 * Fragrance names as products store them. `inventory_products.fragrance` is a
 * comma-joined list (FragranceMultiSelect); a few rows hold placeholders or
 * internal codes ("N/A", "Complete", "KLM", "SSC/EUC/LAV") that aren't scents.
 * Shared by the Image Library (Collections folders) and fragrance photos.
 */

/** One stored value, if it's a real scent name. */
function realScent(f: string | null | undefined): string | null {
  const s = f?.trim();
  if (!s || /^(n\/a|complete|header|frag free)$/i.test(s) || s.includes("/") || /^[A-Z]{2,4}$/.test(s)) return null;
  return s;
}

/**
 * The scent collection a product's photos file under ("Sea Salt"). Products
 * with several scents keep the whole label (as before), so gift sets don't
 * scatter across every collection.
 */
export function collectionOf(fragrance: string | null): string | null {
  return realScent(fragrance);
}

/** Every real scent in a product's fragrance field ("Eucalyptus, Lavender" → both). */
export function fragrancesOf(fragrance: string | null): string[] {
  return (fragrance ?? "")
    .split(",")
    .map((s) => realScent(s))
    .filter((s): s is string => !!s);
}

/** Case-insensitive: does this product's fragrance field include `scent`? */
export function hasFragrance(fragrance: string | null, scent: string): boolean {
  const want = scent.trim().toLowerCase();
  return fragrancesOf(fragrance).some((s) => s.toLowerCase() === want);
}
