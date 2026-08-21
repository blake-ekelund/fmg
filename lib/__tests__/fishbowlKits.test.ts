import { describe, it, expect } from "vitest";
import {
  expandKitRows,
  flattenKit,
  isMultiLevelKit,
  kitLinesTotal,
  type KitEdge,
} from "../fishbowlKits";

/**
 * The real 517-08-99 tree, as read from Fishbowl:
 *   517-08-99 PREPACK
 *     └ 502-05-99 COMPLETE (a kit)
 *         ├ 500-02-99 BASE    $15
 *         └ 501-05-99 HEADER  $5
 *     └ 135-00-10..15  6 × $5 each
 */
const EDGES: KitEdge[] = [
  { kit: "517-08-99", component: "502-05-99", description: "Body Butter Display COMPLETE", price: 0, qty: 1, isKit: true },
  { kit: "502-05-99", component: "500-02-99", description: "Display BASE", price: 15, qty: 1, isKit: false },
  { kit: "502-05-99", component: "501-05-99", description: "Display HEADER", price: 5, qty: 1, isKit: false },
  ...["10", "11", "12", "13", "14", "15"].map((n) => ({
    kit: "517-08-99",
    component: `135-00-${n}`,
    description: `Mini Body Butter ${n}`,
    price: 5,
    qty: 6,
    isKit: false,
  })),
  // A single-level kit for contrast — Fishbowl expands this one itself.
  { kit: "513-00-99", component: "223-00-01", description: "Lip Butter", price: 5, qty: 6, isKit: false },
];

describe("isMultiLevelKit", () => {
  it("is true only when a component is itself a kit", () => {
    expect(isMultiLevelKit("517-08-99", EDGES)).toBe(true);
    expect(isMultiLevelKit("513-00-99", EDGES)).toBe(false);
    expect(isMultiLevelKit("410-00-02", EDGES)).toBe(false);
  });
});

describe("flattenKit", () => {
  const lines = flattenKit("517-08-99", 1, EDGES);

  it("leads with the kit itself, unpriced and not a member", () => {
    expect(lines[0]).toMatchObject({
      product: "517-08-99",
      isKit: true,
      isMember: false,
      price: 0,
      qty: 1,
    });
  });

  it("puts the nested kit next, as a $0 member kit line", () => {
    expect(lines[1]).toMatchObject({
      product: "502-05-99",
      isKit: true,
      isMember: true,
      price: 0,
    });
  });

  it("follows the nested kit immediately with its own members", () => {
    expect(lines.slice(2, 4).map((l) => l.product)).toEqual(["500-02-99", "501-05-99"]);
    expect(lines.slice(2, 4).every((l) => l.isMember && !l.isKit)).toBe(true);
  });

  it("marks every descendant as a member", () => {
    expect(lines.slice(1).every((l) => l.isMember)).toBe(true);
  });

  it("emits one line per component, none dropped", () => {
    // kit + nested kit + base + header + 6 butters
    expect(lines).toHaveLength(10);
  });

  it("totals to what Fishbowl charges — $200, the price MarketTime sold it at", () => {
    expect(kitLinesTotal(lines)).toBe(200);
  });

  it("multiplies quantities through the ordered kit count", () => {
    const two = flattenKit("517-08-99", 2, EDGES);
    expect(two[0].qty).toBe(2);
    expect(two.find((l) => l.product === "135-00-10")!.qty).toBe(12);
    expect(two.find((l) => l.product === "500-02-99")!.qty).toBe(2);
    expect(kitLinesTotal(two)).toBe(400);
  });

  it("closes a cycle instead of looping on it", () => {
    const cyclic: KitEdge[] = [
      { kit: "A", component: "B", description: "B", price: 3, qty: 1, isKit: true },
      { kit: "B", component: "A", description: "A", price: 7, qty: 1, isKit: true },
    ];
    const lines = flattenKit("A", 1, cyclic);
    // A (root) → B (kit) → A again, which is already on the path, so it lands
    // as a priced leaf and the walk stops there.
    expect(lines.map((l) => l.product)).toEqual(["A", "B", "A"]);
    expect(lines[2]).toMatchObject({ isKit: false, price: 7 });
  });
});

describe("expandKitRows", () => {
  const header = [
    "PONum", "Note", "SOItemTypeID", "ProductNumber", "ProductDescription",
    "ProductQuantity", "ProductPrice", "ShowItem", "KitItem",
  ];
  const row = (type: string, product: string, qty: string, price: string) =>
    ["PO-1", "", type, product, "desc", qty, price, "", ""];

  const rows = [
    header,
    row("10", "410-00-02", "4", "11.00"),
    row("10", "517-08-99", "1", "200.00"), // multi-level → expands
    row("10", "513-00-99", "1", "113.00"), // single-level → untouched
    row("40", "", "1", "0.00"),            // subtotal → untouched
  ];
  const out = expandKitRows(rows, EDGES);
  const c = (n: string) => header.indexOf(n);
  const productsOf = (rs: string[][]) => rs.slice(1).map((r) => r[c("ProductNumber")]);

  it("leaves non-kit, single-level-kit and subtotal rows alone", () => {
    expect(productsOf(out)).toContain("410-00-02");
    expect(productsOf(out)).toContain("513-00-99");
    expect(out.some((r) => r[c("SOItemTypeID")] === "40")).toBe(true);
  });

  it("replaces the multi-level kit with its 10 expanded lines", () => {
    // 4 original data rows, one of which becomes 10
    expect(out).toHaveLength(1 + 3 + 10 - 1 + 1);
    expect(productsOf(out)).toContain("502-05-99");
    expect(productsOf(out)).toContain("500-02-99");
  });

  it("types kit lines 80 and component lines 10", () => {
    const byProduct = new Map(out.slice(1).map((r) => [r[c("ProductNumber")], r]));
    expect(byProduct.get("517-08-99")![c("SOItemTypeID")]).toBe("80");
    expect(byProduct.get("502-05-99")![c("SOItemTypeID")]).toBe("80");
    expect(byProduct.get("500-02-99")![c("SOItemTypeID")]).toBe("10");
  });

  it("sets KitItem false on the kit and true on every member", () => {
    const byProduct = new Map(out.slice(1).map((r) => [r[c("ProductNumber")], r]));
    expect(byProduct.get("517-08-99")![c("KitItem")]).toBe("false");
    expect(byProduct.get("502-05-99")![c("KitItem")]).toBe("true");
    expect(byProduct.get("135-00-10")![c("KitItem")]).toBe("true");
  });

  it("moves the money off the kit line onto the components", () => {
    const byProduct = new Map(out.slice(1).map((r) => [r[c("ProductNumber")], r]));
    expect(byProduct.get("517-08-99")![c("ProductPrice")]).toBe("0.00");
    expect(byProduct.get("500-02-99")![c("ProductPrice")]).toBe("15.00");
    expect(byProduct.get("135-00-10")![c("ProductPrice")]).toBe("5.00");
  });

  it("carries the SO header columns onto every replacement line", () => {
    for (const r of out.slice(1)) expect(r[c("PONum")]).toBe("PO-1");
  });

  it("is a no-op when nothing on the order is a multi-level kit", () => {
    const plain = [header, row("10", "410-00-02", "4", "11.00")];
    expect(expandKitRows(plain, EDGES)).toEqual(plain);
  });
});

describe("bad data in the real kit tree", () => {
  // 500-02-99 (BASE) and retired 505-11-99.old point at each other, both at
  // quantity 0. loadKitEdges filters quantity 0 away, but the walk must not
  // hang even if such an edge ever reaches it.
  const CYCLIC: KitEdge[] = [
    { kit: "517-08-99", component: "502-05-99", description: "COMPLETE", price: 20, qty: 1, isKit: true },
    { kit: "502-05-99", component: "500-02-99", description: "BASE", price: 15, qty: 1, isKit: true },
    { kit: "500-02-99", component: "505-11-99.old", description: "retired", price: 15, qty: 0, isKit: true },
    { kit: "505-11-99.old", component: "500-02-99", description: "BASE", price: 15, qty: 0, isKit: true },
  ];

  it("terminates instead of recursing forever", () => {
    const lines = flattenKit("517-08-99", 1, CYCLIC);
    expect(lines.length).toBeLessThan(20);
  });

  it("emits the repeat as a plain line rather than descending again", () => {
    const lines = flattenKit("517-08-99", 1, CYCLIC);
    const repeats = lines.filter((l) => l.product === "500-02-99");
    // Seen once on the way down, and once more where the cycle closes —
    // the second time as a leaf, not as a kit to walk into.
    expect(repeats.length).toBeGreaterThanOrEqual(1);
    expect(repeats[repeats.length - 1].isKit).toBe(false);
  });
});
