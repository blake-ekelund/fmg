/**
 * Shared MarketTime → `orders` import. Extracted from the markettime-order-sync
 * cron so the exact same logic can run from the route, a manual "Sync
 * MarketTime" button, and a one-off backfill script — no divergence.
 *
 * Imports the live open MarketTime orders into the `orders` table so they join
 * the SAME pipeline as Faire + storefront orders (Purchases list, Fishbowl
 * customer match, human-triggered estimate push). It never pushes to Fishbowl
 * and never emails a customer — marketplace orders are import-only here.
 *
 * Shape: source='markettime', external_ref=recordID (unique idx → idempotent),
 * store='markettime', channel='wholesale', payment 'paid'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketTimeOrders } from "./markettime";
import { loadCustomerIndex, matchCustomer } from "./customerMatch";
import { FB_TERMS } from "./fishbowlEstimate";
import { unarchiveOpenOrders } from "./orderArchive";

export type MarketTimeImportResult = {
  checked: number;
  imported: Array<Record<string, unknown>>;
  rematched: Array<Record<string, unknown>>;
  /** Archived orders the marketplace still calls open, brought back onto the
   *  page by this run (see lib/orderArchive.ts). */
  restored: number;
  failed: Array<Record<string, unknown>>;
  /** Orders whose MarketTime payment text couldn't be classified — they book
   *  NET 30 by fallback and want a human eye. */
  termsUnclassified: Array<Record<string, unknown>>;
  dry: boolean;
  note?: string;
};

export async function importMarketTimeOrders(
  admin: SupabaseClient,
  opts: { dry?: boolean } = {},
): Promise<MarketTimeImportResult> {
  const dry = !!opts.dry;

  const orders = await getMarketTimeOrders();
  if (orders.length === 0) {
    return { checked: 0, imported: [], rematched: [], failed: [], termsUnclassified: [], restored: 0, dry };
  }

  const refs = orders.map((o) => o.displayId);
  const { data: existing, error: exErr } = await admin
    .from("orders")
    .select("external_ref")
    .eq("source", "markettime")
    .in("external_ref", refs);
  if (exErr) {
    if (/source|external_ref|schema cache/i.test(exErr.message)) {
      return {
        checked: orders.length,
        imported: [],
        termsUnclassified: [],
        rematched: [],
        failed: [],
        restored: 0,
        dry,
        note: "orders.source/external_ref missing — push migration 20260801000000.",
      };
    }
    throw new Error(exErr.message);
  }
  const seen = new Set((existing ?? []).map((r) => r.external_ref as string));

  // An order the marketplace still calls open belongs on the page, archived or
  // not — restore before the import loop, so a row that is merely archived
  // reappears rather than being skipped as "already seen".
  const restored = dry ? 0 : await unarchiveOpenOrders(admin, "markettime", refs);

  const customerIndex = await loadCustomerIndex();
  const imported: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const termsUnclassified: Array<Record<string, unknown>> = [];

  for (const o of orders) {
    if (seen.has(o.displayId)) continue;

    const items = o.items.map((it, i) => ({
      line_no: i + 1,
      type: "sale",
      part: it.sku ?? undefined,
      name: it.name ?? "MarketTime item",
      form: it.variant,
      price: it.price,
      quantity: it.quantity,
      total: it.price * it.quantity,
    }));

    const addr = o.address;
    const orderAddress = addr
      ? {
          name: addr.name ?? undefined,
          company: addr.company,
          line1: addr.line1 ?? undefined,
          line2: addr.line2,
          city: addr.city ?? undefined,
          state: addr.state ?? undefined,
          postal_code: addr.postal_code ?? undefined,
          country: addr.country,
          phone: addr.phone,
        }
      : null;

    const businessName = o.retailerName ?? addr?.company ?? "MarketTime retailer";
    const match = matchCustomer(customerIndex, {
      business_name: businessName,
      email: o.email, // often null on MarketTime → name + city/state match carries it
      ship_city: addr?.city ?? null,
      ship_state: addr?.state ?? null,
    });

    const row: Record<string, unknown> = {
      source: "markettime",
      external_ref: o.displayId,
      store: "markettime",
      channel: "wholesale",
      status: "new",
      payment_status: "paid",
      // The Fishbowl terms name MarketTime's payment fields resolve to, so the
      // estimate books card orders as CREDIT CARD instead of invoicing money
      // that's already collected. This used to be the literal "MARKETTIME",
      // which matches no Fishbowl payment term at all.
      //
      // An unclassifiable term (classifyMarketTimeTerms returning null) is
      // written as the NET 30 fallback rather than left null, because
      // `orders.payment_terms` is NOT NULL in the live database — the repo
      // migration declares it nullable, so the constraint was added by hand and
      // the code never knew. Inserting null failed the whole row, which meant
      // an order with terms like "See Special Instructions" was rejected on
      // every single poll and simply never arrived: no order in the app, no
      // estimate in Fishbowl, and nothing to see but a line in the `failed`
      // array. MARSHALL RETAIL GROUP and FIRESIDE sat unimported for days that
      // way (Blake, 2026-09-08).
      //
      // NET 30 is not a guess bolted on here — it is exactly what
      // paymentTermsFor() already applies to a blank term, so the estimate
      // books identically either way. The "a human should read this" signal is
      // not lost: it still rides in termsUnclassified and now in the note too.
      payment_terms: o.paymentTerms ?? FB_TERMS.net30,
      // The PO the retailer/rep put on the order. Ops keys THIS into Fishbowl
      // when they enter an order by hand, so it is the second key reconcile
      // matches on — see migration 20260909020000.
      external_po: o.poNumber,
      business_name: businessName,
      contact_name: o.contactName ?? businessName,
      email: o.email,
      phone: addr?.phone ?? null,
      ship_to: orderAddress,
      bill_to: orderAddress,
      items,
      subtotal: o.subtotal,
      shipping: o.shipping,
      tax: 0,
      discount: o.discount,
      total: o.subtotal + o.shipping - o.discount,
      note: `MarketTime order ${o.displayId} (PO ${o.poNumber ?? "—"}, ${o.state}) — imported by markettime sync.${
        o.paymentTerms
          ? ""
          : ` Payment terms unreadable ("${o.paymentTermRaw ?? "blank"}") — booked NET 30 by fallback; confirm before invoicing.`
      }`,
      fishbowl_customer: match?.name ?? null,
      fishbowl_customer_id: match?.customerId ?? null,
    };

    if (dry) {
      imported.push({
        ref: `${o.displayId}-MKTTIME`,
        items: items.length,
        subtotal: o.subtotal,
        customer: match ? `${match.name} (${match.via})` : "NO MATCH",
        terms: o.paymentTerms ?? `? (${o.paymentTermRaw ?? "blank"})`,
        dry: true,
      });
      if (!o.paymentTerms) {
        termsUnclassified.push({ ref: `${o.displayId}-MKTTIME`, raw: o.paymentTermRaw });
      }
      continue;
    }
    // Both column groups are migrations that may not be pushed yet. Drop them
    // and retry rather than losing the order — an order that fails to insert is
    // an order that never arrives, and nothing downstream would say so.
    let { error } = await admin.from("orders").insert(row);
    if (error && /external_po|schema cache/i.test(error.message)) {
      delete row.external_po;
      ({ error } = await admin.from("orders").insert(row));
    }
    if (error && /fishbowl_customer|schema cache/i.test(error.message)) {
      delete row.fishbowl_customer;
      delete row.fishbowl_customer_id;
      ({ error } = await admin.from("orders").insert(row));
    }
    if (error) {
      failed.push({ ref: `${o.displayId}-MKTTIME`, error: error.message });
      continue;
    }
    imported.push({
      ref: `${o.displayId}-MKTTIME`,
      items: items.length,
      subtotal: o.subtotal,
      customer: match ? `${match.name} (${match.via})` : "NO MATCH",
      terms: o.paymentTerms ?? `? (${o.paymentTermRaw ?? "blank"})`,
    });
    if (!o.paymentTerms) {
      termsUnclassified.push({ ref: `${o.displayId}-MKTTIME`, raw: o.paymentTermRaw });
    }
  }

  // Self-heal: stamp any previously-imported unmatched MarketTime order.
  const rematched: Array<Record<string, unknown>> = [];
  if (!dry) {
    const { data: unmatched, error: unErr } = await admin
      .from("orders")
      .select("id, external_ref, business_name, email, ship_to")
      .eq("source", "markettime")
      .is("fishbowl_customer", null);
    if (!unErr) {
      for (const u of unmatched ?? []) {
        const shipTo = (u.ship_to ?? {}) as { city?: string | null; state?: string | null };
        const match = matchCustomer(customerIndex, {
          business_name: u.business_name as string | null,
          email: u.email as string | null,
          ship_city: shipTo.city ?? null,
          ship_state: shipTo.state ?? null,
        });
        if (!match) continue;
        const { error: upErr } = await admin
          .from("orders")
          .update({ fishbowl_customer: match.name, fishbowl_customer_id: match.customerId })
          .eq("id", u.id);
        if (!upErr) rematched.push({ ref: `${u.external_ref}-MKTTIME`, customer: `${match.name} (${match.via})` });
      }
    }
  }

  return { checked: orders.length, imported, rematched, failed, termsUnclassified, restored, dry };
}
