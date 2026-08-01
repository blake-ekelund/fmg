import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { createEstimate } from "@/lib/fishbowl";
import { estimateRowsForOrder } from "@/lib/fishbowlEstimate";
import { upcsForParts } from "@/lib/productUpc";
import { type StorefrontOrder } from "@/lib/storefrontOrder";

/**
 * Push ONE storefront order into Fishbowl as an Estimate and stamp it —
 * the single code path shared by the manual button (POST
 * /api/storefront-orders/[id]/estimate) and the auto-push sweep cron.
 *
 * Server-only (Fishbowl creds + service role). Kept separate from
 * lib/fishbowlEstimate.ts so the row mapping stays pure/importable anywhere.
 */

export type PushEstimateResult = {
  soNum: string;
  soId: number;
  /** False when Fishbowl already had an SO with this number (no re-import). */
  created: boolean;
};

/**
 * Throws with a human-readable message when the order can't/shouldn't be
 * pushed (cancelled, already entered, no line items, Fishbowl error). On
 * success the order is stamped like the manual "Mark in Fishbowl" action
 * (fishbowl_entered_at/by) plus fishbowl_estimate_num/_at when those columns
 * exist, and its "Enter into Fishbowl" task is cleared.
 */
export async function pushOrderEstimate(
  admin: SupabaseClient,
  order: StorefrontOrder,
  customerName: string,
  enteredBy: string,
): Promise<PushEstimateResult> {
  if (order.status === "cancelled") {
    throw new Error("Order is cancelled — not pushing it to Fishbowl.");
  }
  if (order.fishbowl_entered_at) {
    throw new Error("Order is already marked as entered into Fishbowl.");
  }
  // Marketplace pushes are RE-LOCKED (Blake, 2026-08-01, after deleting the
  // first auto-pushed SO): Faire/MarketTime orders import, match, and flag —
  // but do not enter Fishbowl until Blake explicitly re-opens this.
  const isMarketplace = order.source === "faire" || order.source === "markettime";
  if (isMarketplace) {
    throw new Error(
      "Marketplace orders are view-only right now — not pushed to Fishbowl until re-enabled.",
    );
  }

  // UPCs ride at the end of each line's description so ops sees the barcode
  // on the SO without opening the product record.
  const upcByPart = await upcsForParts((order.items ?? []).map((it) => it.part));
  const payload = estimateRowsForOrder(order, customerName, upcByPart);
  // soNum comes back from Fishbowl (auto-numbered); the storefront ref rides
  // as Customer PO and is the dedupe key. Marketplace orders also dedupe on
  // their bare display id — ops hand-keys Faire orders with that as the PO.
  const { soId, soNum, created } = await createEstimate(
    payload.poNum,
    customerName,
    payload.rows,
    isMarketplace && order.external_ref
      ? { dedupeContains: order.external_ref }
      : undefined,
  );

  // Stamp the order. The estimate columns are a fresh migration — fall back
  // to the base stamp until it's pushed.
  const now = new Date().toISOString();
  const baseStamp = {
    fishbowl_entered_at: now,
    fishbowl_entered_by: `${enteredBy} (estimate ${soNum})`,
  };
  let { error: updateError } = await admin
    .from("orders")
    .update({ ...baseStamp, fishbowl_estimate_num: soNum, fishbowl_estimate_at: now })
    .eq("id", order.id);
  if (updateError) {
    ({ error: updateError } = await admin
      .from("orders")
      .update(baseStamp)
      .eq("id", order.id));
  }
  if (updateError) {
    throw new Error(
      `Estimate ${soNum} was created in Fishbowl, but stamping the order failed: ${updateError.message}`,
    );
  }

  // Clear the "Enter into Fishbowl" task immediately (same as the manual path).
  await supabaseServer.from("tasks").delete().eq("fishbowl_order_id", order.id);

  return { soNum, soId, created };
}
