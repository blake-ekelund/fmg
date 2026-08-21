import { describe, it, expect } from "vitest";
import {
  estimateRowsForOrder,
  nextFreeSoNumber,
  soNumBase,
  SALES_ORDER_IMPORT_HEADER,
} from "../fishbowlEstimate";
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
    // The Details tab is ops' scratch space — we put nothing in it at all.
    it("drops our own boilerplate and the customer email", () => {
      const note = noteOf(makeOrder({ source: null, note: null } as never));
      expect(note).toBe("");
      expect(note).not.toContain("pushed automatically");
      expect(note).not.toContain("@");
    });

    it.each([
      ["storefront", null, "Please ship by the 1st"],
      ["faire", "faire", "Faire order NJB3Z5USFJ (NEW) — imported by faire-order-sync."],
      ["markettime", "markettime", "MarketTime order 32653873 — imported by markettime sync."],
    ])("sends an empty Note for %s orders even when one exists", (_label, source, note) => {
      expect(noteOf(makeOrder({ source, note } as never))).toBe("");
    });
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

describe("SO number allocation", () => {
  describe("soNumBase", () => {
    it.each([
      ["24701", 24701],
      ["24700 - 10.26 SHIP", 24700],
      ["24688 - SHIP 10/1", 24688],
      ["24269 SHIP 1.27", 24269],
      ["24684 BARS", 24684],
      ["24699-BO - SHIP 10/1", 24699],
      ["24667-CR", 24667],
      ["197504-BO", 197504],
      ["  24702  ", 24702],
    ])("reads %j as %i", (num, expected) => {
      expect(soNumBase(num)).toBe(expected);
    });

    it.each(["TEST", "BO-10747", "BO-2869 - ADDED ITEM", ""])(
      "returns null for %j, which has no leading number",
      (num) => expect(soNumBase(num)).toBeNull(),
    );

    // A fixed 5-char slice breaks on both ends of the real data: 3- and
    // 4-digit numbers exist today, and 6-digit ones are coming.
    it("is not a fixed-width prefix", () => {
      expect(soNumBase("990 SHIP 1.1")).toBe(990);
      expect(soNumBase("123456 - SHIP")).toBe(123456);
    });
  });

  describe("nextFreeSoNumber", () => {
    it("increments past a plain number", () => {
      expect(nextFreeSoNumber(24701, ["24701"])).toBe(24702);
    });

    // The reported bug: CS appends a ship date, the old exact-match check saw
    // 24702 as free, and a second SO was minted on the same base.
    it("treats a ship-date-suffixed number as taken", () => {
      expect(nextFreeSoNumber(24701, ["24701", "24702 - SHIP 11.1"])).toBe(24703);
    });

    it("walks past a whole run of suffixed numbers", () => {
      const existing = ["24701", "24702 - SHIP 11.1", "24703 BARS", "24704-BO", "24705 SHIP 12.7"];
      expect(nextFreeSoNumber(24701, existing)).toBe(24706);
    });

    it("skips a base already shared by a BO/CR sibling", () => {
      expect(nextFreeSoNumber(24698, ["24699", "24699-BO - SHIP 10/1"])).toBe(24700);
    });

    it("ignores numbers below the baseline", () => {
      expect(nextFreeSoNumber(24701, ["24200", "24699 SHIP 1.1"])).toBe(24702);
    });

    // The trap in taking a plain MAX over leading digits: one stray 6-digit
    // number would carry the whole sequence off to 197505.
    it("is unmoved by a far-away outlier", () => {
      expect(nextFreeSoNumber(24701, ["24701", "197504-BO"])).toBe(24702);
    });

    it("ignores numbers with no leading digits", () => {
      expect(nextFreeSoNumber(24701, ["TEST", "BO-10747", "24701"])).toBe(24702);
    });

    it("throws rather than scanning forever", () => {
      const wall = Array.from({ length: 1200 }, (_, i) => String(24701 + i + 1));
      expect(() => nextFreeSoNumber(24701, wall)).toThrow(/free Fishbowl SO number/);
    });
  });
});
