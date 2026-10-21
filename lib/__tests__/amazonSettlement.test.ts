import { describe, it, expect } from "vitest";
import { parseSettlementReport, SettlementParseError } from "../amazonSettlement";

const HEADER =
  "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tmerchant-order-id\tadjustment-id\tshipment-id\tmarketplace-name\tamount-type\tamount-description\tamount\tfulfillment-id\tposted-date\tposted-date-time\torder-item-code\tmerchant-order-item-id\tmerchant-adjustment-item-id\tsku\tquantity-purchased\tpromotion-id";

const SUMMARY =
  "27607417601\t2026-09-24 12:40:36 UTC\t2026-10-08 12:40:35 UTC\t2026-10-10 12:40:35 UTC\t1764.88\tUSD" + "\t".repeat(18);

const line = (tt: string, at: string, ad: string, amount: string) =>
  ["27607417601", "", "", "", "", "", tt, "113-1", "113-1", "", "S1", "Amazon.com", at, ad, amount, "AFN", "2026-09-24", "", "", "", "", "SKU", "1", ""].join("\t");

// The Sep 24 – Oct 8 2026 settlement, one line per (type, amount type, description) group.
const REPORT = [
  HEADER,
  SUMMARY,
  line("Order", "ItemPrice", "Principal", "4228.00"),
  line("Order", "ItemPrice", "Shipping", "66.76"),
  line("Order", "ItemPrice", "ShippingTax", "1.52"),
  line("Order", "ItemPrice", "Tax", "295.29"),
  line("Order", "ItemWithheldTax", "MarketplaceFacilitatorTax-Principal", "-290.89"),
  line("Order", "ItemWithheldTax", "MarketplaceFacilitatorVAT-Principal", "-4.40"),
  line("Order", "ItemWithheldTax", "MarketplaceFacilitatorVAT-Shipping", "-1.52"),
  line("Order", "ItemFees", "Commission", "-612.85"),
  line("Order", "ItemFees", "FBAPerUnitFulfillmentFee", "-922.43"),
  line("Order", "ItemFees", "ShippingChargeback", "-14.61"),
  line("Order", "Promotion", "Principal", "-42.30"),
  line("Order", "Promotion", "Shipping", "-52.15"),
  line("Refund", "ItemFees", "Commission", "3.00"),
  line("Refund", "ItemFees", "RefundCommission", "-0.60"),
  line("Refund", "ItemPrice", "Principal", "-20.00"),
  line("Refund", "ItemPrice", "Tax", "-1.20"),
  line("Refund", "ItemWithheldTax", "MarketplaceFacilitatorTax-Principal", "1.20"),
  line("ServiceFee", "Cost of Advertising", "TransactionTotalAmount", "-309.69"),
  line("FBAFees", "FBA Inbound Placement Service Fee", "Base fee", "-0.50"),
  line("FBAFees", "FBA Inventory Storage Fee", "Base fee", "-14.45"),
  line("FBAFees", "FBA Removal Order: Disposal Fee", "Base fee", "-1.53"),
  line("FBAFees", "FBA Removal Order: Return Fee", "Base fee", "-1.53"),
  line("other-transaction", "FBA Inventory Reimbursement", "COMPENSATED_CLAWBACK", "-85.20"),
  line("other-transaction", "FBA Inventory Reimbursement", "REVERSAL_REIMBURSEMENT", "41.34"),
  line("other-transaction", "FBA Inventory Reimbursement", "WAREHOUSE_DAMAGE", "16.09"),
  line("other-transaction", "FBA Inventory Reimbursement", "WAREHOUSE_LOST", "1.51"),
  line("other-transaction", "other-transaction", "Inbound Transportation Fee", "-513.98"),
].join("\r\n");

describe("parseSettlementReport", () => {
  it("produces the bookkeeping journal entry and ties to the deposit", () => {
    const je = parseSettlementReport(REPORT);
    expect(je.label).toBe("09/24/2026 to 10/08/2026");
    expect(je.columns).toEqual({
      sales: 4228.0,
      shipping: 66.76,
      amazonFees: -1549.89,
      advertising: -309.69,
      promoRebates: -52.15,
      fbaFees: -531.99, // -513.98 inbound + -18.01 FBAFees rows
      refundedSales: -17.6,
      other: -68.56,
    });
    expect(je.total).toBe(1764.88);
    expect(je.reportedTotal).toBe(1764.88);
    expect(je.reconciles).toBe(true);
  });

  it("routes unknown line types to Other so the entry still balances", () => {
    const je = parseSettlementReport(
      [HEADER, SUMMARY.replace("1764.88", "4233.00"), line("Order", "ItemPrice", "Principal", "4228.00"), line("Mystery", "NewFee", "Thing", "5.00")].join("\n")
    );
    expect(je.columns.other).toBe(5);
    expect(je.reconciles).toBe(true);
  });

  it("rejects files that aren't settlement reports", () => {
    expect(() => parseSettlementReport("a,b,c\n1,2,3")).toThrow(SettlementParseError);
  });
});
