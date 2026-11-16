import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hand-set "On Order" (inventory_on_order_overrides), applied to every new
 * inventory snapshot so a typed figure survives the Fishbowl sync and manual
 * uploads. See migration 20261116000000_inventory_on_order_overrides.sql.
 *
 * Call on the snapshot items BEFORE inserting them. Each overridden part gets
 * the typed units, and the override row records Fishbowl's own figure from this
 * pull (so a reset can put it back). If the table doesn't exist yet the items
 * pass through untouched: a sync must never fail over this.
 */
export async function applyOnOrderOverrides<T extends { part: string; on_order: number }>(
  sb: SupabaseClient,
  items: T[],
): Promise<T[]> {
  const { data, error } = await sb.from("inventory_on_order_overrides").select("part, units");
  if (error || !data?.length) return items;

  const byPart = new Map(data.map((r) => [String(r.part), Number(r.units)]));
  const seen: { part: string; fishbowl_on_order: number }[] = [];
  const out = items.map((it) => {
    const units = byPart.get(it.part);
    if (units === undefined) return it;
    seen.push({ part: it.part, fishbowl_on_order: it.on_order });
    return { ...it, on_order: units };
  });

  // Best effort: keep Fishbowl's figure current for the reset button.
  for (const s of seen) {
    await sb
      .from("inventory_on_order_overrides")
      .update({ fishbowl_on_order: s.fishbowl_on_order })
      .eq("part", s.part);
  }
  return out;
}
