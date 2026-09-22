import { describe, it, expect } from "vitest";
import { stockLines } from "../fishbowl";
import { SALES_ORDER_IMPORT_HEADER } from "../fishbowlEstimate";
import type { KitEdge } from "../fishbowlKits";

const col = (name: string) => SALES_ORDER_IMPORT_HEADER.indexOf(name as never);

/** Build import rows carrying only the three columns stockLines reads. */
function rows(lines: Array<{ type: string; part: string; qty: number }>): string[][] {
  const header = [...SALES_ORDER_IMPORT_HEADER] as string[];
  return [
    header,
    ...lines.map((l) => {
      const row = header.map(() => "");
      row[col("SOItemTypeID")] = l.type;
      row[col("ProductNumber")] = l.part;
      row[col("ProductQuantity")] = String(l.qty);
      return row;
    }),
  ];
}

const edge = (kit: string, component: string, qty: number, isKit = false): KitEdge => ({
  kit,
  component,
  description: component,
  price: 0,
  qty,
  isKit,
});

describe("stockLines", () => {
  it("returns the sale lines as they stand", () => {
    const out = stockLines(rows([{ type: "10", part: "125-00-10", qty: 6 }]), []);
    expect(out).toEqual([{ part: "125-00-10", quantity: 6 }]);
  });

  it("ignores shipping, tax, discount and subtotal lines", () => {
    const out = stockLines(
      rows([
        { type: "10", part: "125-00-10", qty: 6 },
        { type: "31", part: ".COM DISCOUNTS", qty: 1 },
        { type: "40", part: "", qty: 1 },
        { type: "60", part: "Shipping", qty: 1 },
        { type: "70", part: ".COM Tax", qty: 1 },
      ]),
      [],
    );
    expect(out).toEqual([{ part: "125-00-10", quantity: 6 }]);
  });

  it("ignores a kit HEADER line, whose components are already listed", () => {
    // What our own multi-level expansion writes: type 80 kit, type 10 members.
    const out = stockLines(
      rows([
        { type: "80", part: "512-03-99", qty: 1 },
        { type: "10", part: "125-00-10", qty: 6 },
      ]),
      [edge("512-03-99", "125-00-10", 6)],
    );
    expect(out).toEqual([{ part: "125-00-10", quantity: 6 }]);
  });

  it("expands a SINGLE-level kit still sitting on a sale line", () => {
    // Fishbowl expands these itself on import, so the rows still name the kit —
    // and no warehouse holds "511-06-99". Its components are what get picked.
    const out = stockLines(
      rows([{ type: "10", part: "511-06-99", qty: 2 }]),
      [edge("511-06-99", "131-00-06", 12), edge("511-06-99", "507-00-99", 1)],
    );
    expect(out).toEqual([
      { part: "131-00-06", quantity: 24 },
      { part: "507-00-99", quantity: 2 },
    ]);
  });

  it("sums a part reached two different ways", () => {
    // SO 24787: six loose 123-00-04 plus six inside an expanded display.
    const out = stockLines(
      rows([
        { type: "10", part: "123-00-04", qty: 6 },
        { type: "10", part: "512-00-99", qty: 1 },
      ]),
      [edge("512-00-99", "123-00-04", 6)],
    );
    expect(out).toEqual([{ part: "123-00-04", quantity: 12 }]);
  });

  it("descends through a nested kit to the parts that actually exist", () => {
    const out = stockLines(
      rows([{ type: "10", part: "512-03-99", qty: 1 }]),
      [edge("512-03-99", "502-03-99", 1, true), edge("502-03-99", "125-00-10", 6)],
    );
    expect(out).toEqual([{ part: "125-00-10", quantity: 6 }]);
  });

  it("drops zero-quantity lines", () => {
    const out = stockLines(rows([{ type: "10", part: "p", qty: 0 }]), []);
    expect(out).toEqual([]);
  });

  it("returns nothing when the header has no product column", () => {
    expect(stockLines([["SONum"], ["24874"]], [])).toEqual([]);
  });
});
