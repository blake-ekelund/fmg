import { describe, it, expect } from "vitest";
import {
  PO_HEADER_COLUMNS,
  PO_ITEM_COLUMNS,
  buildPoHtml,
  buildPoImportCsv,
  headerFor,
  type PurchaseOrderDraft,
} from "../poExport";
import type { PoDefaults } from "../fishbowlPoDefaults";

const kapraHeader = {
  vendor: "Kapra Cosmetics",
  lastPoNum: "856",
  vendorContact: "Kapra Cosmetics",
  remitToName: "Kapra Cosmetics",
  remitAddress: "8700 Xylon Avenue North",
  remitCity: "Brooklyn Park",
  remitState: "MN",
  remitZip: "55445",
  remitCountry: "UNITED STATES",
  shipToName: "Point B Solutions",
  deliverTo: "",
  shipToAddress: "7200 93rd Ave N",
  shipToCity: "Brooklyn Park",
  shipToState: "MN",
  shipToZip: "55445",
  shipToCountry: "UNITED STATES",
  carrier: "FACT",
  paymentTerms: "NET 30",
  shipTerms: "Prepaid & Billed",
  fob: "Origin",
  buyer: "admin",
  qbClass: "None",
  locationGroup: "Point B Solutions",
  phone: "",
  email: "mschneider@kapracosmetics.com",
  note: '*Acceptable pallet dims 48x40x48"*\n\nALL BOX MARKINGS MUST INCLUDE:',
};

const defaults: PoDefaults = {
  vendors: { "Kapra Cosmetics": kapraHeader },
  fallbackShipTo: {
    shipToName: "FMG c/o Kapra Cosmetics",
    deliverTo: "",
    shipToAddress: "8700 Xylon Avenue North",
    shipToCity: "Brooklyn Park",
    shipToState: "MN",
    shipToZip: "55445",
    shipToCountry: "UNITED STATES",
    locationGroup: "Point B Solutions",
    qbClass: "None",
    buyer: "admin",
  },
};

const order: PurchaseOrderDraft = {
  vendor: "Kapra Cosmetics",
  header: kapraHeader,
  lines: [
    { part: "120-99-02", description: "Mini Hand Creme fill 2oz LAVENDER", vendorPartNumber: "120-99-02", qty: 1350, uom: "ea", unitPrice: 1.5, dueDate: "2026-11-25", note: "124-00-02 HOLLY DAZED" },
    { part: "120-99-05", description: "Mini Hand Creme fill 2oz SEA SALT", vendorPartNumber: null, qty: 500, uom: "ea", unitPrice: null, dueDate: "2026-12-01", note: "" },
  ],
};

describe("buildPoImportCsv", () => {
  const csv = buildPoImportCsv([order], "2026-10-28");
  const rows = csv.split("\r\n");

  it("starts with the PO and Item header rows", () => {
    expect(rows[0].split(",")[0]).toBe("Flag");
    expect(rows[0].split(",")).toHaveLength(PO_HEADER_COLUMNS.length);
    expect(rows[1].startsWith("Flag,POItemTypeID,PartNumber")).toBe(true);
    expect(rows[1].split(",")).toHaveLength(PO_ITEM_COLUMNS.length);
  });

  it("writes one PO row (draft status, blank number, latest due date) then its items", () => {
    expect(rows[2].startsWith("PO,,10,Kapra Cosmetics,")).toBe(true);
    expect(rows[2]).toContain("2026-12-01");
    expect(rows[2]).toContain('"*Acceptable pallet dims 48x40x48""*');
    expect(rows.filter((r) => r.startsWith("Item,"))).toHaveLength(2);
    expect(rows.find((r) => r.includes("120-99-02"))).toContain("Item,10,120-99-02,120-99-02,1350,,,ea,1.5,2026-11-25");
  });

  it("leaves the price blank when there isn't one", () => {
    expect(rows.find((r) => r.includes("120-99-05"))).toContain("500,,,ea,,2026-12-01");
  });
});

describe("headerFor", () => {
  it("uses the vendor's last PO, else ships c/o Kapra", () => {
    expect(headerFor("Kapra Cosmetics", defaults).shipToName).toBe("Point B Solutions");
    const fresh = headerFor("New Bottle Co", defaults);
    expect(fresh.shipToName).toBe("FMG c/o Kapra Cosmetics");
    expect(fresh.vendorContact).toBe("New Bottle Co");
  });
});

describe("buildPoHtml", () => {
  it("escapes text and totals priced lines", () => {
    const html = buildPoHtml({ ...order, vendor: "A & B <Co>" }, "2026-10-28");
    expect(html).toContain("A &amp; B &lt;Co&gt;");
    expect(html).toContain("$2,025.00");
  });
});
