/**
 * Turn the Purchasing page's order list into purchase orders that look like
 * Fishbowl's: a CSV in Fishbowl's Purchase Order import layout (File → Import
 * → Purchase Order), and a printable PO to send the vendor. Pure — no I/O.
 *
 * Import layout: two header rows (one for the PO, one for its items), then per
 * PO a "PO" row followed by its "Item" rows. Several POs can share one file.
 *
 * Choices that keep an import safe to review before anything is committed:
 *  - Status 10 (Bid Request) — the PO lands as a draft; a person issues it.
 *  - PONum blank — Fishbowl assigns the next number.
 *  - Header (contact, remit-to, ship-to, terms, note…) copied from the vendor's
 *    last PO (lib/fishbowlPoDefaults.ts).
 *
 * NB: the column list follows Fishbowl's documented Purchase Order import; this
 * server doesn't serve its import templates over the API, so try one vendor's
 * file first.
 */

import type { PoHeader, PoDefaults } from "./fishbowlPoDefaults";

export const PO_HEADER_COLUMNS = [
  "Flag", "PONum", "Status", "VendorName", "VendorContact",
  "RemitToName", "RemitToAddress", "RemitToCity", "RemitToState", "RemitToZip", "RemitToCountry",
  "ShipToName", "DeliverToName", "ShipToAddress", "ShipToCity", "ShipToState", "ShipToZip", "ShipToCountry",
  "CarrierName", "CarrierService", "VendorSONum", "CustomerSONum",
  "CreatedDate", "CompletedDate", "ConfirmedDate", "FulfillmentDate", "IssuedDate",
  "Buyer", "ShippingTerms", "PaymentTerms", "FOB", "Note",
  "QuickBooksClassName", "LocationGroupName", "URL", "CurrencyName", "CurrencyRate", "Phone", "Email",
] as const;

export const PO_ITEM_COLUMNS = [
  "Flag", "POItemTypeID", "PartNumber", "VendorPartNumber", "PartQuantity",
  "FulfilledQuantity", "PickedQuantity", "UOM", "PartPrice",
  "FulfillmentDate", "LastFulfillmentDate", "RevisionLevel", "Note", "QuickBooksClassName", "CustomerJob",
] as const;

/** Bid Request: imported as a draft for a person to check and issue. */
export const PO_IMPORT_STATUS = "10";
/** Purchase line (as opposed to misc / credit lines). */
export const PO_ITEM_TYPE_PURCHASE = "10";

export type PoLine = {
  part: string;
  description: string;
  vendorPartNumber: string | null;
  qty: number;
  uom: string | null;
  unitPrice: number | null;
  /** YYYY-MM-DD the vendor should deliver by (today + lead time). */
  dueDate: string;
  /** e.g. which finished products a Kapra fill is for. */
  note: string;
};

export type PurchaseOrderDraft = {
  vendor: string;
  header: PoHeader;
  lines: PoLine[];
};

/** The header for a vendor: its last PO, else a bare one shipping c/o Kapra. */
export function headerFor(vendor: string, defaults: PoDefaults | null): PoHeader {
  const known = defaults?.vendors[vendor];
  if (known) return known;
  const f = defaults?.fallbackShipTo;
  return {
    vendor,
    lastPoNum: null,
    vendorContact: vendor,
    remitToName: vendor,
    remitAddress: "",
    remitCity: "",
    remitState: "",
    remitZip: "",
    remitCountry: "",
    shipToName: f?.shipToName ?? "",
    deliverTo: f?.deliverTo ?? "",
    shipToAddress: f?.shipToAddress ?? "",
    shipToCity: f?.shipToCity ?? "",
    shipToState: f?.shipToState ?? "",
    shipToZip: f?.shipToZip ?? "",
    shipToCountry: f?.shipToCountry ?? "",
    carrier: "",
    paymentTerms: "",
    shipTerms: "",
    fob: "",
    buyer: f?.buyer ?? "",
    qbClass: f?.qbClass ?? "",
    locationGroup: f?.locationGroup ?? "",
    phone: "",
    email: "",
    note: "",
  };
}

const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (vals: unknown[]) => vals.map(cell).join(",");
const money4 = (n: number | null) => (n === null ? "" : (Math.round(n * 10000) / 10000).toString());

/** Fishbowl Purchase Order import CSV for one or more POs. */
export function buildPoImportCsv(orders: PurchaseOrderDraft[], today: string): string {
  const out = [row([...PO_HEADER_COLUMNS]), row([...PO_ITEM_COLUMNS])];
  for (const o of orders) {
    const h = o.header;
    const due = o.lines.map((l) => l.dueDate).sort().pop() ?? today;
    const byCol: Record<(typeof PO_HEADER_COLUMNS)[number], string> = {
      Flag: "PO",
      PONum: "",
      Status: PO_IMPORT_STATUS,
      VendorName: o.vendor,
      VendorContact: h.vendorContact,
      RemitToName: h.remitToName,
      RemitToAddress: h.remitAddress,
      RemitToCity: h.remitCity,
      RemitToState: h.remitState,
      RemitToZip: h.remitZip,
      RemitToCountry: h.remitCountry,
      ShipToName: h.shipToName,
      DeliverToName: h.deliverTo,
      ShipToAddress: h.shipToAddress,
      ShipToCity: h.shipToCity,
      ShipToState: h.shipToState,
      ShipToZip: h.shipToZip,
      ShipToCountry: h.shipToCountry,
      CarrierName: h.carrier,
      CarrierService: "",
      VendorSONum: "",
      CustomerSONum: "",
      CreatedDate: today,
      CompletedDate: "",
      ConfirmedDate: "",
      FulfillmentDate: due,
      IssuedDate: "",
      Buyer: h.buyer,
      ShippingTerms: h.shipTerms,
      PaymentTerms: h.paymentTerms,
      FOB: h.fob,
      Note: h.note,
      QuickBooksClassName: h.qbClass,
      LocationGroupName: h.locationGroup,
      URL: "",
      CurrencyName: "",
      CurrencyRate: "",
      Phone: h.phone,
      Email: h.email,
    };
    out.push(row(PO_HEADER_COLUMNS.map((c) => byCol[c])));
    for (const l of o.lines) {
      const it: Record<(typeof PO_ITEM_COLUMNS)[number], string> = {
        Flag: "Item",
        POItemTypeID: PO_ITEM_TYPE_PURCHASE,
        PartNumber: l.part,
        VendorPartNumber: l.vendorPartNumber ?? "",
        PartQuantity: String(Math.round(l.qty)),
        FulfilledQuantity: "",
        PickedQuantity: "",
        UOM: l.uom ?? "",
        PartPrice: money4(l.unitPrice),
        FulfillmentDate: l.dueDate,
        LastFulfillmentDate: "",
        RevisionLevel: "",
        Note: l.note,
        QuickBooksClassName: h.qbClass,
        CustomerJob: "",
      };
      out.push(row(PO_ITEM_COLUMNS.map((c) => it[c])));
    }
  }
  return out.join("\r\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** A printable PO in Fishbowl's layout, for emailing or printing to the vendor. */
export function buildPoHtml(o: PurchaseOrderDraft, today: string): string {
  const h = o.header;
  const total = o.lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0);
  const addr = (parts: string[]) => parts.filter(Boolean).map(esc).join("<br>");
  const lines = o.lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(l.part)}</b>${l.vendorPartNumber && l.vendorPartNumber !== l.part ? `<br><span class="m">Vendor #${esc(l.vendorPartNumber)}</span>` : ""}</td>
        <td>${esc(l.description)}${l.note ? `<br><span class="m">${esc(l.note)}</span>` : ""}</td>
        <td class="r">${Math.round(l.qty).toLocaleString("en-US")}</td>
        <td>${esc(l.uom ?? "")}</td>
        <td class="r">${l.unitPrice !== null ? usd(l.unitPrice) : ""}</td>
        <td class="r">${l.unitPrice !== null ? usd(l.unitPrice * l.qty) : ""}</td>
        <td>${esc(l.dueDate)}</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Purchase Order — ${esc(o.vendor)}</title>
<style>
  body{font:13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;margin:32px}
  h1{font-size:22px;margin:0 0 4px} .m{color:#666;font-size:11px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}
  .box{border:1px solid #ddd;border-radius:6px;padding:10px} .box h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border-bottom:1px solid #eee;padding:6px;text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;color:#666} .r{text-align:right} .tot td{font-weight:600;border-top:2px solid #111}
  .note{white-space:pre-wrap;border:1px solid #ddd;border-radius:6px;padding:10px;margin-top:16px}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>Purchase Order</h1>
<div class="m">Draft — PO number assigned in Fishbowl · Prepared ${esc(today)}</div>
<div class="grid">
  <div class="box"><h3>Vendor</h3>${addr([o.vendor, h.vendorContact !== o.vendor ? h.vendorContact : "", h.email, h.phone])}</div>
  <div class="box"><h3>Remit to</h3>${addr([h.remitToName, h.remitAddress, [h.remitCity, h.remitState, h.remitZip].filter(Boolean).join(" ")])}</div>
  <div class="box"><h3>Ship to</h3>${addr([h.shipToName, h.deliverTo, h.shipToAddress, [h.shipToCity, h.shipToState, h.shipToZip].filter(Boolean).join(" ")])}</div>
</div>
<div class="m">Terms: ${esc(h.paymentTerms || "—")} · Shipping: ${esc(h.shipTerms || "—")} · FOB: ${esc(h.fob || "—")} · Carrier: ${esc(h.carrier || "—")}</div>
<table>
  <thead><tr><th>#</th><th>Part</th><th>Description</th><th class="r">Qty</th><th>UOM</th><th class="r">Unit cost</th><th class="r">Total</th><th>Needed by</th></tr></thead>
  <tbody>${lines}<tr class="tot"><td colspan="6" class="r">Total</td><td class="r">${usd(total)}</td><td></td></tr></tbody>
</table>
${h.note ? `<div class="note">${esc(h.note)}</div>` : ""}
</body></html>`;
}
