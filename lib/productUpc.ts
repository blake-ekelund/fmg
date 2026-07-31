import { supabaseServer } from "@/lib/supabaseServer";

/**
 * UPCs (inventory_products.barcode) keyed by Fishbowl part number, for
 * appending to product descriptions on internal surfaces — the admin order /
 * prebooking views and the Fishbowl estimate import. Deliberately NOT shown
 * to customers on the storefronts.
 *
 * Parts without a barcode are simply absent from the map — callers render
 * nothing rather than a blank "UPC". Lookup failures degrade to an empty map
 * so a hiccup here can never block an order view or an estimate push.
 */
export async function upcsForParts(
  parts: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const uniq = Array.from(
    new Set(parts.filter((p): p is string => !!p && p.trim() !== "" && p !== "—")),
  );
  if (uniq.length === 0) return {};

  const { data, error } = await supabaseServer
    .from("inventory_products")
    .select("part, barcode")
    .in("part", uniq);
  if (error) {
    console.error("[upc] lookup failed:", error.message);
    return {};
  }

  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ part: string; barcode: string | null }>) {
    const b = (r.barcode ?? "").trim();
    if (b) out[r.part] = b;
  }
  return out;
}
