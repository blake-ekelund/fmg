/**
 * Invoice model — assembles a Fishbowl-style invoice from the data we already
 * sync (sales_orders_raw + so_items_raw + so_shipments_raw). The layout mirrors
 * FMG's own Fishbowl sales-order print so a rep-generated invoice looks like the
 * ones the office sends. Pure and dependency-free so it runs on the server (the
 * portal API assembles the model) and the shape can be rendered on the client.
 *
 * Totals are anchored on the order's own `totalprice` (the authority), with tax
 * pulled from Tax line items and subtotal derived as total − tax — so it always
 * reconciles regardless of how discounts/shipping are itemised.
 */

import { resolveCarrier, trackingUrl } from "./tracking";

/** FMG's remit-to block, taken verbatim from a real Fishbowl invoice. */
export const INVOICE_COMPANY = {
  name: "Fragrance Marketing Group, LLC",
  address: ["PO BOX 762", "EXCELSIOR, MN  55331"],
  phone: "(952) 466-7417",
  email: "jekelund@fragrancemarketinggroup.com",
};

/** Our synced state values are full names; the invoice shows 2-letter codes. */
const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function stateCode(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  return STATE_ABBR[v.toLowerCase()] ?? v;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** "$ 66.00" — the spaced style Fishbowl uses in the line-item Total column. */
const moneyLine = (n: number) => `$ ${Math.abs(n).toFixed(2)}${n < 0 ? " CR" : ""}`;

function mmddyyyy(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** One address block: name, street line(s), then "CITY, ST ZIP". */
function addressLines(
  name: string | null,
  street: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): string[] {
  const lines: string[] = [];
  if (name) lines.push(name);
  // Fishbowl folds extra lines (ATTN:, suite) into the street with newlines.
  for (const part of (street ?? "").split(/\r?\n/)) if (part.trim()) lines.push(part.trim());
  const cityLine = [city, [stateCode(state), zip].filter(Boolean).join("  ")]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  return lines;
}

/* ── Input shapes (loose — these come straight from the raw tables) ─────────── */

export type InvoiceOrderInput = {
  num: string | null;
  customerpo: string | null;
  customercontact: string | null;
  customer_name?: string | null;
  billtoname: string | null;
  billtoaddress: string | null;
  billtocity: string | null;
  billtostate: string | null;
  billtozip: string | null;
  shiptoname: string | null;
  shiptoaddress: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
  shiptozip: string | null;
  dateissued: string | null;
  datecreated: string | null;
  totalprice: number | null;
  /* SO header fields for the invoice info band — null until the invoice-fields
     migration is applied and a sync has run; the builder falls back sensibly. */
  salesman?: string | null;
  payment_terms?: string | null;
  fob_point?: string | null;
  carrier?: string | null;
  ship_service?: string | null;
};

export type InvoiceItemInput = {
  solineitem: number | null;
  productnum: string | null;
  description: string | null;
  qtyordered: number | null;
  totalprice: number | null;
  typename: string | null;
};

export type InvoiceShipmentInput = {
  carrier: string | null;
  tracking_num: string | null;
  dateshipped?: string | null;
};

/* ── Output model ──────────────────────────────────────────────────────────── */

export type InvoiceLine = {
  num: number;
  type: string;
  itemNumber: string;
  description: string;
  /** Unit price / qty / uom only shown for priced product & shipping lines. */
  unitPrice: string | null;
  qty: string | null;
  uom: string | null;
  total: string;
};

export type InvoiceModel = {
  company: typeof INVOICE_COMPANY;
  title: string;
  orderNum: string;
  date: string;
  billTo: string[];
  shipTo: string[];
  customer: string;
  contact: string;
  poNumber: string;
  info: {
    salesRep: string;
    paymentTerms: string;
    fobPoint: string;
    carrier: string;
    shipService: string;
    dateScheduled: string;
  };
  lines: InvoiceLine[];
  /** Tracking numbers with a carrier deep link when the carrier is detectable. */
  tracking: { num: string; url: string | null }[];
  subtotal: string;
  tax: string;
  total: string;
  generatedAt: string;
};

/** Normalise Fishbowl's line types to the short labels the print uses. */
function shortType(t: string | null): string {
  const s = (t ?? "").trim();
  if (/^discount/i.test(s)) return "Discount";
  return s || "Sale";
}

/** Lines that carry a real unit price + quantity column. */
const PRICED = new Set(["Sale", "Shipping", "Kit", "Credit Return"]);

export function buildInvoice(
  order: InvoiceOrderInput,
  items: InvoiceItemInput[],
  shipments: InvoiceShipmentInput[],
  opts: { salesRep?: string | null; paymentTerms?: string | null; generatedAt?: string } = {},
): InvoiceModel {
  const total = order.totalprice ?? 0;
  const tax = items
    .filter((i) => /^tax/i.test(i.typename ?? ""))
    .reduce((s, i) => s + (i.totalprice ?? 0), 0);
  const subtotal = total - tax;

  const lines: InvoiceLine[] = [...items]
    .sort((a, b) => (a.solineitem ?? 0) - (b.solineitem ?? 0))
    .map((i) => {
      const type = shortType(i.typename);
      const amt = i.totalprice ?? 0;
      const qty = i.qtyordered ?? 0;
      const priced = PRICED.has(type) && qty > 0;
      return {
        num: i.solineitem ?? 0,
        type,
        itemNumber: (i.productnum ?? "").trim(),
        description: (i.description ?? "").trim(),
        unitPrice: priced ? money(amt / qty) : null,
        qty: priced ? String(qty) : null,
        uom: priced ? "ea" : null,
        total: moneyLine(amt),
      };
    });

  // Each tracking number gets a carrier deep link when the carrier is
  // detectable (Fishbowl's carrier is usually "RATESHOP", so this falls back to
  // detecting the carrier from the number's format).
  const tracking = shipments
    .filter((s) => (s.tracking_num ?? "").trim())
    .map((s) => {
      const num = (s.tracking_num ?? "").trim();
      const id = resolveCarrier(s.carrier ?? order.carrier ?? null, num);
      return { num, url: trackingUrl(id, num) };
    });

  // SO-level carrier (matches the office print) wins; a shipment's carrier is
  // the fallback for orders that carry no SO carrier.
  const carrier =
    (order.carrier ?? "").trim() ||
    shipments.find((s) => (s.carrier ?? "").trim())?.carrier?.trim() ||
    "";

  // The invoice date is when it shipped (matches Fishbowl's print); fall back to
  // the issue date for orders that haven't shipped. Date Scheduled stays the
  // issue date.
  const shipDate = shipments
    .map((s) => s.dateshipped ?? "")
    .filter(Boolean)
    .sort()
    .pop();

  return {
    company: INVOICE_COMPANY,
    title: "Invoice",
    orderNum: order.num ?? "",
    date: mmddyyyy(shipDate ?? order.dateissued ?? order.datecreated),
    billTo: addressLines(
      order.billtoname,
      order.billtoaddress,
      order.billtocity,
      order.billtostate,
      order.billtozip,
    ),
    shipTo: addressLines(
      order.shiptoname,
      order.shiptoaddress,
      order.shiptocity,
      order.shiptostate,
      order.shiptozip,
    ),
    customer: order.customer_name ?? order.billtoname ?? "",
    contact: order.customercontact ?? "",
    poNumber: order.customerpo ?? "",
    info: {
      salesRep: (order.salesman ?? opts.salesRep ?? "").trim(),
      paymentTerms: (order.payment_terms ?? opts.paymentTerms ?? "NET 30").trim(),
      fobPoint: (order.fob_point ?? "Origin").trim(),
      carrier,
      shipService: (order.ship_service ?? "").trim(),
      dateScheduled: mmddyyyy(order.dateissued ?? order.datecreated),
    },
    lines,
    tracking,
    subtotal: money(subtotal),
    tax: money(tax),
    total: money(total),
    generatedAt: opts.generatedAt ?? "",
  };
}
