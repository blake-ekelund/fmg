/**
 * Compare a marketplace order against the Fishbowl SO it became.
 *
 * Today nothing does. An order is pushed, `fishbowl_entered_at` is stamped,
 * and the two records are never looked at side by side again — so when they
 * drift apart, they drift apart silently. Reading the last 49 pushed
 * Faire/MarketTime orders against their SOs (2026-09-22) found 24 whose money
 * no longer agreed and several whose lines didn't either: SO 24872 is missing
 * three lines the order still carries and has two the order doesn't, and its
 * Subtotal line sits ABOVE two sale lines — the signature of an import that
 * committed half of itself, or of a person editing afterwards. Either way,
 * nothing said so.
 *
 * Pure functions: both sides are passed in, so the rules are testable without
 * Fishbowl or a marketplace. See docs/fishbowl-marketplace-field-map.md for
 * the field contract and for which divergences are BY DESIGN — this module
 * reports the ones that aren't.
 */

import type { StorefrontOrder } from "./storefrontOrder";

/** The Fishbowl side, as `/api/storefront-orders/[id]/fishbowl-check` reads it. */
export type FishbowlSoSnapshot = {
  num: string;
  customerPO: string | null;
  customerName: string | null;
  /** `qbclass.name` via so.qbClassId. */
  soClass: string | null;
  /** `qbclass.name` via customer.qbClassId — what the class SHOULD be. */
  customerClass: string | null;
  paymentTerms: string | null;
  taxRate: string | null;
  locationGroup: string | null;
  status: string | null;
  salesman: string | null;
  shipToCity: string | null;
  shipToZip: string | null;
  /** so.customFields, raw — searched for the CF-Order Source value. */
  customFields: string | null;
  items: FishbowlSoItem[];
};

export type FishbowlSoItem = {
  lineItem: number | null;
  /** SOITEMTYPE: 10 Sale, 31 Discount, 40 Subtotal, 60 Shipping, 70 Tax, 80 Kit. */
  typeId: number;
  productNum: string | null;
  qtyOrdered: number;
  unitPrice: number;
  totalPrice: number;
  /** `qbclass.name` via soitem.qbClassId. */
  itemClass: string | null;
};

export type DivergenceSeverity =
  /** Money or goods are wrong. Someone has to look. */
  | "error"
  /** Real, but it won't mis-ship or mis-bill on its own. */
  | "warning"
  /** Worth knowing; usually a later human edit in Fishbowl. */
  | "info";

export type Divergence = {
  /** Stable key, so the UI can group and the docs can name one. */
  code: string;
  severity: DivergenceSeverity;
  field: string;
  /** What the marketplace / our order says. */
  expected: string;
  /** What Fishbowl says. */
  actual: string;
  detail: string;
};

const norm = (v: unknown): string => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const money = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;
const fmt = (n: number): string => `$${n.toFixed(2)}`;

/** SOITEMTYPE ids we reason about. */
const TYPE_SALE = 10;
const TYPE_SUBTOTAL = 40;
const TYPE_SHIPPING = 60;

/** A tolerance, not a rounding fix: prices arrive from Faire in cents and from
 *  MarketTime as decimals, so a penny of float drift is not a divergence. */
const CENT = 0.011;

/** What the SO should hold for one part, and where the expectation came from. */
type Expected = {
  qty: number;
  price: number;
  /** True when this part is on the SO because a kit expanded into it. Its
   *  price is then Fishbowl's (`product.price`), not the marketplace's, so
   *  comparing prices on it would report a difference that is meant to exist. */
  fromKit: boolean;
};

/**
 * Every part the SO should end up holding, summed.
 *
 * Two rules, both learned from real orders:
 *
 *  - A KIT is not a line on the finished SO; its components are. `512-03-99`
 *    is one line on the MarketTime order and thirteen on the SO. So an ordered
 *    kit contributes its components at qty × component qty, and disappears.
 *  - The same part can arrive by both routes and must be SUMMED. SO 24787 has
 *    `123-00-04` twice: six ordered loose and six inside a display. Twelve is
 *    correct there, and comparing against the loose six alone reported a
 *    quantity error on a perfectly good order.
 *
 * Placeholder parts (MarketTime's literal "None") are skipped — they are not
 * SKUs, and `isRealPart()` keeps them off the push entirely.
 */
function expectedParts(
  order: StorefrontOrder,
  kitComponents: ReadonlyMap<string, ReadonlyArray<{ part: string; qty: number }>>,
): Map<string, Expected> {
  const out = new Map<string, Expected>();
  const add = (part: string, qty: number, price: number, fromKit: boolean) => {
    const key = norm(part);
    if (!key || key === "NONE" || !(qty > 0)) return;
    const cur = out.get(key);
    if (cur) {
      cur.qty += qty;
      cur.fromKit = cur.fromKit || fromKit;
    } else {
      out.set(key, { qty, price, fromKit });
    }
  };

  for (const it of order.items ?? []) {
    const part = norm(it.part);
    const qty = Number(it.quantity) || 0;
    const comps = kitComponents.get(part);
    if (comps?.length) {
      for (const c of comps) add(c.part, c.qty * qty, 0, true);
    } else {
      add(part, qty, money(it.price), false);
    }
  }
  return out;
}

/** Sale lines on the SO, summed by part. */
function soParts(so: FishbowlSoSnapshot): Map<string, { qty: number; price: number }> {
  const out = new Map<string, { qty: number; price: number }>();
  for (const it of so.items) {
    if (it.typeId !== TYPE_SALE) continue;
    const part = norm(it.productNum);
    if (!part) continue;
    const cur = out.get(part) ?? { qty: 0, price: money(it.unitPrice) };
    cur.qty += Number(it.qtyOrdered) || 0;
    out.set(part, cur);
  }
  return out;
}

/**
 * Compare one order against its SO.
 *
 * `kitComponents` maps a kit part number (UPPERCASE) to the LEAF parts it
 * expands into, with the quantity per one kit — the full closure, so a nested
 * kit resolves to its grandchildren rather than to another kit number. Without
 * it, every kit on an order reads as "line missing from Fishbowl" plus a dozen
 * "line we never ordered", because expansion is exactly what we asked Fishbowl
 * to do (see lib/fishbowlKits.ts). Build it with `loadKitClosure()` +
 * `flattenKit()`; pass an empty map and kits are simply not checked.
 */
export function compareOrderToSo(
  order: StorefrontOrder,
  so: FishbowlSoSnapshot,
  kitComponents: ReadonlyMap<string, ReadonlyArray<{ part: string; qty: number }>> = new Map(),
): Divergence[] {
  const out: Divergence[] = [];
  const add = (d: Divergence) => out.push(d);

  /* ── the QuickBooks class ─────────────────────────────────────────────── */

  if (so.customerClass && norm(so.soClass) !== norm(so.customerClass)) {
    add({
      code: "class-mismatch",
      severity: "error",
      field: "QuickBooks class",
      expected: so.customerClass,
      actual: so.soClass ?? "(none)",
      detail:
        "The SO books under a different class than the customer record carries, so QuickBooks reports this revenue in the wrong bucket.",
    });
  }

  const lineClasses = [...new Set(so.items.filter((i) => i.typeId === TYPE_SALE).map((i) => norm(i.itemClass)))];
  const strayLineClass = lineClasses.filter((c) => c && c !== norm(so.soClass));
  if (strayLineClass.length > 0) {
    add({
      code: "line-class-mismatch",
      severity: "warning",
      field: "QuickBooks class (lines)",
      expected: so.soClass ?? "(none)",
      actual: strayLineClass.join(", "),
      detail: "Line items carry a different class than the SO header.",
    });
  }

  /* ── who and how ─────────────────────────────────────────────────────── */

  const assigned = norm(order.fishbowl_customer);
  if (assigned && so.customerName && assigned !== norm(so.customerName)) {
    add({
      code: "customer-mismatch",
      severity: "error",
      field: "Customer",
      expected: order.fishbowl_customer ?? "",
      actual: so.customerName,
      detail: "The SO is booked to a different Fishbowl customer than the order is matched to.",
    });
  }

  if (order.external_po && !String(so.customerPO ?? "").toUpperCase().includes(norm(order.external_po))) {
    add({
      code: "retailer-po-absent",
      severity: "warning",
      field: "Customer PO",
      expected: order.external_po,
      actual: so.customerPO ?? "(blank)",
      detail:
        "The retailer's own PO is not on the SO — it won't appear on their invoice or packing slip, and a human keying this order would have used it. Expected on anything pushed after 2026-09-22; older SOs carry the marketplace's internal id instead.",
    });
  }

  /* ── the goods ───────────────────────────────────────────────────────── */

  const expected = expectedParts(order, kitComponents);
  const onSo = soParts(so);

  for (const [part, want] of expected) {
    const got = onSo.get(part);
    if (!got) {
      add({
        code: "line-missing",
        severity: "error",
        field: `Line ${part}`,
        expected: `${want.qty} × ${fmt(want.price)}`,
        actual: "(not on the SO)",
        detail: "The order has this line and Fishbowl doesn't — it will not be picked or billed.",
      });
      continue;
    }
    if (got.qty !== want.qty) {
      add({
        code: "line-qty",
        severity: "error",
        field: `Line ${part}`,
        expected: `qty ${want.qty}`,
        actual: `qty ${got.qty}`,
        detail:
          got.qty < want.qty
            ? "Fishbowl is set to ship fewer than the retailer ordered."
            : "Fishbowl is set to ship more than the retailer ordered.",
      });
    }
    // A kit component's price is Fishbowl's own, by design (see B1 in the
    // field map) — there is nothing on the marketplace order to compare it to.
    if (!want.fromKit && Math.abs(got.price - want.price) > CENT) {
      add({
        code: "line-price",
        severity: "error",
        field: `Line ${part}`,
        expected: fmt(want.price),
        actual: fmt(got.price),
        detail: "Unit price on the SO differs from the price the marketplace sold at.",
      });
    }
  }

  for (const [part, got] of onSo) {
    if (expected.has(part)) continue;
    // A kit HEADER line (type 80) is legitimately on the SO as a label over
    // components that are already accounted for.
    if (kitComponents.has(part)) continue;
    add({
      code: "line-extra",
      severity: "warning",
      field: `Line ${part}`,
      expected: "(not on the order)",
      actual: `${got.qty} × ${fmt(got.price)}`,
      detail:
        "Fishbowl has a line the marketplace never sent. Usually a tester or a replacement added by hand — confirm it should be billed.",
    });
  }

  /* ── the money ───────────────────────────────────────────────────────── */

  const saleTotal = money(
    so.items.filter((i) => i.typeId === TYPE_SALE).reduce((s, i) => s + (Number(i.totalPrice) || 0), 0),
  );
  const orderSubtotal = money(order.subtotal);
  // Kit components are priced by Fishbowl and need not add up to the kit's own
  // price, so an order carrying a kit cannot be reconciled on the total alone.
  const hasKit = (order.items ?? []).some((it) => kitComponents.has(norm(it.part)));
  if (!hasKit && orderSubtotal > 0 && Math.abs(saleTotal - orderSubtotal) > CENT) {
    add({
      code: "subtotal-mismatch",
      severity: "error",
      field: "Subtotal",
      expected: fmt(orderSubtotal),
      actual: fmt(saleTotal),
      detail: "The SO's sale lines don't add up to what the marketplace says the order is worth.",
    });
  }

  /* ── shape of the SO ─────────────────────────────────────────────────── */

  const shipping = so.items.filter((i) => i.typeId === TYPE_SHIPPING);
  if (shipping.length > 1) {
    add({
      code: "double-shipping",
      severity: "warning",
      field: "Shipping lines",
      expected: "1",
      actual: String(shipping.length),
      detail:
        "More than one Shipping line. Point B's write-back APPENDS freight rather than replacing it, so a line we sent gets billed on top of the real one.",
    });
  }

  const subtotalLine = so.items.findIndex((i) => i.typeId === TYPE_SUBTOTAL);
  const lastSale = so.items.map((i) => i.typeId).lastIndexOf(TYPE_SALE);
  if (subtotalLine >= 0 && lastSale > subtotalLine) {
    add({
      code: "lines-after-subtotal",
      severity: "warning",
      field: "Line order",
      expected: "Subtotal last",
      actual: `sale line at ${lastSale + 1}, subtotal at ${subtotalLine + 1}`,
      detail:
        "Sale lines sit below the Subtotal line, so the subtotal doesn't cover them. This is what a part-committed import or a later hand edit looks like.",
    });
  }

  const isMarketplace = order.source === "faire" || order.source === "markettime";
  if (isMarketplace && norm(so.taxRate) && !["NONE", "(NONE)"].includes(norm(so.taxRate))) {
    add({
      code: "tax-rate",
      severity: "warning",
      field: "Tax rate",
      expected: "None",
      actual: so.taxRate ?? "",
      detail: "Faire and MarketTime remit sales tax themselves — a tax rate here implies we collected it.",
    });
  }

  if (isMarketplace) {
    const want = order.source === "faire" ? "FAIRE" : "MARKETTIME";
    if (!new RegExp(want, "i").test(so.customFields ?? "")) {
      add({
        code: "order-source-cf",
        severity: "info",
        field: "CF-Order Source",
        expected: want,
        actual: "(not found)",
        detail: "The SO isn't tagged with the marketplace it came from, so it won't be attributed in Fishbowl reporting.",
      });
    }
  }

  if (norm(so.locationGroup) && norm(so.locationGroup) !== norm("Point B Solutions")) {
    add({
      code: "location-group",
      severity: "warning",
      field: "Location group",
      expected: "Point B Solutions",
      actual: so.locationGroup ?? "",
      detail: "Point B's connector picks up SOs by location group — one filed elsewhere may never reach the warehouse.",
    });
  }

  /* ── where it ships ──────────────────────────────────────────────────── */

  const shipCity = norm(order.ship_to?.city);
  if (shipCity && norm(so.shipToCity) && norm(so.shipToCity) !== shipCity) {
    add({
      code: "ship-city",
      severity: "error",
      field: "Ship-to city",
      expected: order.ship_to?.city ?? "",
      actual: so.shipToCity ?? "",
      detail: "The SO ships somewhere other than the address the marketplace gave.",
    });
  }

  const zip5 = (v: unknown) => norm(v).replace(/[^0-9]/g, "").slice(0, 5);
  if (zip5(order.ship_to?.postal_code) && zip5(so.shipToZip) && zip5(order.ship_to?.postal_code) !== zip5(so.shipToZip)) {
    add({
      code: "ship-zip",
      severity: "error",
      field: "Ship-to ZIP",
      expected: order.ship_to?.postal_code ?? "",
      actual: so.shipToZip ?? "",
      detail: "The SO ships to a different ZIP than the marketplace gave.",
    });
  }

  const rank: Record<DivergenceSeverity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** One-line verdict for a list, for a badge or a cron summary. */
export function divergenceSummary(list: Divergence[]): string {
  if (list.length === 0) return "Fishbowl matches the marketplace order.";
  const errors = list.filter((d) => d.severity === "error").length;
  const warnings = list.filter((d) => d.severity === "warning").length;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} to fix`);
  if (warnings) parts.push(`${warnings} to check`);
  if (!parts.length) parts.push(`${list.length} note${list.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}
