import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { faireConfigured, getFaireOrders, type FaireOrder } from "@/lib/faire";
import { loadCustomerIndex, matchCustomer } from "@/lib/customerMatch";
import { expandTesterLines, resolveTesterParts } from "@/lib/faireTester";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/faire-order-sync
 *
 * Pulls the brand's open Faire marketplace orders into the `orders` table so
 * they join the SAME pipeline as storefront orders: they appear in the
 * Purchases admin, the estimate-sweep cron pushes them into Fishbowl (Customer
 * PO = <displayId>-FAIRE, the convention Fishbowl history already uses), and
 * tracking-sync picks up their shipments.
 *
 * Shape decisions:
 *  - source='faire', external_ref=displayId — the unique index on
 *    (source, external_ref) makes re-runs idempotent forever.
 *  - store='faire' — deliberately NOT 'sassy': the storefront email notify
 *    map has no 'faire' entry, so shipped/delivered customer emails no-op.
 *    Faire owns retailer communication; we must not email around them.
 *  - channel='wholesale', payment_status='paid' — Faire guarantees payment,
 *    and the estimate sweep auto-pushes wholesale orders.
 *  - Testers get their own line. Faire flags them on the regular product line
 *    (includes_tester + tester_price_cents) instead of sending a line, so
 *    lib/faireTester.ts expands them onto the real Fishbowl tester part
 *    (110-00-05 → 110-01-05). Fix-forward only: already-imported orders keep
 *    their original short lines, because ops hand-keyed most of them into
 *    Fishbowl WITH the testers and a backfill would double-count.
 *
 * No-ops cleanly (with a note) until FAIRE_ACCESS_TOKEN and the source/
 * external_ref migration are in place, so it can ship dark.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user. ?dry=1 reports
 * what would be imported without writing.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!faireConfigured()) {
    return NextResponse.json({
      imported: [],
      note: "FAIRE_ACCESS_TOKEN isn't set — Faire sync is dark.",
    });
  }
  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  let faireOrders: FaireOrder[];
  try {
    faireOrders = await getFaireOrders();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (faireOrders.length === 0) {
    return NextResponse.json({ checked: 0, imported: [], dry });
  }

  // Which are already in? One query on the dedupe key.
  const refs = faireOrders.map((o) => o.displayId);
  const { data: existing, error: exErr } = await admin
    .from("orders")
    .select("external_ref")
    .eq("source", "faire")
    .in("external_ref", refs);
  if (exErr) {
    if (/source|external_ref|schema cache/i.test(exErr.message)) {
      return NextResponse.json({
        imported: [],
        note: "orders.source/external_ref missing — push migration 20260801000000.",
      });
    }
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  const seen = new Set((existing ?? []).map((r) => r.external_ref as string));

  // Customer matching: marketplace orders book under their REAL Fishbowl
  // customer when we can identify it (email → normalized business name).
  // No match → fishbowl_customer stays null and the Purchases list flags it.
  const customerIndex = await loadCustomerIndex();

  // Faire flags testers on the regular product line instead of sending them as
  // their own line (lib/faireTester.ts). Resolve every flagged SKU to its
  // Fishbowl tester part up front — one query for the whole batch rather than
  // one per order.
  const fresh = faireOrders.filter((o) => !seen.has(o.displayId));
  const testerParts = await resolveTesterParts(
    admin,
    fresh.flatMap((o) => o.items.filter((it) => it.includesTester).map((it) => it.sku)),
  );

  const imported: Array<Record<string, unknown>> = [];
  const skippedNoSku: Array<Record<string, unknown>> = [];
  const testersUnmapped: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const o of fresh) {
    // Testers become real lines here — one per flagged line, qty 1, at the
    // tester price Faire sent. `subtotal` therefore includes them.
    const expanded = expandTesterLines(o.items, testerParts);
    const items = expanded.items;
    // An order whose items carry no SKUs can't be keyed into Fishbowl —
    // import it anyway (visible in Purchases) but flag it in the report so
    // the SKU mapping gets fixed in Faire. Counted off the Faire items, not
    // the expanded lines, so unmapped testers report separately below.
    const skuless = o.items.filter((it) => !it.sku).length;

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

    const businessName = o.retailerName ?? addr?.company ?? "Faire retailer";
    const match = matchCustomer(customerIndex, {
      business_name: businessName,
      email: null,
      ship_city: addr?.city ?? null,
      ship_state: addr?.state ?? null,
    });

    const row: Record<string, unknown> = {
      source: "faire",
      external_ref: o.displayId,
      store: "faire",
      channel: "wholesale",
      status: "new",
      payment_status: "paid",
      payment_terms: "FAIRE",
      business_name: businessName,
      contact_name: addr?.name ?? o.retailerName ?? "Faire retailer",
      email: null, // Faire does not expose retailer emails; comms stay on Faire.
      phone: addr?.phone ?? null,
      ship_to: orderAddress,
      bill_to: orderAddress,
      items,
      // From the expanded lines, so the stored total always equals what the
      // line items add up to — testers included.
      subtotal: expanded.subtotal,
      shipping: 0,
      tax: 0,
      discount: 0,
      total: expanded.subtotal,
      note: `Faire order ${o.displayId} (${o.state}) — imported by faire-order-sync.`,
      fishbowl_customer: match?.name ?? null,
      fishbowl_customer_id: match?.customerId ?? null,
    };

    const testerCount = o.items.filter((it) => it.includesTester).length;

    if (dry) {
      imported.push({
        ref: `${o.displayId}-FAIRE`,
        items: items.length,
        testers: testerCount,
        subtotal: expanded.subtotal,
        customer: match ? `${match.name} (${match.via})` : "NO MATCH",
        dry: true,
      });
      if (expanded.unmapped.length) {
        testersUnmapped.push({ ref: `${o.displayId}-FAIRE`, testers: expanded.unmapped });
      }
      continue;
    }
    let { error } = await admin.from("orders").insert(row);
    if (error && /fishbowl_customer|schema cache/i.test(error.message)) {
      // Customer-mapping migration not pushed yet — import without the stamp.
      delete row.fishbowl_customer;
      delete row.fishbowl_customer_id;
      ({ error } = await admin.from("orders").insert(row));
    }
    if (error) {
      failed.push({ ref: `${o.displayId}-FAIRE`, error: error.message });
      continue;
    }
    imported.push({
      ref: `${o.displayId}-FAIRE`,
      items: items.length,
      testers: testerCount,
      subtotal: expanded.subtotal,
      customer: match ? `${match.name} (${match.via})` : "NO MATCH",
    });
    if (skuless > 0) skippedNoSku.push({ ref: `${o.displayId}-FAIRE`, itemsWithoutSku: skuless });
    // A tester with no Fishbowl part still rides on the order (the dollars are
    // real) but carries no part, so it won't reach the SO. Report it loudly —
    // the fix is a tester part in Fishbowl, not a code change.
    if (expanded.unmapped.length) {
      testersUnmapped.push({ ref: `${o.displayId}-FAIRE`, testers: expanded.unmapped });
    }
  }

  // Self-heal: stamp any previously-imported marketplace order that still has
  // no customer match (covers orders imported before this matcher existed,
  // and re-tries after new customers land in Fishbowl).
  const rematched: Array<Record<string, unknown>> = [];
  if (!dry) {
    const { data: unmatched, error: unErr } = await admin
      .from("orders")
      .select("id, external_ref, business_name, email, ship_to")
      .eq("source", "faire")
      .is("fishbowl_customer", null);
    if (!unErr) {
      for (const o of unmatched ?? []) {
        const shipTo = (o.ship_to ?? {}) as { city?: string | null; state?: string | null };
        const match = matchCustomer(customerIndex, {
          business_name: o.business_name as string | null,
          email: o.email as string | null,
          ship_city: shipTo.city ?? null,
          ship_state: shipTo.state ?? null,
        });
        if (!match) continue;
        const { error: upErr } = await admin
          .from("orders")
          .update({ fishbowl_customer: match.name, fishbowl_customer_id: match.customerId })
          .eq("id", o.id);
        if (!upErr) rematched.push({ ref: `${o.external_ref}-FAIRE`, customer: `${match.name} (${match.via})` });
      }
    }
  }

  return NextResponse.json({
    checked: faireOrders.length,
    imported,
    rematched,
    itemsMissingSku: skippedNoSku,
    testersUnmapped,
    failed,
    dry,
  });
}
