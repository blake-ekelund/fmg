import { describe, it, expect } from "vitest";
import {
  buildable,
  lowLevelCodes,
  materialCost,
  orderUrgency,
  awayFromFiller,
  isFill,
  vendorFor,
  bomFamilies,
  priceFor,
  orderQty,
  topUpToRun,
  leadDaysFor,
  planRequirements,
  suggestedBuy,
  usableStock,
  whereUsed,
  type Boms,
} from "../bomPlan";
import type { BomPart } from "../fishbowlBom";

const line = (component: string, qtyPer = 1) => ({ component, qtyPer, bomQty: qtyPer, bomUom: "ea" });

/* Two lotions share a bottle and a pump; each has its own fill. A tester is
   made from lotion A plus a tester label (a nested BOM). */
const boms: Boms = {
  LOTION_A: { bomNum: "A", lines: [line("BOTTLE"), line("PUMP"), line("FILL_A"), line("SHIPPER", 1 / 6)] },
  LOTION_B: { bomNum: "B", lines: [line("BOTTLE"), line("PUMP"), line("FILL_B"), line("SHIPPER", 1 / 6)] },
  TESTER_A: { bomNum: "T", lines: [line("LOTION_A"), line("TRYME")] },
};

const supplyOf = (m: Record<string, number>) => (p: string) => m[p] ?? 0;

const part = (p: Partial<BomPart> & { part: string }): BomPart => ({
  description: "",
  uom: "ea",
  avgCost: null,
  vendor: null,
  vendorPartNumber: null,
  lastCost: null,
  moq: null,
  leadTimeDays: null,
  stockByLocation: {},
  onOrder: 0,
  openPos: [],
  lastPoCost: null,
  lastPoDate: null,
  lastPoVendor: null,
  ...p,
});

describe("whereUsed", () => {
  it("lists every product a shared component goes into", () => {
    const wu = whereUsed(boms);
    expect(wu.get("BOTTLE")).toEqual(["LOTION_A", "LOTION_B"]);
    expect(wu.get("LOTION_A")).toEqual(["TESTER_A"]);
  });
});

describe("buildable", () => {
  it("is limited by the scarcest component, and names it", () => {
    const b = buildable("LOTION_A", boms, supplyOf({ BOTTLE: 100, PUMP: 40, FILL_A: 90, SHIPPER: 50 }));
    expect(b).toEqual({ units: 40, bottleneck: "PUMP" });
  });

  it("converts fractional lines (a shipper per 6 units)", () => {
    const b = buildable("LOTION_A", boms, supplyOf({ BOTTLE: 100, PUMP: 100, FILL_A: 100, SHIPPER: 5 }));
    expect(b).toEqual({ units: 30, bottleneck: "SHIPPER" });
  });

  it("drills through a sub-assembly: stock plus what it could be built into", () => {
    const b = buildable(
      "TESTER_A",
      boms,
      supplyOf({ LOTION_A: 5, TRYME: 100, BOTTLE: 10, PUMP: 10, FILL_A: 10, SHIPPER: 10 }),
    );
    expect(b.units).toBe(15); // 5 on hand + 10 buildable
  });

  it("is 0 for a part with no BOM", () => {
    expect(buildable("BOTTLE", boms, supplyOf({ BOTTLE: 99 })).units).toBe(0);
  });
});

describe("lowLevelCodes", () => {
  it("puts a component below every parent that uses it", () => {
    const llc = lowLevelCodes(boms);
    expect(llc.get("TESTER_A")).toBe(0);
    expect(llc.get("LOTION_A")).toBe(1);
    expect(llc.get("BOTTLE")).toBe(2); // via TESTER_A → LOTION_A
  });
});

describe("planRequirements", () => {
  it("adds up a shared component across planned products before netting", () => {
    const req = planRequirements(
      boms,
      new Map([["LOTION_A", 100], ["LOTION_B", 50]]),
      supplyOf({ BOTTLE: 120, PUMP: 200, FILL_A: 100, FILL_B: 50, SHIPPER: 100 }),
    );
    const bottle = req.get("BOTTLE")!;
    expect(bottle.needed).toBe(150);
    expect(bottle.short).toBe(30);
    expect(bottle.usedBy).toEqual(["LOTION_A", "LOTION_B"]);
    expect(req.get("PUMP")!.short).toBe(0);
    expect(req.get("SHIPPER")!.needed).toBeCloseTo(25);
  });

  it("uses a sub-assembly's stock first and only makes the rest", () => {
    const req = planRequirements(
      boms,
      new Map([["TESTER_A", 30]]),
      supplyOf({ LOTION_A: 20, TRYME: 30, BOTTLE: 0, PUMP: 0, FILL_A: 0, SHIPPER: 0 }),
    );
    const lotion = req.get("LOTION_A")!;
    expect(lotion.needed).toBe(30);
    expect(lotion.fromSupply).toBe(20);
    expect(lotion.make).toBe(10);
    expect(req.get("BOTTLE")!.short).toBe(10);
    expect(req.get("BOTTLE")!.usedBy).toEqual(["TESTER_A"]);
  });

  it("makes a planned product in full even when it is also a sub-assembly", () => {
    const req = planRequirements(
      boms,
      new Map([["LOTION_A", 40], ["TESTER_A", 10]]),
      supplyOf({ LOTION_A: 0, TRYME: 10 }),
    );
    expect(req.get("LOTION_A")!.make).toBe(50); // 40 planned + 10 for testers
    expect(req.get("BOTTLE")!.needed).toBe(50);
  });
});

describe("suggestedBuy", () => {
  it("rounds up to whole units and to the vendor minimum", () => {
    expect(suggestedBuy(0, 500)).toBe(0);
    expect(suggestedBuy(12.2, null)).toBe(13);
    expect(suggestedBuy(120, 500)).toBe(500);
    expect(suggestedBuy(800, 500)).toBe(800);
  });
});

describe("usableStock", () => {
  const p = part({ part: "X", stockByLocation: { Kapra: 100, "Point B Solutions": 50, "Amazon Warehouse": 30 } });
  it("counts the fillers and Point B, never Amazon", () => {
    expect(usableStock(p, null)).toBe(150);
  });
  it("swaps Fishbowl's Point B figure for Point B's own", () => {
    expect(usableStock(p, 20)).toBe(120);
  });
});

describe("materialCost", () => {
  it("rolls costs up through sub-assemblies and flags parts with no cost", () => {
    const parts = {
      BOTTLE: part({ part: "BOTTLE", lastCost: 0.3 }),
      PUMP: part({ part: "PUMP", avgCost: 0.16 }),
      FILL_A: part({ part: "FILL_A", lastCost: 2 }),
      SHIPPER: part({ part: "SHIPPER", lastCost: 0.6 }),
      TRYME: part({ part: "TRYME" }),
    };
    const lotion = materialCost("LOTION_A", boms, parts);
    expect(lotion.cost).toBeCloseTo(0.3 + 0.16 + 2 + 0.1);
    const tester = materialCost("TESTER_A", boms, parts);
    expect(tester.cost).toBeCloseTo(lotion.cost);
    expect(tester.missing).toEqual(["TRYME"]);
  });
});

describe("orderUrgency", () => {
  const base = { stockAnywhere: 100, onOrder: 0 };
  it("flags a part with no stock anywhere and nothing on order to check first", () => {
    expect(orderUrgency({ coverMonths: 0.2, leadTimeDays: 30, stockAnywhere: 0, onOrder: 0 }).urgency).toBe("check");
    expect(orderUrgency({ coverMonths: 0.2, leadTimeDays: 30, stockAnywhere: 0, onOrder: 50 }).urgency).toBe("now");
  });
  it("orders now when the products run out before the part could arrive and be filled", () => {
    // 70 + 14 days = 2.8 months; 3 months of cover leaves 0.2 slack
    expect(orderUrgency({ coverMonths: 3, leadTimeDays: 70, ...base }).urgency).toBe("now");
  });
  it("is 'soon' with under two months of slack, 'later' beyond", () => {
    expect(orderUrgency({ coverMonths: 3, leadTimeDays: 30, ...base }).urgency).toBe("soon");
    expect(orderUrgency({ coverMonths: 6, leadTimeDays: 30, ...base }).urgency).toBe("later");
  });
  it("assumes 8 weeks when Fishbowl has no lead time, and says so", () => {
    const u = orderUrgency({ coverMonths: 4, leadTimeDays: null, ...base });
    expect(u.leadAssumed).toBe(true);
    expect(u.leadDays).toBe(56);
  });
});

describe("awayFromFiller", () => {
  it("lists stock that has to be sent to Kapra, ignoring Amazon and Point B", () => {
    const p = part({ part: "X", stockByLocation: { "Kapra Cosmetics": 10, FMG: 800, "Amazon Warehouse": 5, "Point B Solutions": 3 } });
    expect(awayFromFiller(p)).toEqual([{ location: "FMG", qty: 800 }]);
  });
});

describe("fill", () => {
  it("is never 'check first' — zero stock is normal for Kapra's goop", () => {
    expect(orderUrgency({ coverMonths: 1, leadTimeDays: 14, stockAnywhere: 0, onOrder: 0, madeToOrder: true }).urgency).toBe("now");
  });
  it("is recognised by description and ordered from Kapra when no vendor is set", () => {
    const f = part({ part: "F", description: "FILL Hand + Body Lotion 12oz SEA SALT" });
    expect(isFill(f)).toBe(true);
    expect(vendorFor(f)).toBe("Kapra Cosmetics");
    expect(isFill(part({ part: "M", description: "Mini Body Butter fill FRAGRANCE FREE 2oz" }))).toBe(true);
    expect(vendorFor(part({ part: "B", description: "BOTTLE 12oz" }))).toBeNull();
  });
});

describe("bomFamilies", () => {
  const fam = (boms2: Boms, parts2: Record<string, BomPart>, prods: { part: string; line: string }[]) =>
    bomFamilies(boms2, parts2, prods).map((f) => f.parts).sort((a, b) => a[0].localeCompare(b[0]));

  it("links products that share a real ingredient, through sub-assemblies", () => {
    const parts2 = { BOTTLE: part({ part: "BOTTLE", description: "BOTTLE 12oz" }) };
    expect(
      fam(boms, parts2, [
        { part: "LOTION_A", line: "Lotion" },
        { part: "LOTION_B", line: "Wash" },
        { part: "TESTER_A", line: "Lotion" },
      ]),
    ).toEqual([["LOTION_A", "LOTION_B", "TESTER_A"]]);
  });

  it("never links on packaging, but does on the same product line", () => {
    const b2: Boms = {
      MIST: { bomNum: "M", lines: [line("SPRAY"), line("SHIP")] },
      GEL: { bomNum: "G", lines: [line("GELBOTTLE"), line("SHIP")] },
      GEL_T: { bomNum: "GT", lines: [line("GELTUBE"), line("TRYME")] },
      MIST_T: { bomNum: "MT", lines: [line("MISTVIAL"), line("TRYME")] },
    };
    const p2 = {
      SHIP: part({ part: "SHIP", description: "SHIPPER 6 x 4" }),
      TRYME: part({ part: "TRYME", description: 'LABEL Tester Label printed "TRY ME"' }),
    };
    expect(
      fam(b2, p2, [
        { part: "MIST", line: "Fragrance Mist" },
        { part: "GEL", line: "Bath Gel" },
        { part: "GEL_T", line: "Bath Gel" },
        { part: "MIST_T", line: "Fragrance Mist" },
      ]),
    ).toEqual([["GEL", "GEL_T"], ["MIST", "MIST_T"]]);
  });

  it("names a family by its product lines, biggest first", () => {
    const f = bomFamilies(boms, {}, [
      { part: "LOTION_A", line: "Lotion" },
      { part: "LOTION_B", line: "Lotion" },
      { part: "TESTER_A", line: "Tester Lotion" },
    ]);
    expect(f[0].lines[0]).toBe("Lotion");
  });
});

describe("ordering rules", () => {
  const p = part({ part: "F", moq: 100, lastPoCost: 1.5, lastPoDate: "2026-07-16", lastCost: 1.2, avgCost: 1.1 });
  it("prices from a typed price, then the last PO, then the vendor, then average", () => {
    expect(priceFor(p, { part: "F", min_qty: null, multiple: null, unit_price: 1.7, lead_days: null, note: null }).source).toBe("you");
    expect(priceFor(p)).toEqual({ price: 1.5, source: "last PO", date: "2026-07-16" });
    expect(priceFor(part({ part: "G", lastCost: 1.2 })).source).toBe("vendor");
    expect(priceFor(part({ part: "H" })).price).toBeNull();
  });

  it("orders at least the ingredient's minimum, else the vendor's per-item minimum, rounded to a multiple", () => {
    const vend = { vendor: "Kapra", min_run_qty: 3000, item_min_qty: 500, lead_days: null, note: null };
    expect(orderQty(0, p, undefined, vend)).toBe(0);
    expect(orderQty(120, p, undefined, vend)).toBe(500);
    expect(orderQty(120, p)).toBe(120 > 100 ? 120 : 100);
    expect(orderQty(120, p, { part: "F", min_qty: 200, multiple: 48, unit_price: null, lead_days: null, note: null }, vend)).toBe(240);
  });

  it("tops a run up to the vendor minimum, split by need", () => {
    const extra = topUpToRun(
      [
        { part: "SEA", buy: 500, weight: 3 },
        { part: "LAV", buy: 500, weight: 1 },
      ],
      3000,
    );
    expect(extra.get("SEA")).toBe(1500);
    expect(extra.get("LAV")).toBe(500);
    expect(topUpToRun([{ part: "X", buy: 4000, weight: 1 }], 3000).size).toBe(0);
  });

  it("never lands below the run minimum, even with multiples", () => {
    const extra = topUpToRun(
      [
        { part: "A", buy: 100, weight: 1, multiple: 48 },
        { part: "B", buy: 100, weight: 1, multiple: 48 },
      ],
      1000,
    );
    const total = 200 + [...extra.values()].reduce((s, n) => s + n, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
    expect((extra.get("A") ?? 0) % 48).toBe(0);
  });

  it("takes lead time from the ingredient, then the vendor, then Fishbowl", () => {
    const fb = part({ part: "L", leadTimeDays: 70 });
    expect(leadDaysFor(fb)).toBe(70);
    expect(leadDaysFor(fb, undefined, { vendor: "V", min_run_qty: null, item_min_qty: null, lead_days: 30, note: null })).toBe(30);
  });
});
