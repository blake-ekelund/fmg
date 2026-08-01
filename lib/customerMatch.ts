import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Match an incoming marketplace order (Faire, MarketTime) to an EXISTING
 * customer, so its Fishbowl estimate books under the real account instead of
 * a house/test customer.
 *
 * Matching is deliberately conservative — only two deterministic signals, in
 * precedence order:
 *   1. exact email (case-insensitive) — strongest; Faire doesn't expose
 *      retailer emails but MarketTime will;
 *   2. normalized business name — case/punctuation-insensitive, leading/
 *      trailing THE and entity suffixes stripped, & → AND. Handles the
 *      "The Rebecca Collection" ↔ "REBECCA COLLECTION, THE" family.
 * Anything fuzzier (phone fragments, similar-but-not-equal names) does NOT
 * match — a wrong booking is worse than a flagged order.
 *
 * The source list is customer_contact_summary (the Fishbowl sales-sync view),
 * so names are Fishbowl's own. createEstimate() still requires an exact
 * active-customer match at push time, so a stale name fails loudly there
 * rather than booking wrong.
 */

export type CustomerMatch = {
  /** Exact Fishbowl customer name (what createEstimate needs). */
  name: string;
  customerId: string;
  via: "email" | "name";
};

export type CustomerIndex = {
  byEmail: Map<string, CustomerMatch>;
  byNormName: Map<string, CustomerMatch>;
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

/** Load the whole customer index once per sync run (2.5k rows — cheap). */
export async function loadCustomerIndex(): Promise<CustomerIndex> {
  const byEmail = new Map<string, CustomerMatch>();
  const byNormName = new Map<string, CustomerMatch>();
  const { data, error } = await supabaseServer
    .from("customer_contact_summary")
    .select("customerid, customer_name, email")
    .limit(10000);
  if (error) {
    console.error("[customer-match] index load failed:", error.message);
    return { byEmail, byNormName };
  }
  for (const r of (data ?? []) as Array<{ customerid: unknown; customer_name: unknown; email: unknown }>) {
    const name = String(r.customer_name ?? "").trim();
    const id = String(r.customerid ?? "").trim();
    if (!name || !id) continue;
    const norm = normalizeBusinessName(name);
    if (norm && !byNormName.has(norm)) byNormName.set(norm, { name, customerId: id, via: "name" });
    const email = String(r.email ?? "").trim().toLowerCase();
    // Emails can be shared across accounts (reps, house addrs) — first wins,
    // ties are rare and the name fallback usually agrees.
    if (email && !byEmail.has(email)) byEmail.set(email, { name, customerId: id, via: "email" });
  }
  return { byEmail, byNormName };
}

/** Match one order's identity fields against the index, or null. */
export function matchCustomer(
  index: CustomerIndex,
  order: { business_name?: string | null; email?: string | null },
): CustomerMatch | null {
  const email = String(order.email ?? "").trim().toLowerCase();
  if (email) {
    const hit = index.byEmail.get(email);
    if (hit) return { ...hit, via: "email" };
  }
  const norm = normalizeBusinessName(String(order.business_name ?? ""));
  if (norm) {
    const hit = index.byNormName.get(norm);
    if (hit) return { ...hit, via: "name" };
  }
  return null;
}
