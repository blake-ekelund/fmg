import { describe, expect, it } from "vitest";
import { expandTesterLines, testerPartFor } from "../faireTester";
import type { FaireOrderItem } from "../faire";

const item = (over: Partial<FaireOrderItem> = {}): FaireOrderItem => ({
  sku: "110-00-05",
  name: "Sea Salt Citrus Hand + Body Lotion",
  variant: "default",
  quantity: 6,
  price: 11,
  includesTester: false,
  testerPrice: 0,
  ...over,
});

describe("testerPartFor", () => {
  it("swaps the -00- segment for -01-", () => {
    expect(testerPartFor("110-00-05")).toBe("110-01-05");
    expect(testerPartFor("120-00-04")).toBe("120-01-04");
  });

  it("returns null for SKUs outside the -00- family", () => {
    // The acrylic-box kits and oddball parts have no tester part today.
    expect(testerPartFor("507-02-99")).toBeNull();
    expect(testerPartFor("514000")).toBeNull();
    expect(testerPartFor(null)).toBeNull();
  });

  it("only rewrites the first -00- segment", () => {
    expect(testerPartFor("110-00-00")).toBe("110-01-00");
  });
});

describe("expandTesterLines", () => {
  const parts = new Map([["110-00-05", "110-01-05"]]);

  it("leaves unflagged lines alone", () => {
    const { items, subtotal, unmapped } = expandTesterLines([item()], parts);
    expect(items).toHaveLength(1);
    expect(subtotal).toBe(66);
    expect(unmapped).toEqual([]);
  });

  it("adds ONE tester line at qty 1 regardless of the parent quantity", () => {
    const { items } = expandTesterLines(
      [item({ quantity: 12, includesTester: true, testerPrice: 5.5 })],
      parts,
    );
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ part: "110-01-05", quantity: 1, price: 5.5, total: 5.5 });
  });

  it("uses the price Faire sent, never half the line price", () => {
    // The 507 kits sell at $103.50 with a $2.47 tester — halving would be $51.75.
    const { items } = expandTesterLines(
      [item({ sku: "507-02-99", price: 103.5, quantity: 1, includesTester: true, testerPrice: 2.47 })],
      new Map(),
    );
    expect(items[1].price).toBe(2.47);
  });

  it("counts testers in the subtotal", () => {
    const { subtotal } = expandTesterLines(
      [item({ includesTester: true, testerPrice: 5.5 })],
      parts,
    );
    expect(subtotal).toBe(71.5); // 6 x 11 + 5.50
  });

  it("keeps an unmappable tester as a partless line and reports it", () => {
    const { items, subtotal, unmapped } = expandTesterLines(
      [item({ sku: "507-02-99", price: 103.5, quantity: 1, includesTester: true, testerPrice: 2.47 })],
      new Map(),
    );
    expect(items).toHaveLength(2);
    expect(items[1].part).toBeUndefined();
    expect(items[1].name).toContain("unmapped");
    expect(subtotal).toBe(105.97); // the dollars still land on the order
    expect(unmapped).toEqual([{ sku: "507-02-99", expected: null, price: 2.47 }]);
  });

  it("refuses a tester part the resolver rejected (500-01-99 is a Display)", () => {
    const { items, unmapped } = expandTesterLines(
      [item({ sku: "500-00-99", includesTester: true, testerPrice: 2.5 })],
      new Map(), // resolver found no tester-typed part
    );
    expect(items[1].part).toBeUndefined();
    expect(unmapped[0]).toMatchObject({ sku: "500-00-99", expected: "500-01-99" });
  });

  it("inserts each tester after its parent and renumbers every line", () => {
    const { items } = expandTesterLines(
      [
        item({ sku: "110-00-05", includesTester: true, testerPrice: 5.5 }),
        item({ sku: "120-00-04", name: "Mini Hand Creme", price: 5, includesTester: false }),
      ],
      parts,
    );
    expect(items.map((i) => [i.line_no, i.part])).toEqual([
      [1, "110-00-05"],
      [2, "110-01-05"],
      [3, "120-00-04"],
    ]);
  });
});
