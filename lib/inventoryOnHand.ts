/**
 * Which on-hand number the business plans on — shared by the Inventory
 * forecast and the Dashboard's understock/overstock levers so the two always
 * count the same products.
 *
 * Point B is the building, so its AVAILABLE count (physical minus Suspense / QC
 * Hold, stock committed to open orders, and stock already picked for orders)
 * is the source of truth. The Fishbowl snapshot stands in, per part, only when
 * Point B has no comparable number: the part isn't in Synapse at all, or Synapse counts it in a different
 * unit (24 CS is not 24 eaches — planning off it would read as a stock-out that
 * isn't real). Client-safe: the Point B read goes through /api/inventory/variance.
 */

import { supabase } from "@/lib/supabaseClient";
import type { VarianceRow } from "@/lib/inventoryVariance";

export type OnHandSource = "pointb" | "fishbowl";

export type ResolvedOnHand = {
  /** The number to plan on. */
  onHand: number;
  source: OnHandSource;
  /** Point B available, or null when there isn't a comparable one. */
  pointbAvailable: number | null;
  pointbPhysical: number | null;
  pointbHeld: number;
  pointbCommitted: number;
  pointbPicked: number;
  /** Point B physical − Fishbowl on_hand (both totals, the variance report's
   *  rule), or null when not comparable. */
  variance: number | null;
  /** Why the line isn't comparable, when it isn't. */
  note: string | null;
};

export const normPart = (part: string) => part.trim().toUpperCase();

export function resolveOnHand(
  fishbowlOnHand: number | null,
  vr: VarianceRow | undefined,
): ResolvedOnHand {
  const unitClash =
    !!vr && (vr.flags.includes("uom-mismatch") || vr.flags.includes("mixed-uom"));

  if (vr && vr.synapse !== null && !unitClash) {
    // Synapse `available` is sellable only: held, committed and picked are out (lib/pointb.ts rollup).
    const available = vr.synapseAvailable ?? vr.synapse;
    return {
      onHand: available,
      source: "pointb",
      pointbAvailable: available,
      pointbPhysical: vr.synapse,
      pointbHeld: vr.synapseHeld ?? 0,
      pointbCommitted: vr.synapseCommitted ?? 0,
      pointbPicked: vr.synapsePicked ?? 0,
      variance: fishbowlOnHand === null ? null : vr.synapse - fishbowlOnHand,
      note: fishbowlOnHand === null ? "Not in the Fishbowl snapshot" : null,
    };
  }

  return {
    onHand: fishbowlOnHand ?? 0,
    source: "fishbowl",
    pointbAvailable: null,
    pointbPhysical: vr?.synapse ?? null,
    pointbHeld: 0,
    pointbCommitted: 0,
    pointbPicked: 0,
    variance: null,
    note: unitClash
      ? `Units differ — Fishbowl ${vr?.fishbowlUom ?? "?"}, Point B ${vr?.synapseUom ?? "?"}. Forecast uses Fishbowl.`
      : "Not on hand at Point B. Forecast uses Fishbowl.",
  };
}

/**
 * Point B's live rows, keyed by normalized part. Throws on failure so the
 * caller can fall back to Fishbowl and say so. The timeout keeps a hung
 * warehouse read from holding a page in its loading state indefinitely.
 */
export async function fetchPointBRows(timeoutMs = 30_000): Promise<Map<string, VarianceRow>> {
  // Internal API routes authenticate off an Authorization header, not the
  // session cookie.
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/inventory/variance", {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? `Point B read failed (${res.status})`);
    const rows = (json?.rows ?? []) as VarianceRow[];
    return new Map(rows.map((r) => [normPart(r.part), r]));
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("Point B didn't answer in time");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
