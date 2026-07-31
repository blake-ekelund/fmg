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
 *  - Line types (SOITEMTYPE): 10 Sale, 31 Discount Amount, 60 Shipping.
 *    Shipping lines use ProductNumber "Shipping"; web-order discounts use the
 *    ".COM DISCOUNTS" discount name (the existing convention in this DB).
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
 *  wired up. Territory/Order Agency "100" is the house/web agency code per
 *  the order-entry spec (2026-07-31). */
const CF_DEFAULTS = {
  agency: "100",
  agencyCode: "000",
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
  const rep = (order.sales_rep || CF_DEFAULTS.rep).toUpperCase();

  const noteParts = [
    `Storefront order ${poNum} — pushed automatically from the FMG site as an estimate.`,
  ];
  if (order.email) noteParts.push(`Customer email: ${order.email}`);
  if ((order.tax ?? 0) > 0) noteParts.push(`Tax collected at checkout: $${money(order.tax ?? 0)}`);
  if (order.note) noteParts.push(`Order note: ${order.note}`);

  // Destination-based tax: Minnesota ship-tos use the "MN State" rate
  // (taxrate.name, verified 2026-07-31); everywhere else is "None".
  const shipState = (ship.state ?? "").trim().toUpperCase();
  const taxRateName = shipState === "MN" || shipState === "MINNESOTA" ? "MN State" : "None";

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
    "CF-Order Source": CF_DEFAULTS.orderSource,
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

  const itemRows: RowValues[] = items.map((it) => ({
    ...itemDefaults,
    SOItemTypeID: "10",
    ProductNumber: it.part as string,
    ProductDescription: it.form ? `${it.name ?? ""} · ${it.form}` : (it.name ?? ""),
    ProductQuantity: String(it.quantity ?? 0),
    ProductPrice: money(it.price ?? 0),
  }));

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
      Taxable: "false",
    });
  }

  if ((order.shipping ?? 0) > 0) {
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
