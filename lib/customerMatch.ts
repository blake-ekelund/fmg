import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Match an incoming marketplace order (Faire, MarketTime) to an EXISTING
 * customer, so its Fishbowl estimate books under the real account instead of
 * a house/test customer.
 *
 * Matching is deliberately conservative — deterministic signals only:
 *   1. exact email (case-insensitive) — strongest; Faire doesn't expose
 *      retailer emails but MarketTime does;
 *   2. normalized business name — case/punctuation-insensitive, THE and
 *      entity suffixes stripped, & → AND ("The Rebecca Collection" ↔
 *      "REBECCA COLLECTION, THE").
 *
 * The customer base contains duplicate-name groups (13 as of 2026-08 —
 * stale twins like "SUMMER HOUSE, THE" vs "SUMMER HOUSE THE", and genuine
 * different-city namesakes like two GENERAL STOREs). When a name is
 * ambiguous:
 *   a. candidates are filtered to those whose known bill-to/ship-to
 *      city+state matches the order's ship-to;
 *   b. if several survive (true duplicates of one store), the most recently
 *      active one wins;
 *   c. if none survive, NO match — a wrong booking is worse than a flag.
 */

export type CustomerMatch = {
  /** Exact Fishbowl customer name (what createEstimate needs). */
  name: string;
  customerId: string;
  via: "email" | "name" | "name+address";
};

type Candidate = {
  name: string;
  customerId: string;
  cities: Set<string>; // "CITY|ST" keys from billto + shipto
  states: Set<string>;
  lastOrder: string;
  orderCount: number;
};

export type CustomerIndex = {
  byEmail: Map<string, Candidate>;
  byNormName: Map<string, Candidate[]>;
};

/** Normalize a business name for comparison. */
export function normalizeBusinessName(s: string): string {
  return s
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(THE|LLC|INC|LTD|CO|COMPANY|CORP)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const cityKey = (city: unknown, state: unknown): string | null => {
  const c = String(city ?? "").toUpperCase().replace(/[^A-Z ]/g, "").trim();
  const s = String(state ?? "").toUpperCase().trim().slice(0, 2);
  return c && s ? `${c}|${s}` : null;
};

/** Load the whole customer index once per sync run (2.5k rows — cheap). */
export async function loadCustomerIndex(): Promise<CustomerIndex> {
  const byEmail = new Map<string, Candidate>();
  const byNormName = new Map<string, Candidate[]>();
  const { data, error } = await supabaseServer
    .from("customer_contact_summary")
    .select(
      "customerid, customer_name, email, billto_city, billto_state, shipto_city, shipto_state, last_order_date, order_count",
    )
    .limit(10000);
  if (error) {
    console.error("[customer-match] index load failed:", error.message);
    return { byEmail, byNormName };
  }
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const name = String(r.customer_name ?? "").trim();
    const id = String(r.customerid ?? "").trim();
    if (!name || !id) continue;
    const cand: Candidate = {
      name,
      customerId: id,
      cities: new Set(
        [cityKey(r.billto_city, r.billto_state), cityKey(r.shipto_city, r.shipto_state)].filter(
          (k): k is string => k !== null,
        ),
      ),
      states: new Set(
        [r.billto_state, r.shipto_state]
          .map((s) => String(s ?? "").toUpperCase().trim().slice(0, 2))
          .filter(Boolean),
      ),
      lastOrder: String(r.last_order_date ?? ""),
      orderCount: Number(r.order_count ?? 0),
    };
    const norm = normalizeBusinessName(name);
    if (norm) {
      if (!byNormName.has(norm)) byNormName.set(norm, []);
      byNormName.get(norm)!.push(cand);
    }
    const email = String(r.email ?? "").trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, cand);
  }
  return { byEmail, byNormName };
}

export type MatchInput = {
  business_name?: string | null;
  email?: string | null;
  /** Order ship-to, used to disambiguate duplicate-name customers. */
  ship_city?: string | null;
  ship_state?: string | null;
};

/** Match one order's identity fields against the index, or null. */
export function matchCustomer(index: CustomerIndex, order: MatchInput): CustomerMatch | null {
  const email = String(order.email ?? "").trim().toLowerCase();
  if (email) {
    const hit = index.byEmail.get(email);
    if (hit) return { name: hit.name, customerId: hit.customerId, via: "email" };
  }

  const norm = normalizeBusinessName(String(order.business_name ?? ""));
  if (!norm) return null;
  const candidates = index.byNormName.get(norm) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const c = candidates[0];
    return { name: c.name, customerId: c.customerId, via: "name" };
  }

  // Ambiguous name — the order's ship-to must pick a side.
  const orderCity = cityKey(order.ship_city, order.ship_state);
  const orderState = String(order.ship_state ?? "").toUpperCase().trim().slice(0, 2);
  let filtered = orderCity ? candidates.filter((c) => c.cities.has(orderCity)) : [];
  if (filtered.length === 0 && orderState) {
    // City spellings drift; a unique state match is still decisive.
    const stateHits = candidates.filter((c) => c.states.has(orderState));
    if (stateHits.length === 1) filtered = stateHits;
  }
  if (filtered.length === 0) return null; // nothing address-confirmed → flag
  // Several address-confirmed candidates = duplicates of the same store —
  // book under the most recently active twin.
  filtered.sort(
    (a, b) => b.lastOrder.localeCompare(a.lastOrder) || b.orderCount - a.orderCount,
  );
  const c = filtered[0];
  return { name: c.name, customerId: c.customerId, via: "name+address" };
}
