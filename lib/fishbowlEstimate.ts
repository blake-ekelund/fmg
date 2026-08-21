/**
 * Map a storefront order onto Fishbowl's SalesOrderDetails CSV-import rows —
 * the payload lib/fishbowl.ts `createEstimate()` posts. Pure mapping, no I/O,
 * so it can be unit-tested and reused by a future auto-push cron.
 *
 * Format facts (verified against this instance 2026-07-31):
 *  - Body is a JSON array of arrays: header row first, then ONE ROW PER LINE
 *    ITEM with the SO header columns repeated (that's how the matching
 *    /api/export/SalesOrderDetails emits it).
 *  - Status 10 = Estimate (SOSTATUS table).
 *  - Line types (SOITEMTYPE): 10 Sale, 31 Discount Amount, 40 Subtotal,
 *    60 Shipping, 70 Tax. Shipping lines use ProductNumber "Shipping";
 *    web-order discounts use the ".COM DISCOUNTS" discount name (the existing
 *    convention in this DB). Subtotal lines carry no product at all.
 *  - Storefront orders end with a Shipping line; marketplace (Faire /
 *    MarketTime) orders end with a Subtotal line instead — those channels
 *    bill freight themselves, and ops adds the real shipping line when the
 *    order is rated.
 *  - Six SO custom fields are REQUIRED (customfield.required): Territory
 *    Agency / Territory Code / Territory Sales Rep Name / Order Agency /
 *    Order Rep / Order Source — the import 400s if any is blank.
 *  - The import auto-creates unknown customers; createEstimate() guards
 *    against that by requiring an exact active-customer name match.
 */

import {
  orderRef,
  type OrderAddress,
  type StorefrontOrder,
} from "./storefrontOrder";

export const ESTIMATE_STATUS = "10";

/** Column order matters only in that each data row must match the header. */
export const SALES_ORDER_IMPORT_HEADER = [
  "SONum",
  "Status",
  "CustomerName",
  "CustomerContact",
  "BillToName",
  "BillToAddress",
  "BillToCity",
  "BillToState",
  "BillToZip",
  "BillToCountry",
  "ShipToName",
  "ShipToAddress",
  "ShipToCity",
  "ShipToState",
  "ShipToZip",
  "ShipToCountry",
  "ShipToResidential",
  "CarrierName",
  "TaxRateName",
  "PriorityId",
  "PONum",
  "VendorPONum",
  "Date",
  "Salesman",
  "ShippingTerms",
  "PaymentTerms",
  "FOB",
  "Note",
  "QuickBooksClassName",
  "LocationGroupName",
  "OrderDateScheduled",
  "URL",
  "CarrierService",
  "DateExpired",
  "Phone",
  "Email",
  "Category",
  "CF-Territory Agency",
  "CF-Territory Code",
  "CF-Territory Sales Rep Name",
  "CF-Order Agency",
  "CF-Order Rep",
  "CF-Order Source",
  "CF-Order Agency Code",
  "SOItemTypeID",
  "ProductNumber",
  "ProductDescription",
  "ProductQuantity",
  "UOM",
  "ProductPrice",
  "Taxable",
  "TaxCode",
  "ItemNote",
  "ItemQuickBooksClassName",
  "ItemDateScheduled",
  "ShowItem",
  "KitItem",
  "RevisionLevel",
  "CustomerPartNumber",
] as const;

type HeaderColumn = (typeof SALES_ORDER_IMPORT_HEADER)[number];
type RowValues = Partial<Record<HeaderColumn, string>>;

/** Defaults for the required SO custom fields until real rep attribution is
 *  wired up. All four agency fields — Territory Agency, Territory Code,
 *  Order Agency, Order Agency Code — are "100" per the order-entry spec
 *  (2026-08-01). */
const CF_DEFAULTS = {
  agency: "100",
  agencyCode: "100",
  rep: "JULIE EKELUND",
  orderSource: "WEB",
};

const usDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const country = (c?: string | null): string => {
  const v = (c ?? "").trim().toUpperCase();
  if (!v || v === "US" || v === "USA" || v === "UNITED STATES") return "UNITED STATES";
  return v;
};

const money = (n: number): string => n.toFixed(2);

type FlatAddress = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

function flattenAddress(
  addr: OrderAddress | null | undefined,
  fallbackName: string,
): FlatAddress | null {
  if (!addr || (!addr.line1 && !addr.city)) return null;
  return {
    name: addr.company || addr.name || fallbackName,
    street: [addr.line1, addr.line2].filter(Boolean).join("\n"),
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.postal_code ?? "",
    country: country(addr.country),
  };
}

export type EstimatePayload = {
  /** The storefront ref (SASSY-####) — travels as Customer PO, NOT the SO
   *  number. Fishbowl auto-assigns the SO number (next in its 24xxx sequence)
   *  because SONum is sent blank; dedupe + lookup key on customerPO. */
  poNum: string;
  /** Header + item rows, ready for createEstimate(). */
  rows: string[][];
};

/**
 * Build the import rows for one storefront order.
 *
 * `customerName` must be the EXACT Fishbowl customer name the estimate books
 * under (during the pilot: "TEST CUSTOMER #1" / "TEST CUSTOMER #2"). The
 * order's own bill-to/ship-to still travel on the SO so the estimate shows
 * the real addresses even while parked on a test customer.
 */
export function estimateRowsForOrder(
  order: StorefrontOrder,
  customerName: string,
  /** UPC by part number (lib/productUpc.ts) — appended to each sale line's
   *  description so ops sees the barcode on the SO. Optional; parts without
   *  an entry render without a UPC suffix. */
  upcByPart: Record<string, string> = {},
): EstimatePayload {
  const poNum = orderRef(order);
  const items = (order.items ?? []).filter((it) => it.part && (it.quantity ?? 0) > 0);
  if (items.length === 0) {
    throw new Error("Order has no line items with a Fishbowl product number.");
  }

  const fallbackName = order.business_name || order.contact_name || customerName;
  // Orders placed before checkout collected addresses (and some D2C flows)
  // have neither block — send name-only rows and let the estimate book under
  // the customer; ops fills the address when converting the estimate.
  const nameOnly: FlatAddress = {
    name: fallbackName,
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "UNITED STATES",
  };
  const billTo = flattenAddress(order.bill_to, fallbackName);
  const shipTo = flattenAddress(order.ship_to, fallbackName) ?? billTo;
  const bill = billTo ?? shipTo ?? nameOnly;
  const ship = shipTo ?? nameOnly;

  const created = usDate(order.created_at);
  // D2C storefront sales are house sales — the rep is "NI HOUSE" (a Fishbowl
  // user). An explicit order.sales_rep still wins; otherwise D2C → NI HOUSE,
  // and wholesale/other → the JULIE EKELUND default.
  const repDefault = order.channel === "d2c" ? "NI HOUSE" : CF_DEFAULTS.rep;
  const rep = (order.sales_rep || repDefault).toUpperCase();
  const orderSource =
    order.source === "faire"
      ? "FAIRE"
      : order.source === "markettime"
        ? "MARKETTIME"
        : CF_DEFAULTS.orderSource;

  // The SO's Note carries a HUMAN's note or nothing at all. We used to prepend
  // "pushed automatically from the FMG site" plus the customer's email; the
  // Details tab is ops' scratch space, and provenance already lives in Customer
  // PO and CF-Order Source.
  //
  // Marketplace orders get nothing: their `note` is written by our own importer
  // ("MarketTime order 32653873 (PO …, TRANSMITTED / OPEN) — imported by
  // markettime sync."), so it is our text too. A storefront order's note is
  // whatever the customer typed at checkout, which ops does want.
  const isMarketplaceSource = order.source === "faire" || order.source === "markettime";
  const noteParts = !isMarketplaceSource && order.note ? [order.note] : [];

  // The STORE (Stripe Tax) is the source of truth for tax, not Fishbowl — so
  // the SO's own rate is ".COM Tax" (0%, taxrate id 3) and never auto-computes.
  // The exact amount the store collected rides as an explicit ".COM Tax" line
  // (SOITEMTYPE 70), matching the established convention (185 existing SOs).
  // This keeps the SO total reconciled to the Stripe charge to the penny.
  const taxRateName = ".COM Tax";

  const header: RowValues = {
    // Blank SONum → Fishbowl assigns the next number in its own sequence.
    // The storefront ref rides in PONum (Customer PO) instead.
    SONum: "",
    Status: ESTIMATE_STATUS,
    CustomerName: customerName,
    CustomerContact: order.contact_name || customerName,
    BillToName: bill.name,
    BillToAddress: bill.street,
    BillToCity: bill.city,
    BillToState: bill.state,
    BillToZip: bill.zip,
    BillToCountry: bill.country,
    ShipToName: ship.name,
    ShipToAddress: ship.street,
    ShipToCity: ship.city,
    ShipToState: ship.state,
    ShipToZip: ship.zip,
    ShipToCountry: ship.country,
    ShipToResidential: order.channel === "d2c" ? "true" : "false",
    CarrierName: "RATESHOP",
    TaxRateName: taxRateName,
    PriorityId: "30",
    PONum: poNum,
    VendorPONum: "",
    Date: created,
    // Must match an existing Fishbowl user — "admin" verified active 2026-07-31.
    Salesman: "admin",
    ShippingTerms: "Prepaid",
    PaymentTerms: "NET 30",
    FOB: "Origin",
    Note: noteParts.join("\n"),
    QuickBooksClassName: "WEB",
    LocationGroupName: "Point B Solutions",
    OrderDateScheduled: created,
    URL: "",
    CarrierService: "DOMESTIC",
    DateExpired: "",
    Phone: order.phone ?? "",
    Email: order.email ?? "",
    Category: "",
    "CF-Territory Agency": CF_DEFAULTS.agency,
    "CF-Territory Code": CF_DEFAULTS.agencyCode,
    "CF-Territory Sales Rep Name": rep,
    "CF-Order Agency": CF_DEFAULTS.agency,
    "CF-Order Rep": rep,
    "CF-Order Source": orderSource,
    "CF-Order Agency Code": CF_DEFAULTS.agencyCode,
  };

  const itemDefaults: RowValues = {
    UOM: "ea",
    Taxable: "true",
    TaxCode: "NON",
    ItemNote: "",
    ItemQuickBooksClassName: "",
    ItemDateScheduled: created,
    ShowItem: "true",
    KitItem: "false",
    RevisionLevel: "",
    CustomerPartNumber: "",
  };

  const itemRows: RowValues[] = items.map((it) => {
    const base = it.form ? `${it.name ?? ""} · ${it.form}` : (it.name ?? "");
    const upc = upcByPart[it.part as string];
    return {
      ...itemDefaults,
      SOItemTypeID: "10",
      ProductNumber: it.part as string,
      ProductDescription: upc ? `${base} · UPC ${upc}` : base,
      ProductQuantity: String(it.quantity ?? 0),
      ProductPrice: money(it.price ?? 0),
    };
  });

  // Order-level discounts → the ".COM DISCOUNTS" line web orders already use.
  const discountTotal =
    order.discounts?.length
      ? order.discounts.reduce((sum, d) => sum + Math.abs(d.amount ?? 0), 0)
      : Math.abs(order.discount ?? 0);
  if (discountTotal > 0) {
    itemRows.push({
      ...itemDefaults,
      SOItemTypeID: "31",
      ProductNumber: ".COM DISCOUNTS",
      ProductDescription:
        order.discounts?.map((d) => d.label).filter(Boolean).join(", ") || ".COM DISCOUNTS",
      ProductQuantity: "1",
      ProductPrice: money(-discountTotal),
      // Taxable so the discount reduces the taxable base (matches the store's
      // tax math and the Fishbowl convention — the Tax checkbox is checked).
      Taxable: "true",
    });
  }

  // Marketplace orders get a Subtotal line instead of a Shipping line.
  //
  // Faire and MarketTime bill the retailer for freight themselves, so our
  // $0.00 Shipping line was never real money — and ops adds the actual
  // shipping line when the order is rated, leaving SOs with two Shipping
  // lines (e.g. SO 24684, Faire PO SJRDU4TYYS-FAIRE: our $0 plus a $31.13).
  //
  // A Subtotal line (SOITEMTYPE 40) is the useful thing in its place: it is
  // Fishbowl's own running-total line — blank product, qty 1, price 0 — and
  // Fishbowl fills in the value. Sending a price would be guessing at a field
  // it computes.
  if (isMarketplaceSource) {
    itemRows.push({
      ...itemDefaults,
      SOItemTypeID: "40",
      ProductNumber: "",
      ProductDescription: "Subtotal",
      ProductQuantity: "1",
      ProductPrice: money(0),
      Taxable: "false",
    });
  } else {
    // Storefront orders DO collect shipping, so their line stays — always
    // present even at $0.00, so every storefront SO has a consistent shape.
    itemRows.push({
      ...itemDefaults,
      SOItemTypeID: "60",
      ProductNumber: "Shipping",
      ProductDescription: "Shipping",
      ProductQuantity: "1",
      ProductPrice: money(order.shipping ?? 0),
      Taxable: "false",
    });
  }

  // Store-collected tax (really just MN) as an explicit ".COM Tax" line
  // (SOITEMTYPE 70 = Tax) — the amount Stripe actually charged, so the SO
  // reconciles to the payment. Only when tax was collected.
  if ((order.tax ?? 0) > 0) {
    itemRows.push({
      ...itemDefaults,
      SOItemTypeID: "70",
      ProductNumber: ".COM Tax",
      ProductDescription: ".COM Tax",
      ProductQuantity: "1",
      ProductPrice: money(order.tax ?? 0),
      Taxable: "false",
    });
  }

  const toRow = (values: RowValues): string[] =>
    SALES_ORDER_IMPORT_HEADER.map((col) => values[col] ?? "");

  return {
    poNum,
    rows: [
      [...SALES_ORDER_IMPORT_HEADER],
      ...itemRows.map((item) => toRow({ ...header, ...item })),
    ],
  };
}
