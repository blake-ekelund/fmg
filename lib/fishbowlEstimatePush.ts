import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { createEstimate } from "@/lib/fishbowl";
import { estimateRowsForOrder } from "@/lib/fishbowlEstimate";
import {
  getSynapseInventoryRows,
  rollUpSynapseInventory,
  synapseConfigured,
  type SynapseItemStock,
} from "@/lib/pointb";
import { checkStock, stockHoldMessage, type StockCheck } from "@/lib/orderStockCheck";
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
  /** The QuickBooks class the estimate booked under (the customer's own). */
  qbClass: string | null;
  /** The Point B stock check that let it through, when one ran. */
  stock?: StockCheck;
};

/** Thrown instead of pushing when Point B can't fill the order. Carries the
 *  detail so the route can render it and offer the override. */
export class StockHoldError extends Error {
  readonly check: StockCheck;
  constructor(check: StockCheck) {
    super(stockHoldMessage(check));
    this.name = "StockHoldError";
    this.check = check;
  }
}

/**
 * Synapse's whole stock list, cached for the process.
 *
 * The sweep pushes orders one at a time in a loop, and a fresh login + full
 * inventory pull per order would turn a 20-order run into 20 round trips to
 * the WMS for the same answer. Two minutes is short enough that a push is
 * never deciding on yesterday's shelf, and long enough to cover one sweep.
 */
const STOCK_TTL_MS = 2 * 60_000;
let stockCache: { at: number; taken: string; stock: Map<string, SynapseItemStock> } | null = null;

async function synapseStock(): Promise<{ stock: Map<string, SynapseItemStock>; taken: string } | null> {
  if (!synapseConfigured()) return null;
  if (stockCache && Date.now() - stockCache.at < STOCK_TTL_MS) {
    return { stock: stockCache.stock, taken: stockCache.taken };
  }
  const rows = await getSynapseInventoryRows();
  const stock = rollUpSynapseInventory(rows);
  const taken = new Date().toISOString();
  stockCache = { at: Date.now(), taken, stock };
  return { stock, taken };
}

/** Drop the cached snapshot — used by tests and by a forced re-check. */
export function clearStockCache(): void {
  stockCache = null;
}

/**
 * Throws with a human-readable message when the order can't/shouldn't be
 * pushed (cancelled, already entered, no line items, no Point B stock,
 * Fishbowl error). On success the order is stamped like the manual "Mark in
 * Fishbowl" action (fishbowl_entered_at/by) plus fishbowl_estimate_num/_at
 * when those columns exist, and its "Enter into Fishbowl" task is cleared.
 */
export async function pushOrderEstimate(
  admin: SupabaseClient,
  order: StorefrontOrder,
  customerName: string,
  enteredBy: string,
  opts: {
    /**
     * Push even though Point B is short. A person decided the order goes in
     * anyway (stock lands tomorrow, it ships short, the count is wrong) — the
     * check still runs and is still recorded, it just stops being a veto.
     */
    ignoreStock?: boolean;
  } = {},
): Promise<PushEstimateResult> {
  if (order.status === "cancelled") {
    throw new Error("Order is cancelled — not pushing it to Fishbowl.");
  }
  if (order.fishbowl_entered_at) {
    throw new Error("Order is already marked as entered into Fishbowl.");
  }
  // Marketplace policy (Blake, 2026-08-25): Faire/MarketTime orders auto-push
  // again, now that territory comes off the customer record and payment terms
  // off the order rather than both being hardcoded to house defaults. The one
  // rule that never relaxed: a marketplace order books ONLY under its matched
  // or assigned real customer, never under the pilot/storefront customer.
  const isMarketplace = order.source === "faire" || order.source === "markettime";
  if (isMarketplace && !order.fishbowl_customer?.trim()) {
    throw new Error(
      "No Fishbowl customer matched/assigned for this marketplace order — assign one first.",
    );
  }

  // UPCs ride at the end of each line's description so ops sees the barcode
  // on the SO without opening the product record.
  const upcByPart = await upcsForParts((order.items ?? []).map((it) => it.part));
  const payload = estimateRowsForOrder(order, customerName, upcByPart);

  // Point B stock gate. It runs INSIDE createEstimate (via preflight) because
  // only there are the kits expanded into the parts Point B actually holds —
  // and it runs after the dedupe read, so an order already in Fishbowl is
  // never held back over stock it no longer needs.
  let stock: StockCheck | undefined;
  const preflight = async (lines: Array<{ part: string; quantity: number }>) => {
    const snapshot = await synapseStock().catch(() => null);
    // No Point B credentials, or the WMS is down. A warehouse we cannot reach
    // is not a reason to stop entering orders — that would make Synapse a
    // single point of failure for the whole order pipeline.
    if (!snapshot) return;
    stock = checkStock(lines, snapshot.stock, { checkedAt: snapshot.taken });
    if (stock.blocking.length > 0 && !opts.ignoreStock) throw new StockHoldError(stock);
  };

  // soNum comes back from Fishbowl (auto-numbered); the storefront ref rides
  // as Customer PO and is the dedupe key. Marketplace orders also dedupe on
  // their bare display id — ops hand-keys Faire orders with that as the PO.
  const { soId, soNum, created, qbClass } = await createEstimate(
    payload.poNum,
    customerName,
    payload.rows,
    {
      ...(isMarketplace && order.external_ref
        ? { dedupeContains: order.external_ref }
        : {}),
      // A MarketTime PO is the retailer's own number, not a unique id — see
      // fishbowlCustomerPo(). The recordID above stays the unique key.
      dedupeExactScopedToCustomer: order.source === "markettime",
      preflight,
    },
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
    .update({
      ...baseStamp,
      fishbowl_estimate_num: soNum,
      fishbowl_estimate_at: now,
      // A push that went out over a stock hold is the one a human most wants
      // to find again later; clear the column otherwise so it always reads as
      // "the state of the last push".
      fishbowl_stock_hold:
        stock && stock.blocking.length > 0 ? stockHoldMessage(stock) : null,
    })
    .eq("id", order.id);
  if (updateError) {
    ({ error: updateError } = await admin
      .from("orders")
      .update({ ...baseStamp, fishbowl_estimate_num: soNum, fishbowl_estimate_at: now })
      .eq("id", order.id));
  }
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

  return { soNum, soId, created, qbClass, stock };
}

/**
 * Record a stock hold on the order so it is visible on the Orders page rather
 * than only in a cron's JSON. Silent no-op until the column exists.
 */
export async function recordStockHold(
  admin: SupabaseClient,
  orderId: string,
  check: StockCheck,
): Promise<void> {
  await admin
    .from("orders")
    .update({ fishbowl_stock_hold: stockHoldMessage(check) })
    .eq("id", orderId);
}
