import { describe, it, expect } from "vitest";
import { compareOrderToSo, divergenceSummary, type FishbowlSoSnapshot } from "../fishbowlDivergence";
import type { StorefrontOrder } from "../storefrontOrder";

function makeOrder(over: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "o1",
    created_at: "2026-09-16T12:00:00Z",
    source: "markettime",
    external_ref: "32883475",
    channel: "wholesale",
    fishbowl_customer: "ERNEST & ALICE",
    items: [{ line_no: 1, part: "125-00-15", name: "Mini Hand Crème", quantity: 6, price: 5, total: 30 }],
    subtotal: 30,
    total: 30,
    ship_to: { city: "Duluth", state: "MN", postal_code: "55802" },
    ...over,
  } as unknown as StorefrontOrder;
}

function makeSo(over: Partial<FishbowlSoSnapshot> = {}): FishbowlSoSnapshot {
  return {
    num: "24874",
    customerPO: "32883475-MKTTIME",
    customerName: "ERNEST & ALICE",
    soClass: "GIFT",
    customerClass: "GIFT",
    paymentTerms: "NET 30",
    taxRate: "None",
    locationGroup: "Point B Solutions",
    status: "Estimate",
    salesman: "admin",
    shipToCity: "Duluth",
    shipToZip: "55802",
    customFields: '{"1":{"name":"Order Source","value":"MARKETTIME"}}',
    items: [
      { lineItem: 1, typeId: 10, productNum: "125-00-15", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
      { lineItem: 2, typeId: 40, productNum: null, qtyOrdered: 1, unitPrice: 0, totalPrice: 30, itemClass: "GIFT" },
    ],
    ...over,
  };
}

const codes = (order: StorefrontOrder, so: FishbowlSoSnapshot, kits = new Map()) =>
  compareOrderToSo(order, so, kits).map((d) => d.code);

describe("compareOrderToSo", () => {
  it("reports nothing when the two records agree", () => {
    expect(codes(makeOrder(), makeSo())).toEqual([]);
  });

  describe("QuickBooks class", () => {
    it("flags an SO booked under a class the customer record doesn't carry", () => {
      // The real bug: every push booked as WEB regardless of the customer.
      const out = compareOrderToSo(makeOrder(), makeSo({ soClass: "WEB", customerClass: "CASINOS" }));
      const d = out.find((x) => x.code === "class-mismatch");
      expect(d?.severity).toBe("error");
      expect(d?.expected).toBe("CASINOS");
      expect(d?.actual).toBe("WEB");
    });

    it("flags lines that carry a different class than the header", () => {
      const so = makeSo();
      so.items[0].itemClass = "None";
      expect(codes(makeOrder(), so)).toContain("line-class-mismatch");
    });

    it("says nothing when the customer's class is unknown", () => {
      expect(codes(makeOrder(), makeSo({ customerClass: null, soClass: "WEB" }))).not.toContain(
        "class-mismatch",
      );
    });
  });

  describe("lines", () => {
    it("flags a line the SO is missing", () => {
      const so = makeSo({ items: [{ lineItem: 1, typeId: 40, productNum: null, qtyOrdered: 1, unitPrice: 0, totalPrice: 0, itemClass: "GIFT" }] });
      expect(codes(makeOrder(), so)).toContain("line-missing");
    });

    it("flags a quantity Fishbowl will ship short", () => {
      const so = makeSo();
      so.items[0].qtyOrdered = 2;
      so.items[0].totalPrice = 10;
      expect(codes(makeOrder(), so)).toContain("line-qty");
    });

    it("flags a unit price that drifted", () => {
      const so = makeSo();
      so.items[0].unitPrice = 4.5;
      expect(codes(makeOrder(), so)).toContain("line-price");
    });

    it("tolerates sub-cent float drift", () => {
      const so = makeSo();
      so.items[0].unitPrice = 5.000001;
      expect(codes(makeOrder(), so)).not.toContain("line-price");
    });

    it("flags a line Fishbowl has that the marketplace never sent", () => {
      const so = makeSo();
      so.items.splice(1, 0, {
        lineItem: 2, typeId: 10, productNum: "125-01-15", qtyOrdered: 1, unitPrice: 2.5, totalPrice: 2.5, itemClass: "GIFT",
      });
      expect(codes(makeOrder(), so)).toContain("line-extra");
    });

    it("sums a part that appears on two SO lines", () => {
      // SO 24787: six loose plus six out of an expanded display.
      const order = makeOrder({
        items: [{ part: "123-00-04", quantity: 12, price: 5, total: 60 }],
        subtotal: 60,
      });
      const so = makeSo({
        items: [
          { lineItem: 1, typeId: 10, productNum: "123-00-04", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
          { lineItem: 2, typeId: 10, productNum: "123-00-04", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
        ],
      });
      expect(codes(order, so)).toEqual([]);
    });

    it("skips a MarketTime Direct Order Entry placeholder part", () => {
      const order = makeOrder({ items: [{ part: "None", quantity: 1, price: 500, total: 500 }], subtotal: 0 });
      const so = makeSo({ items: [] });
      expect(codes(order, so)).not.toContain("line-missing");
    });
  });

  describe("kits", () => {
    const kits = new Map([["512-03-99", [{ part: "125-00-10", qty: 6 }, { part: "125-01-10", qty: 1 }]]]);
    const kitOrder = makeOrder({
      items: [{ part: "512-03-99", quantity: 1, price: 220, total: 220 }],
      subtotal: 220,
    });
    const kitSo = makeSo({
      items: [
        { lineItem: 1, typeId: 80, productNum: "512-03-99", qtyOrdered: 1, unitPrice: 0, totalPrice: 0, itemClass: "GIFT" },
        { lineItem: 2, typeId: 10, productNum: "125-00-10", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
        { lineItem: 3, typeId: 10, productNum: "125-01-10", qtyOrdered: 1, unitPrice: 2.5, totalPrice: 2.5, itemClass: "GIFT" },
      ],
    });

    it("does not call an expanded kit a missing line", () => {
      expect(codes(kitOrder, kitSo, kits)).not.toContain("line-missing");
    });

    it("does not call the kit's components extra lines", () => {
      expect(codes(kitOrder, kitSo, kits)).not.toContain("line-extra");
    });

    it("skips the subtotal check, because components aren't priced like the kit", () => {
      expect(codes(kitOrder, kitSo, kits)).not.toContain("subtotal-mismatch");
    });

    it("does not compare a component's price against the marketplace's", () => {
      // Fishbowl prices components from product.price — by design.
      const so = makeSo({
        items: [
          { lineItem: 1, typeId: 80, productNum: "512-03-99", qtyOrdered: 1, unitPrice: 0, totalPrice: 0, itemClass: "GIFT" },
          { lineItem: 2, typeId: 10, productNum: "125-00-10", qtyOrdered: 6, unitPrice: 99, totalPrice: 594, itemClass: "GIFT" },
          { lineItem: 3, typeId: 10, productNum: "125-01-10", qtyOrdered: 1, unitPrice: 2.5, totalPrice: 2.5, itemClass: "GIFT" },
        ],
      });
      expect(codes(kitOrder, so, kits)).not.toContain("line-price");
    });

    it("still flags a component quantity the SO gets wrong", () => {
      const so = makeSo({
        items: [
          { lineItem: 1, typeId: 80, productNum: "512-03-99", qtyOrdered: 1, unitPrice: 0, totalPrice: 0, itemClass: "GIFT" },
          { lineItem: 2, typeId: 10, productNum: "125-00-10", qtyOrdered: 3, unitPrice: 5, totalPrice: 15, itemClass: "GIFT" },
          { lineItem: 3, typeId: 10, productNum: "125-01-10", qtyOrdered: 1, unitPrice: 2.5, totalPrice: 2.5, itemClass: "GIFT" },
        ],
      });
      expect(codes(kitOrder, so, kits)).toContain("line-qty");
    });

    it("sums a part ordered loose AND reached through a kit", () => {
      // SO 24787: six loose 123-00-04 plus six inside a display = twelve.
      const displays = new Map([["512-00-99", [{ part: "123-00-04", qty: 6 }]]]);
      const order = makeOrder({
        items: [
          { part: "123-00-04", quantity: 6, price: 5, total: 30 },
          { part: "512-00-99", quantity: 1, price: 215, total: 215 },
        ],
        subtotal: 245,
      });
      const so = makeSo({
        items: [
          { lineItem: 1, typeId: 10, productNum: "123-00-04", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
          { lineItem: 2, typeId: 10, productNum: "123-00-04", qtyOrdered: 6, unitPrice: 5, totalPrice: 30, itemClass: "GIFT" },
        ],
      });
      expect(codes(order, so, displays)).toEqual([]);
    });
  });

  describe("shape of the SO", () => {
    it("flags sale lines sitting below the Subtotal line", () => {
      // SO 24872's signature — a part-committed import or a later hand edit.
      const so = makeSo();
      so.items.push({
        lineItem: 3, typeId: 10, productNum: "243-00-09", qtyOrdered: 12, unitPrice: 0.5, totalPrice: 6, itemClass: "GIFT",
      });
      expect(codes(makeOrder(), so)).toContain("lines-after-subtotal");
    });

    it("flags a second Shipping line", () => {
      const so = makeSo();
      so.items.push(
        { lineItem: 3, typeId: 60, productNum: "Shipping", qtyOrdered: 1, unitPrice: 0, totalPrice: 0, itemClass: null },
        { lineItem: 4, typeId: 60, productNum: "Shipping", qtyOrdered: 1, unitPrice: 31.13, totalPrice: 31.13, itemClass: null },
      );
      expect(codes(makeOrder(), so)).toContain("double-shipping");
    });

    it("flags a tax rate on a marketplace order", () => {
      expect(codes(makeOrder(), makeSo({ taxRate: ".COM Tax" }))).toContain("tax-rate");
    });

    it("flags a location group the 3PL won't pick up", () => {
      expect(codes(makeOrder(), makeSo({ locationGroup: "Main" }))).toContain("location-group");
    });

    it("flags an SO missing its marketplace tag", () => {
      expect(codes(makeOrder(), makeSo({ customFields: "{}" }))).toContain("order-source-cf");
    });
  });

  describe("identity and address", () => {
    it("flags an SO booked to a different customer", () => {
      expect(codes(makeOrder(), makeSo({ customerName: "SOMEONE ELSE" }))).toContain("customer-mismatch");
    });

    it("flags the retailer's own PO missing from the SO", () => {
      expect(codes(makeOrder({ external_po: "DS5976254O" }), makeSo())).toContain("retailer-po-absent");
    });

    it("accepts a customer PO that contains the retailer PO", () => {
      const order = makeOrder({ external_po: "DS5976254O" });
      const so = makeSo({ customerPO: "DS5976254O" });
      expect(codes(order, so)).not.toContain("retailer-po-absent");
    });

    it("flags a ship-to city that doesn't match", () => {
      expect(codes(makeOrder(), makeSo({ shipToCity: "Saint Paul" }))).toContain("ship-city");
    });

    it("compares ZIPs on the first five digits only", () => {
      expect(codes(makeOrder(), makeSo({ shipToZip: "55802-1234" }))).not.toContain("ship-zip");
      expect(codes(makeOrder(), makeSo({ shipToZip: "55101" }))).toContain("ship-zip");
    });
  });

  describe("money", () => {
    it("flags sale lines that don't add up to the marketplace total", () => {
      const so = makeSo();
      so.items[0].totalPrice = 20;
      expect(codes(makeOrder(), so)).toContain("subtotal-mismatch");
    });
  });

  it("puts errors before warnings", () => {
    const out = compareOrderToSo(
      makeOrder({ external_po: "DS5976254O" }),
      makeSo({ soClass: "WEB", customerClass: "GIFT" }),
    );
    expect(out[0].severity).toBe("error");
  });
});

describe("divergenceSummary", () => {
  it("says so when there is nothing to report", () => {
    expect(divergenceSummary([])).toBe("Fishbowl matches the marketplace order.");
  });

  it("counts errors and warnings separately", () => {
    const out = compareOrderToSo(
      makeOrder({ external_po: "DS5976254O" }),
      makeSo({ soClass: "WEB", customerClass: "GIFT" }),
    );
    expect(divergenceSummary(out)).toContain("to fix");
  });
});
