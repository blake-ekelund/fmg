import { describe, it, expect } from "vitest";
import { checkStock, describeStockIssue, stockHoldMessage } from "../orderStockCheck";
import type { SynapseItemStock } from "../pointb";

function stock(
  rows: Array<Partial<SynapseItemStock> & { item: string }>,
): Map<string, SynapseItemStock> {
  return new Map(
    rows.map((r) => [
      r.item,
      {
        item: r.item,
        net: r.net ?? r.available ?? 0,
        physical: r.physical ?? r.available ?? 0,
        available: r.available ?? 0,
        held: r.held ?? 0,
        committed: r.committed ?? 0,
        uoms: r.uoms ?? ["EA"],
        lots: r.lots ?? 1,
      },
    ]),
  );
}

describe("checkStock", () => {
  it("passes an order Point B can fill", () => {
    const check = checkStock([{ part: "125-00-10", quantity: 6 }], stock([{ item: "125-00-10", available: 78 }]));
    expect(check.blocking).toEqual([]);
    expect(check.verified).toBe(1);
  });

  it("blocks a line with nothing on the shelf", () => {
    // SO 24817's real case: 160-00-02 ordered 6, Point B holds 0.
    const check = checkStock([{ part: "160-00-02", quantity: 6 }], stock([{ item: "160-00-02", available: 0 }]));
    expect(check.blocking).toHaveLength(1);
    expect(check.blocking[0].kind).toBe("out");
    expect(check.blocking[0].short).toBe(6);
  });

  it("blocks a partially-stocked line and says how short", () => {
    // 160-00-04: ordered 6, exactly 2 on the shelf — ops cut it to 2 by hand.
    const check = checkStock([{ part: "160-00-04", quantity: 6 }], stock([{ item: "160-00-04", available: 2 }]));
    expect(check.blocking[0]).toMatchObject({ kind: "short", ordered: 6, available: 2, short: 4 });
  });

  it("passes when availability exactly equals the order", () => {
    const check = checkStock([{ part: "p", quantity: 2 }], stock([{ item: "p", available: 2 }]));
    expect(check.blocking).toEqual([]);
  });

  it("warns, never blocks, on a part Point B does not stock", () => {
    // Kits (511-06-99) are not Synapse items; their components are.
    const check = checkStock([{ part: "511-06-99", quantity: 1 }], stock([]));
    expect(check.blocking).toEqual([]);
    expect(check.issues[0].kind).toBe("unknown-part");
    expect(check.verified).toBe(0);
  });

  it("warns, never blocks, when the units aren't comparable", () => {
    const check = checkStock(
      [{ part: "903-19-00", quantity: 40 }],
      stock([{ item: "903-19-00", available: 3, uoms: ["CS"] }]),
    );
    expect(check.blocking).toEqual([]);
    expect(check.issues[0].kind).toBe("uom-mismatch");
  });

  it("sorts blocking issues ahead of warnings", () => {
    const check = checkStock(
      [
        { part: "unknown", quantity: 1 },
        { part: "short", quantity: 10 },
      ],
      stock([{ item: "short", available: 1 }]),
    );
    expect(check.issues.map((i) => i.part)).toEqual(["short", "unknown"]);
  });

  it("ignores zero and negative quantities", () => {
    const check = checkStock(
      [
        { part: "a", quantity: 0 },
        { part: "b", quantity: -3 },
      ],
      stock([{ item: "a", available: 0 }, { item: "b", available: 0 }]),
    );
    expect(check.issues).toEqual([]);
  });

  it("names every short line in the hold message", () => {
    const check = checkStock(
      [
        { part: "160-00-02", quantity: 6 },
        { part: "140-00-06", quantity: 6 },
      ],
      stock([{ item: "160-00-02", available: 0 }, { item: "140-00-06", available: 1 }]),
    );
    const msg = stockHoldMessage(check);
    expect(msg).toContain("160-00-02");
    expect(msg).toContain("140-00-06");
    expect(msg).toContain("2 lines");
  });
});

describe("describeStockIssue", () => {
  it("reads as a sentence for each kind", () => {
    expect(
      describeStockIssue({ part: "p", kind: "out", ordered: 6, available: 0, short: 6, blocking: true }),
    ).toBe("p: ordered 6, Point B has none");
    expect(
      describeStockIssue({ part: "p", kind: "short", ordered: 6, available: 2, short: 4, blocking: true }),
    ).toBe("p: ordered 6, Point B has 2 (short 4)");
  });
});
