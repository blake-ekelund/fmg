import { describe, it, expect } from "vitest";
import { estimateRowsForOrder, SALES_ORDER_IMPORT_HEADER } from "../fishbowlEstimate";
import type { StorefrontOrder } from "../storefrontOrder";

const col = (name: string) => SALES_ORDER_IMPORT_HEADER.indexOf(name as never);

function makeOrder(over: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "o1",
    created_at: "2026-08-21T12:00:00Z",
    channel: "wholesale",
    status: "new",
    business_name: "MARTIN BOOT CO",
    contact_name: "Danielle Martin",
    email: "daniellemartin@martinboot.com",
    ship_to: { name: "Martin Boot Co", line1: "1001 West Joe Harvey", city: "Hobbs", state: "NM", postal_code: "88240", country: "US" },
    bill_to: null,
    items: [{ line_no: 1, part: "410-00-02", name: "Gift Set", quantity: 4, price: 11, total: 44 }],
    shipping: 0,
    tax: 0,
    discount: 0,
    total: 44,
    ...over,
  } as unknown as StorefrontOrder;
}

/** The trailing line's [typeId, productNumber]. */
function lastLine(order: StorefrontOrder): [string, string] {
  const { rows } = estimateRowsForOrder(order, "MARTIN BOOT CO");
  const last = rows[rows.length - 1];
  return [last[col("SOItemTypeID")], last[col("ProductNumber")]];
}

const noteOf = (order: StorefrontOrder) =>
  estimateRowsForOrder(order, "MARTIN BOOT CO").rows[1][col("Note")];

describe("estimateRowsForOrder", () => {
  describe("trailing line: Shipping vs Subtotal", () => {
    it.each(["faire", "markettime"])(
      "%s orders end with a Subtotal line, not Shipping",
      (source) => {
        const [typeId, product] = lastLine(makeOrder({ source } as never));
        expect(typeId).toBe("40");
        // A Subtotal line carries no product — Fishbowl computes the value.
        expect(product).toBe("");
      },
    );

    it("storefront orders keep their Shipping line", () => {
      const [typeId, product] = lastLine(makeOrder({ source: null } as never));
      expect(typeId).toBe("60");
      expect(product).toBe("Shipping");
    });

    it("carries the storefront shipping amount through", () => {
      const { rows } = estimateRowsForOrder(
        makeOrder({ source: null, shipping: 8.95 } as never),
        "MARTIN BOOT CO",
      );
      const last = rows[rows.length - 1];
      expect(last[col("ProductPrice")]).toBe("8.95");
    });

    it("never emits both a Shipping and a Subtotal line", () => {
      for (const source of ["faire", "markettime", null]) {
        const { rows } = estimateRowsForOrder(makeOrder({ source } as never), "MARTIN BOOT CO");
        const types = rows.slice(1).map((r) => r[col("SOItemTypeID")]);
        expect(types.filter((t) => t === "40" || t === "60")).toHaveLength(1);
      }
    });
  });

  describe("Note", () => {
    it("drops our own boilerplate and the customer email", () => {
      const note = noteOf(makeOrder({ source: null, note: null } as never));
      expect(note).toBe("");
      expect(note).not.toContain("pushed automatically");
      expect(note).not.toContain("@");
    });

    it("keeps a storefront customer's checkout note", () => {
      expect(noteOf(makeOrder({ source: null, note: "Please ship by the 1st" } as never))).toBe(
        "Please ship by the 1st",
      );
    });

    it.each(["faire", "markettime"])(
      "drops %s notes — those are written by our own importer",
      (source) => {
        const order = makeOrder({
          source,
          note: "MarketTime order 32653873 (PO CP2898706B) — imported by markettime sync.",
        } as never);
        expect(noteOf(order)).toBe("");
      },
    );
  });

  it("still stamps provenance where it belongs, not in the Note", () => {
    const { rows } = estimateRowsForOrder(
      makeOrder({ source: "markettime", external_ref: "32653873" } as never),
      "MARTIN BOOT CO",
    );
    expect(rows[1][col("CF-Order Source")]).toBe("MARKETTIME");
    expect(rows[1][col("PONum")]).toContain("32653873");
  });
});
