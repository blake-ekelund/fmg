import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a sales order sits, in the terms the business thinks in.
 *
 * Fishbowl's SOSTATUS list is longer and more operational than anyone outside
 * the warehouse needs ("Picked", "Packed", "Closed Short"…). Collapsing it to
 * four stages is what lets the rest of the app ask simple questions — is this
 * order live, is this customer still buying.
 */
export type OrderStage = "estimate" | "open" | "completed" | "cancelled";

export function stageOf(status: string | null | undefined): OrderStage {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "open";
  if (s.includes("estimate") || s.includes("quote")) return "estimate";
  if (s.includes("void") || s.includes("cancel") || s.includes("expired")) {
    return "cancelled";
  }
  if (s.includes("fulfilled") || s.includes("closed") || s.includes("shipped")) {
    return "completed";
  }
  // Entered / Issued / In Progress / Picked / Packed — all still live.
  return "open";
}

/** Stages that mean the customer has live business with us right now. */
export function isLiveStage(status: string | null | undefined): boolean {
  const stage = stageOf(status);
  return stage === "estimate" || stage === "open";
}

/**
 * Customer ids with an estimate or in-flight order.
 *
 * Used to keep a customer out of "at risk"/"churned" purely because their last
 * *completed* order is old — someone with a quote out or an order on the packing
 * bench is plainly still a live account, and chasing them as lapsed is wrong.
 *
 * Anchored on `datecompleted is null`, which is exactly the set of orders
 * Fishbowl hasn't finished: cheap, indexed, and bounded by however many orders
 * are open right now (tens to low hundreds), not by order history. Cancelled
 * and void rows are then dropped by stage.
 */
export async function fetchOpenOrderCustomerIds(
  // Loosely typed so the browser client and the service-role server client
  // can both pass through without dragging generated DB types in here.
  client: Pick<SupabaseClient, "from">,
  opts: { customerIds?: string[] } = {},
): Promise<Set<string>> {
  const out = new Set<string>();

  async function run(ids?: string[]) {
    let q = client
      .from("sales_orders_raw")
      .select("customerid, status")
      .is("datecompleted", null);
    if (ids) q = q.in("customerid", ids);

    const { data, error } = await q;
    // Non-fatal: callers fall back to date-only classification.
    if (error || !data) return;

    for (const row of data as { customerid: string | null; status: string | null }[]) {
      if (row.customerid && isLiveStage(row.status)) out.add(row.customerid);
    }
  }

  if (opts.customerIds && opts.customerIds.length > 0) {
    // Chunked so a large agency can't overflow the request URL.
    const CHUNK = 200;
    for (let i = 0; i < opts.customerIds.length; i += CHUNK) {
      await run(opts.customerIds.slice(i, i + CHUNK));
    }
  } else {
    await run();
  }

  return out;
}
