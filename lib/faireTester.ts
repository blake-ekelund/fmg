/**
 * Faire testers → their own Fishbowl line.
 *
 * Faire NEVER sends a tester as its own line item. It flags the regular
 * product line instead:
 *
 *   { sku: "110-00-05", quantity: 6, price_cents: 1100,
 *     includes_tester: true, tester_price_cents: 550 }
 *
 * Before this module the two tester fields were dropped on the floor, so the
 * tester never reached the order, the subtotal, or the Fishbowl SO — inventory
 * went unrelieved and every affected SO came in short (verified 2026-08-21:
 * 251 testers across 80 of 229 orders in a 90-day window, $898.40).
 *
 * Testers are only the same part number on FAIRE'S side. Fishbowl carries real
 * tester parts and the numbering is mechanical — the middle segment `-00-`
 * becomes `-01-`:
 *
 *   110-00-05  Sea Salt Citrus Hand + Body Lotion
 *   110-01-05  TESTER Hand + Body Lotion
 *
 * The rule ALONE is not safe: `500-00-99` → `500-01-99` is an acrylic Display,
 * and `405-01-90` is Marketing Materials. So a mapped part must also look like
 * a tester in `inventory_products` (see isTesterPart) or we refuse it and
 * report it rather than booking the wrong product.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderLineItem } from "./storefrontOrder";
import type { FaireOrderItem } from "./faire";

/**
 * The candidate Fishbowl tester part for a Faire SKU, or null when the SKU
 * isn't in the `-00-` family at all (the 507-xx-99 acrylic-box kits, 514000,
 * 1100-00-05 / 1110-00-05 — none of which have a tester part today).
 *
 * Candidate only: it still has to survive resolveTesterParts().
 */
export function testerPartFor(sku: string | null | undefined): string | null {
  const s = (sku ?? "").trim();
  if (!s.includes("-00-")) return null;
  // Replace only the FIRST -00- segment; part numbers have at most one.
  return s.replace("-00-", "-01-");
}

/**
 * Does this `inventory_products` row actually represent a tester?
 *
 * `part_type = 'Tester'` is the trustworthy signal. The `is_tester` boolean is
 * stale in the mirror (123-01-01, 124-01-01, 125-01-10, 130-01-05 are all typed
 * Tester but flagged false) so it is deliberately NOT consulted. The
 * display-name fallback catches 110-01-09, which is named "TESTER Hand + Body
 * Lotion" but mistyped 'Regular' in Fishbowl.
 */
function isTesterPart(row: { part_type?: unknown; display_name?: unknown }): boolean {
  if (String(row.part_type ?? "").trim().toLowerCase() === "tester") return true;
  return /^tester\b/i.test(String(row.display_name ?? "").trim());
}

/**
 * Resolve Faire SKUs → confirmed Fishbowl tester parts. One query.
 *
 * Only SKUs that map to a part that EXISTS and reads as a tester come back;
 * everything else is simply absent from the map, and the caller reports it.
 * A DB failure returns an empty map rather than throwing — an unmapped tester
 * is loud (it rides as an unmapped line and shows in the sync report) and that
 * is strictly better than failing the whole order import.
 */
export async function resolveTesterParts(
  admin: SupabaseClient,
  skus: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const candidates = new Map<string, string>(); // testerPart -> sourceSku
  for (const sku of skus) {
    const part = testerPartFor(sku);
    if (part) candidates.set(part, (sku ?? "").trim());
  }
  if (candidates.size === 0) return new Map();

  const { data, error } = await admin
    .from("inventory_products")
    .select("part, part_type, display_name")
    .in("part", Array.from(candidates.keys()));
  if (error) return new Map();

  const out = new Map<string, string>(); // sourceSku -> testerPart
  for (const row of data ?? []) {
    const part = String((row as { part?: unknown }).part ?? "");
    const sourceSku = candidates.get(part);
    if (!sourceSku || !isTesterPart(row)) continue;
    out.set(sourceSku, part);
  }
  return out;
}

export type TesterExpansion = {
  /** Sale lines with each tester inserted directly after its parent line. */
  items: OrderLineItem[];
  /** Sum of every line's total — testers included. */
  subtotal: number;
  /** Testers we could not map to a Fishbowl part; reported by the sync cron. */
  unmapped: Array<{ sku: string | null; expected: string | null; price: number }>;
};

/**
 * Expand Faire's items into order lines, giving every flagged tester its own.
 *
 * ONE tester per flagged line, quantity 1, regardless of the parent line's
 * quantity — `includes_tester` is a per-line boolean, not a count (confirmed
 * by Blake 2026-08-21).
 *
 * The price is always the `tester_price_cents` Faire sent, NEVER computed. It
 * is 50% of the line price almost everywhere, but the 507-xx-99 acrylic-box
 * kits sell at $103.50 with a $2.47 tester — a mini-crème riding along, not a
 * discount — so a "half price" shortcut would silently overcharge by $100.
 *
 * An unmappable tester still becomes a line (the dollars are real and belong in
 * the order total) but carries NO part, which keeps it out of the Fishbowl SO
 * and surfaces it in the sync report. That is deliberate: silently dropping it
 * is the bug this module exists to fix.
 */
export function expandTesterLines(
  faireItems: FaireOrderItem[],
  testerParts: Map<string, string>,
): TesterExpansion {
  const items: OrderLineItem[] = [];
  const unmapped: TesterExpansion["unmapped"] = [];

  for (const it of faireItems) {
    items.push({
      type: "sale",
      part: it.sku ?? undefined,
      name: it.name ?? "Faire item",
      form: it.variant,
      price: it.price,
      quantity: it.quantity,
      total: it.price * it.quantity,
    });
    if (!it.includesTester) continue;

    const sku = it.sku ?? null;
    const part = sku ? testerParts.get(sku) : undefined;
    if (!part) {
      unmapped.push({ sku, expected: testerPartFor(sku), price: it.testerPrice });
    }
    items.push({
      type: "sale",
      part: part ?? undefined,
      name: part ? `TESTER — ${it.name ?? "Faire item"}` : `TESTER (unmapped) — ${it.name ?? "Faire item"}`,
      form: it.variant,
      price: it.testerPrice,
      quantity: 1,
      total: it.testerPrice,
    });
  }

  // line_no is assigned last so testers renumber the lines that follow them.
  items.forEach((it, i) => {
    it.line_no = i + 1;
  });

  return {
    items,
    subtotal: items.reduce((sum, it) => sum + (it.total ?? 0), 0),
    unmapped,
  };
}
