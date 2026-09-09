import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bring archived marketplace orders back onto the Purchases page.
 *
 * Archiving is how a finished order leaves the page (migration
 * 20260909000000). The restore is deliberately not a button: an order belongs
 * on the page exactly when the marketplace still calls it open, and a sync is
 * the moment we learn that. So every import clears `archived_at` on the refs it
 * just pulled, and an archived-but-still-live order reappears on the next Sync.
 *
 * It comes back as the SAME row — which is the point. Deleting and re-importing
 * would produce a row with no `fishbowl_entered_at`, and the estimate sweep
 * would push an order that is already in Fishbowl. Restoring in place keeps the
 * Fishbowl stamp, so a restored order is only ever re-pushed if it genuinely
 * never made it.
 *
 * Returns how many rows were actually un-archived. Degrades to 0 (never throws)
 * until the migration is pushed.
 */
export async function unarchiveOpenOrders(
  admin: SupabaseClient,
  source: "faire" | "markettime",
  refs: string[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const { data, error } = await admin
    .from("orders")
    .update({ archived_at: null })
    .eq("source", source)
    .in("external_ref", refs)
    .not("archived_at", "is", null)
    .select("id");
  if (error) {
    if (/archived_at|schema cache/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return (data ?? []).length;
}
