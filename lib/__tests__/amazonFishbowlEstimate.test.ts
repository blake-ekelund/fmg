import { describe, it, expect } from "vitest";
import { parseSettlementReport } from "../amazonSettlement";
import { amazonEstimateLines, amazonEstimateNote, amazonEstimateRows, amazonPoNum } from "../amazonFishbowlEstimate";
import { SALES_ORDER_IMPORT_HEADER } from "../fishbowlEstimate";

const HEADER =
  "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tmerchant-order-id\tadjustment-id\tshipment-id\tmarketplace-name\tamount-type\tamount-description\tamount\tfulfillment-id\tposted-date\tposted-date-time\torder-item-code\tmerchant-order-item-id\tmerchant-adjustment-item-id\tsku\tquantity-purchased\tpromotion-id";
const SUMMARY = (total: string) =>
  `27726243701\t2026-10-08 12:40:36 UTC\t2026-10-22 12:40:35 UTC\t2026-10-24 12:40:35 UTC\t${total}\tUSD` + "\t".repeat(18);
const line = (tt: string, at: string, ad: string, amount: string, sku: string, qty: string) =>
  ["27726243701", "", "", "", "", "", tt, "113-1", "113-1", "", "S1", "Amazon.com", at, ad, amount, "AFN", "2026-10-09", "", "", "", "", sku, qty, ""].join("\t");

// 110-00-01: 2 at $24 + 1 at $22 (a price change mid-period); 357000 BL HC Set kit ×1 at $32.
const FILE = [
  HEADER,
  SUMMARY("79.20"),
  line("Order", "ItemPrice", "Principal", "48.00", "110-00-01", "2"),
  line("Order", "ItemFees", "Commission", "-7.20", "110-00-01", "2"),
  line("Order", "ItemPrice", "Principal", "22.00", "110-00-01", "1"),
  line("Order", "ItemPrice", "Principal", "32.00", "357000 BL HC Set", "1"),
  line("Order", "ItemFees", "Commission", "-4.80", "357000 BL HC Set", "1"),
  line("Refund", "ItemPrice", "Principal", "-12.00", "120-00-02", ""),
  line("ServiceFee", "Cost of Advertising", "TransactionTotalAmount", "1.20", "", ""),
].join("\n");

describe("Amazon → Fishbowl estimate", () => {
  const je = parseSettlementReport(FILE);
  const lines = amazonEstimateLines(FILE);

  it("makes one line per SKU and unit price, from the file's order lines only", () => {
    expect(lines).toEqual([
      { sku: "110-00-01", quantity: 2, unitPrice: 24, total: 48 },
      { sku: "110-00-01", quantity: 1, unitPrice: 22, total: 22 },
      { sku: "357000 BL HC Set", quantity: 1, unitPrice: 32, total: 32 },
    ]);
  });

  it("builds an ESTIMATE for AMAZON - CUSTOMER with the agreed fields, totalling Sales", () => {
    const { poNum, rows } = amazonEstimateRows(je, lines, "11/11/2026");
    expect(poNum).toBe("10/08-10/22/2026");
    expect(rows[0]).toEqual([...SALES_ORDER_IMPORT_HEADER]);
    const get = (r: string[], c: string) => r[rows[0].indexOf(c)];
    for (const r of rows.slice(1)) {
      expect(get(r, "Status")).toBe("10");
      expect(get(r, "CustomerName")).toBe("AMAZON - CUSTOMER");
      expect(get(r, "PONum")).toBe("10/08-10/22/2026");
      expect(get(r, "LocationGroupName")).toBe("Amazon Warehouse");
      expect(get(r, "CF-Order Agency")).toBe("NI HOUSE");
      expect(get(r, "CF-Order Rep")).toBe("NOT REP ASSIGNED");
      expect(get(r, "CF-Order Source")).toBe("AMAZON");
      expect(get(r, "CF-Order Agency Code")).toBe("100");
      expect(get(r, "SOItemTypeID")).toBe("10");
    }
    const total = rows.slice(1).reduce((s, r) => s + Number(get(r, "ProductQuantity")) * Number(get(r, "ProductPrice")), 0);
    expect(total).toBe(je.columns.sales);
  });

  it("puts the rest of the journal entry in the note", () => {
    const note = amazonEstimateNote(je);
    expect(note.split("\n")[0]).toBe("AMAZON SETTLEMENT 10/08/2026 to 10/22/2026");
    expect(note).toMatch(/^AMAZON FEES: \(\$12\.00\)$/m);
    expect(note).not.toMatch(/AMAZON AMAZON/);
    expect(note).toMatch(/AMAZON REFUNDED SALES: \(\$12\.00\)/);
    expect(note).toMatch(/AMAZON NET: \$79\.20$/);
    expect(note).not.toMatch(/SALES: \$102/);
  });

  it("refuses lines that don't add up to Sales", () => {
    expect(() => amazonEstimateRows(je, lines.slice(1), "11/11/2026")).toThrow(/not pushing/);
  });

  it("formats the PO the same way the hand-keyed orders do", () => {
    expect(amazonPoNum({ startDate: "2025-12-18", endDate: "2026-01-01" })).toBe("12/18-01/01/2026");
  });
});
