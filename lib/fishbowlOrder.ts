import type { OrderAddress, StorefrontOrder } from "./storefrontOrder";
import { orderRef } from "./storefrontOrder";

/**
 * Map a storefront order (wholesale project `orders` row) → a Fishbowl
 * sales-order create payload for POST /api/sales-orders.
 *
 * ⚠ PROVISIONAL. The exact Fishbowl Advanced REST field names for sales-order
 * creation aren't confirmed yet — this is a best-effort first shape. The intent
 * is to POST it, read Fishbowl's validation error (surfaced verbatim by the
 * push route), and correct the field names here until it's accepted. Keep this
 * builder the single place the mapping lives so iteration is one edit.
 *
 * Customer mapping: D2C web orders post under a per-store Fishbowl customer
 * (confirm the names match the Fishbowl customer records — the D2C accounts,
 * customerids 12345/12483/13704). Wholesale orders use the order's business name.
 */

/** Per-store Fishbowl customer for D2C web orders. Override via env; the
 *  defaults are placeholders to confirm against the real customer records. */
const D2C_CUSTOMER: Record<string, string> = {
  sassy: process.env.FISHBOWL_SASSY_D2C_CUSTOMER || "Sassy Web",
  ni: process.env.FISHBOWL_NI_D2C_CUSTOMER || "NI Web",
};

function streetOf(a?: OrderAddress | null): string {
  return [a?.line1, a?.line2].filter(Boolean).join(", ");
}

/** The Fishbowl "Sales Order" import — name (spaces → hyphens) + the columns.
 *  ⚠ These column headers MUST match the import template in THIS Fishbowl
 *  instance (Import/Export → Sales Order → sample CSV). Provisional until we
 *  see the real template; adjust SO_COLUMNS + rowFor to match it exactly. */
const SO_IMPORT_NAME = process.env.FISHBOWL_SO_IMPORT_NAME || "Sales-Order";
const SO_COLUMNS = [
  "SONum",
  "Status",
  "CustomerName",
  "CustomerContact",
  "ShipToName",
  "ShipToAddress",
  "ShipToCity",
  "ShipToState",
  "ShipToZip",
  "BillToName",
  "BillToAddress",
  "BillToCity",
  "BillToState",
  "BillToZip",
  "CustomerPO",
  "Note",
  "SOItemTypeID",
  "ProductNumber",
  "ProductDescription",
  "ProductQuantity",
  "ProductPrice",
  "UOM",
] as const;

/**
 * The Fishbowl customer name for an order.
 * - D2C: a per-store web customer we create in Fishbowl (Sassy Web / NI Web).
 * - Wholesale: the customer tied to the partner's Fishbowl account number —
 *   maintained manually on the /storefronts/partners list. The push route
 *   looks that up and passes it in via opts.customerName; until a partner has
 *   one set we fall back to the order's business name (which will likely be
 *   rejected by Fishbowl if it isn't a real customer there).
 */
export function customerForOrder(order: StorefrontOrder, override?: string | null): string {
  if (override) return override;
  const store = order.store ?? "";
  if (order.channel === "wholesale") {
    return order.business_name || order.contact_name || "Web Customer";
  }
  return D2C_CUSTOMER[store] ?? "Web Customer";
}

export type FishbowlImport = {
  importName: string;
  rows: (string | number | null)[][];
};

/**
 * Build the Fishbowl "Sales Order" import for an order: the import name plus a
 * CSV-as-array body ([headers, ...one row per line item]). Order-level fields
 * (customer, addresses, PO) repeat on each item row — the flat Fishbowl import
 * shape. Status per channel (confirmed): D2C = Issued (20), Wholesale =
 * Estimate (10). Shipping/discount lines are omitted from this first pass.
 *
 * ⚠ Column names + status codes are provisional until we match the instance's
 * real import template.
 */
export function buildFishbowlSalesOrder(
  order: StorefrontOrder,
  opts?: { customerName?: string | null },
): FishbowlImport {
  const customerName = customerForOrder(order, opts?.customerName);
  const status = order.channel === "wholesale" ? 10 : 20; // Estimate : Issued
  const po = orderRef(order); // storefront ref = Fishbowl customer PO
  const bt = order.bill_to ?? order.ship_to;
  const st = order.ship_to ?? order.bill_to;

  const base: Record<(typeof SO_COLUMNS)[number], string | number | null> = {
    SONum: "", // blank → Fishbowl assigns the number
    Status: status,
    CustomerName: customerName,
    CustomerContact: order.contact_name ?? "",
    ShipToName: st?.name ?? order.contact_name ?? "",
    ShipToAddress: streetOf(st),
    ShipToCity: st?.city ?? "",
    ShipToState: st?.state ?? "",
    ShipToZip: st?.postal_code ?? "",
    BillToName: bt?.name ?? order.business_name ?? "",
    BillToAddress: streetOf(bt),
    BillToCity: bt?.city ?? "",
    BillToState: bt?.state ?? "",
    BillToZip: bt?.postal_code ?? "",
    CustomerPO: po,
    Note: order.note ?? "",
    SOItemTypeID: 10, // 10 = Sale item
    ProductNumber: "",
    ProductDescription: "",
    ProductQuantity: 0,
    ProductPrice: 0,
    UOM: "ea",
  };

  const items = (order.items ?? []).filter((it) => it.part && (it.quantity ?? 0) > 0);

  const dataRows = items.map((it) => {
    const row = {
      ...base,
      ProductNumber: it.part ?? "",
      ProductDescription: it.name ?? "",
      ProductQuantity: it.quantity ?? 0,
      ProductPrice: it.price ?? 0,
    };
    return SO_COLUMNS.map((c) => row[c] ?? "");
  });

  return {
    importName: SO_IMPORT_NAME,
    rows: [[...SO_COLUMNS], ...dataRows],
  };
}
